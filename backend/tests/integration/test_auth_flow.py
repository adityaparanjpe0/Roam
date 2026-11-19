"""OAuth through real library validation, PostgreSQL, cookies and session routes.

Only Google's HTTP boundary, environment and clocks are substituted. No route,
identity exchange, user repository or session service is mocked on success.
"""

import gzip
import json
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from authlib.oauth2.rfc7636 import create_s256_code_challenge
from fastapi.testclient import TestClient
from joserfc import jwt
from joserfc.jwk import RSAKey
from sqlalchemy import Engine, event, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import get_google_oidc_client
from app.api.sessions import get_session_settings
from app.core import session_security as security
from app.core.oauth_flow import LoginFlowStore
from app.db.models import AppSession, User
from app.main import app
from app.providers.google_oidc import GOOGLE_DISCOVERY_URL
from tests.integration.test_google_users import auth_database as auth_database
from tests.test_google_identity import signing_key as signing_key
from tests.test_oauth_config import ENVIRONMENT
from tests.test_oauth_login import METADATA, mock_discovery

pytestmark = pytest.mark.database
NOW = datetime(2030, 1, 1, tzinfo=UTC)


@dataclass
class GoogleStub:
    key: RSAKey
    now: list[datetime]
    attempts: dict[str, dict[str, list[str]]] = field(default_factory=dict)
    claims: dict[str, object] = field(default_factory=dict)
    failure: str | None = None
    exchanges: int = 0
    elapsed: list[float] = field(default_factory=lambda: [0.0])
    compressed: bool = False

    def json_response(self, payload: object) -> httpx.Response:
        if not self.compressed:
            return httpx.Response(200, json=payload)
        body = gzip.compress(json.dumps(payload).encode())
        return httpx.Response(
            200,
            headers={
                "Content-Type": "application/json",
                "Content-Encoding": "gzip",
                "Content-Length": str(len(body)),
            },
            stream=httpx.ByteStream(body),
        )

    def respond(self, request: httpx.Request) -> httpx.Response:
        if str(request.url) == GOOGLE_DISCOVERY_URL:
            return self.json_response(METADATA)
        if str(request.url) == METADATA["jwks_uri"]:
            return self.json_response({"keys": [self.key.as_dict(private=False)]})
        assert str(request.url) == METADATA["token_endpoint"]
        assert request.method == "POST"
        self.exchanges += 1
        payload = parse_qs(request.content.decode())
        attempt = self.attempts[payload["code"][0]]
        assert payload["grant_type"] == ["authorization_code"]
        assert payload["redirect_uri"] == attempt["redirect_uri"]
        assert (
            create_s256_code_challenge(payload["code_verifier"][0])
            == attempt["code_challenge"][0]
        )
        assert request.headers["authorization"].startswith("Basic ")
        if self.failure == "timeout":
            raise httpx.ReadTimeout("SYNTHETIC_PRIVATE", request=request)
        if self.failure == "exchange":
            return httpx.Response(400, json={"error": "invalid_grant"})
        claims = {
            "iss": "https://accounts.google.com",
            "sub": "stable-google-subject",
            "aud": ENVIRONMENT["GOOGLE_OIDC_CLIENT_ID"],
            "iat": int(self.now[0].timestamp()) - 60,
            "exp": int(self.now[0].timestamp()) + 600,
            "nonce": attempt["nonce"][0],
            "email": "Student@Example.COM",
            "email_verified": True,
            "name": "Student",
            **self.claims,
        }
        raw = jwt.encode({"alg": "RS256", "kid": self.key.kid}, claims, self.key)
        if self.failure == "signature":
            raw = jwt.encode(
                {"alg": "RS256", "kid": self.key.kid}, claims, RSAKey.generate_key(2048)
            )
        return self.json_response({"access_token": "synthetic-access", "id_token": raw})


@pytest.fixture
def google(
    auth_database: Engine, monkeypatch: pytest.MonkeyPatch, signing_key: RSAKey
) -> Iterator[GoogleStub]:
    for name, value in ENVIRONMENT.items():
        monkeypatch.setenv(name, value)
    for getter in (get_google_oidc_client, get_session_settings):
        getter.cache_clear()
    now = [NOW]
    monkeypatch.setattr("app.services.sessions.get_engine", lambda: auth_database)
    monkeypatch.setattr(security, "utc_now", lambda: now[0])
    monkeypatch.setattr("app.providers.google_oidc.time", lambda: now[0].timestamp())
    stub = GoogleStub(signing_key, now)
    store = LoginFlowStore(clock=lambda: stub.elapsed[0])
    monkeypatch.setattr("app.api.auth.get_login_flow_store", lambda: store)
    mock_discovery(monkeypatch, stub.respond)
    yield stub
    get_google_oidc_client.cache_clear()
    get_session_settings.cache_clear()


def start(browser: TestClient, google: GoogleStub) -> dict[str, str]:
    response = browser.get("/auth/google/start")
    assert response.status_code == 302
    destination = urlsplit(response.headers["location"])
    assert (
        destination.scheme == "https" and destination.hostname == "accounts.google.com"
    )
    query = parse_qs(destination.query)
    assert set(query["scope"][0].split()) == {"openid", "email", "profile"}
    assert query["code_challenge_method"] == ["S256"]
    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "Max-Age=600" in cookie and "Domain=" not in cookie
    assert ("Secure" in cookie) is (browser.base_url.scheme == "https")
    code = f"synthetic-code-{len(google.attempts)}"
    google.attempts[code] = query
    return {"state": query["state"][0], "code": code}


@pytest.mark.parametrize("case", ["missing", "mismatched", "expired", "denied"])
def test_bad_state_and_consent_denial_never_exchange_or_write(
    google: GoogleStub, auth_database: Engine, case: str
) -> None:
    with TestClient(
        app, base_url=ENVIRONMENT["APP_BASE_URL"], follow_redirects=False
    ) as browser:
        query = start(browser, google)
        if case == "missing":
            del query["state"]
        elif case == "mismatched":
            query["state"] = "wrong-state"
        elif case == "expired":
            google.elapsed[0] = 600.0
        else:
            del query["code"]
            query["error"] = "access_denied"
        response = browser.get("/auth/google/callback", params=query)
        assert response.status_code == 400
        expected = (
            "OAUTH_CONSENT_DENIED" if case == "denied" else "OAUTH_CALLBACK_INVALID"
        )
        assert response.json()["error"]["code"] == expected
        assert browser.cookies.get("roam_session") is None
    assert google.exchanges == 0
    with Session(auth_database) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
        assert db.scalar(select(func.count()).select_from(AppSession)) == 0


@pytest.mark.parametrize(
    "origin", [ENVIRONMENT["APP_BASE_URL"], "https://roam.example"]
)
@pytest.mark.parametrize("compressed", [False, True])
def test_verified_login_repeat_rotation_and_logout(
    google: GoogleStub,
    auth_database: Engine,
    monkeypatch: pytest.MonkeyPatch,
    origin: str,
    compressed: bool,
) -> None:
    google.compressed = compressed
    secure = origin.startswith("https:")
    prefix = "__Host-" if secure else ""
    monkeypatch.setenv("APP_ENV", "production" if secure else "test")
    monkeypatch.setenv("APP_BASE_URL", origin)
    monkeypatch.setenv("GOOGLE_OIDC_REDIRECT_URI", origin + "/auth/google/callback")
    with TestClient(app, base_url=origin, follow_redirects=False) as browser:
        assert browser.get("/api/auth/me").status_code == 401
        response = browser.get("/auth/google/callback", params=start(browser, google))
        assert (
            response.status_code == 303 and response.headers["location"] == origin + "/"
        )
        first = browser.cookies.get(prefix + "roam_session")
        assert first is not None
        for value in response.headers.get_list("set-cookie"):
            assert (
                "Domain=" not in value and "SameSite=lax" in value and "Path=/" in value
            )
            if "Max-Age=604800" in value:
                assert ("Secure" in value) is secure
                assert ("HttpOnly" in value) is (prefix + "roam_session=" in value)
        me = browser.get("/api/auth/me")
        assert me.status_code == 200
        profile = me.json()["user"]
        assert profile["email"] == "student@example.com"
        assert profile["display_name"] == "Student"
        assert first not in me.text and "synthetic-access" not in me.text
        google.claims.update(email="changed@example.com", name="Returning Student")
        repeated = browser.get("/auth/google/callback", params=start(browser, google))
        assert repeated.status_code == 303
        current = browser.get("/api/auth/me").json()["user"]
        assert current == {
            **profile,
            "email": "changed@example.com",
            "display_name": "Returning Student",
        }
        second = browser.cookies.get(prefix + "roam_session")
        csrf = browser.cookies.get(prefix + "roam_csrf")
        assert second is not None and csrf is not None and second != first
        with Session(auth_database) as db:
            assert db.scalar(select(func.count()).select_from(User)) == 1
            assert db.scalar(select(User.oidc_subject)) == "stable-google-subject"
            assert db.scalar(select(User.oidc_issuer)) == "https://accounts.google.com"
            assert db.scalar(select(func.count()).select_from(AppSession)) == 2
            old = db.scalar(
                select(AppSession).where(
                    AppSession.token_hash == security.token_hash(first)
                )
            )
            assert old is not None and old.revoked_at == NOW
        assert browser.post("/api/auth/logout").status_code == 403
        assert browser.get("/api/auth/me").status_code == 200
        logged_out = browser.post(
            "/api/auth/logout", headers={"Origin": origin, "X-CSRF-Token": csrf}
        )
        assert logged_out.status_code == 204
        assert all(
            "Max-Age=0" in value for value in logged_out.headers.get_list("set-cookie")
        )
        assert browser.get("/api/auth/me").status_code == 401
        browser.cookies.set(prefix + "roam_session", second)
        assert browser.get("/api/auth/me").status_code == 401
    assert google.exchanges == 2


@pytest.mark.parametrize(
    "failure,status",
    [
        ("nonce", 400),
        ("issuer", 400),
        ("audience", 400),
        ("expired", 400),
        ("signature", 400),
        ("unverified", 403),
        ("exchange", 400),
        ("timeout", 503),
    ],
)
def test_rejected_google_response_never_persists_identity_or_session(
    google: GoogleStub, auth_database: Engine, failure: str, status: int
) -> None:
    overrides = {
        "nonce": {"nonce": "wrong"},
        "issuer": {"iss": "https://attacker.example"},
        "audience": {"aud": "wrong-client"},
        "expired": {"exp": int(NOW.timestamp()) - 31},
        "unverified": {"email_verified": False},
    }
    google.claims.update(overrides.get(failure, {}))
    google.failure = failure
    with TestClient(
        app, base_url=ENVIRONMENT["APP_BASE_URL"], follow_redirects=False
    ) as browser:
        query = start(browser, google)
        rejected = browser.get("/auth/google/callback", params=query)
        assert rejected.status_code == status
        expected_code = {
            "timeout": "AUTH_UNAVAILABLE",
            "unverified": "EMAIL_NOT_VERIFIED",
        }.get(failure, "OAUTH_IDENTITY_INVALID")
        assert rejected.json()["error"]["code"] == expected_code
        assert "SYNTHETIC_PRIVATE" not in rejected.text
        assert browser.cookies.get("roam_session") is None
        assert browser.cookies.get("roam_csrf") is None
        assert browser.get("/api/auth/me").status_code == 401
        assert browser.get("/auth/google/callback", params=query).status_code == 400
    assert google.exchanges == 1
    with Session(auth_database) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
        assert db.scalar(select(func.count()).select_from(AppSession)) == 0


def test_commit_failure_rolls_back_verified_callback_and_issues_no_cookie(
    google: GoogleStub, auth_database: Engine
) -> None:
    def fail_commit(connection: object) -> None:
        raise SQLAlchemyError("SYNTHETIC_PRIVATE commit failure")

    with TestClient(
        app, base_url=ENVIRONMENT["APP_BASE_URL"], follow_redirects=False
    ) as browser:
        query = start(browser, google)
        event.listen(auth_database, "commit", fail_commit)
        try:
            response = browser.get("/auth/google/callback", params=query)
        finally:
            event.remove(auth_database, "commit", fail_commit)
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
        assert "SYNTHETIC_PRIVATE" not in response.text
        assert browser.cookies.get("roam_session") is None
        assert browser.get("/api/auth/me").status_code == 401
    assert google.exchanges == 1
    with Session(auth_database) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
        assert db.scalar(select(func.count()).select_from(AppSession)) == 0


def test_idle_expiry_after_real_callback_clears_browser_credentials(
    google: GoogleStub,
) -> None:
    with TestClient(
        app, base_url=ENVIRONMENT["APP_BASE_URL"], follow_redirects=False
    ) as browser:
        assert (
            browser.get(
                "/auth/google/callback", params=start(browser, google)
            ).status_code
            == 303
        )
        assert browser.get("/api/auth/me").status_code == 200
        google.now[0] += timedelta(hours=24)
        expired = browser.get("/api/auth/me")
        assert expired.status_code == 401
        assert expired.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
        assert browser.cookies.get("roam_session") is None
        assert browser.cookies.get("roam_csrf") is None
