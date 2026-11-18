"""Real Authlib initiation, with all HTTP replaced by an isolated transport."""

from collections.abc import Iterator
from hashlib import sha256
from itertools import count
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from authlib.oauth2.rfc7636 import create_s256_code_challenge
from fastapi.testclient import TestClient

from app.api.auth import get_google_oidc_client, get_login_flow_store
from app.api.sessions import get_session_settings
from app.core.oauth_flow import LoginFlowStore
from app.main import app
from app.providers.google_oidc import GOOGLE_DISCOVERY_URL
from tests.test_oauth_config import ENVIRONMENT

METADATA: dict[str, object] = {
    "issuer": "https://accounts.google.com",
    "authorization_endpoint": "https://accounts.google.com/o/oauth2/v2/auth",
    "token_endpoint": "https://oauth2.googleapis.com/token",
    "jwks_uri": "https://www.googleapis.com/oauth2/v3/certs",
    "response_types_supported": ["code"],
    "scopes_supported": ["openid", "email", "profile"],
    "code_challenge_methods_supported": ["S256"],
}


@pytest.fixture(autouse=True)
def isolated_oauth(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    get_google_oidc_client.cache_clear()
    get_login_flow_store.cache_clear()
    get_session_settings.cache_clear()
    for name, value in ENVIRONMENT.items():
        monkeypatch.setenv(name, value)
    sequence = count()

    def deterministic_token(length: int = 30) -> str:
        return str(next(sequence)).zfill(length)

    monkeypatch.setattr("app.api.auth.generate_token", deterministic_token)
    monkeypatch.setattr("app.providers.google_oidc.generate_token", deterministic_token)

    # HTTPX TestClient uses ASGITransport, not HTTPTransport. This denies any
    # accidental outbound requests while leaving in-process requests usable.
    def deny_network(*args: object, **kwargs: object) -> None:
        raise AssertionError("Unexpected live HTTP request")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", deny_network)
    yield
    get_google_oidc_client.cache_clear()
    get_login_flow_store.cache_clear()
    get_session_settings.cache_clear()


@pytest.fixture
def discovery(monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert str(request.url) == GOOGLE_DISCOVERY_URL
        assert request.method == "GET"
        assert "authorization" not in request.headers
        assert "cookie" not in request.headers
        return httpx.Response(200, json=METADATA)

    mock_discovery(monkeypatch, respond)
    return requests


def mock_discovery(monkeypatch: pytest.MonkeyPatch, handler: object) -> None:
    real_client = httpx.Client

    def factory(**kwargs: object) -> httpx.Client:
        assert kwargs["timeout"] == 5.0
        assert kwargs["follow_redirects"] is False
        assert kwargs["trust_env"] is False
        return real_client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr("app.providers.google_oidc.httpx.Client", factory)


def test_redirect_and_private_server_flow(discovery: list[httpx.Request]) -> None:
    with TestClient(app) as browser:
        response = browser.get("/auth/google/start", follow_redirects=False)
        assert response.status_code == 302
        url = urlsplit(response.headers["location"])
        query = parse_qs(url.query)
        assert url.scheme == "https" and url.hostname == "accounts.google.com"
        assert query["response_type"] == ["code"]
        assert query["client_id"] == [ENVIRONMENT["GOOGLE_OIDC_CLIENT_ID"]]
        assert query["scope"] == ["openid email profile"]
        assert query["redirect_uri"] == [ENVIRONMENT["GOOGLE_OIDC_REDIRECT_URI"]]
        assert query["code_challenge_method"] == ["S256"]
        assert len(query["state"][0]) == 48
        assert len(query["nonce"][0]) == 48
        assert "client_secret" not in query and "code_verifier" not in query
        assert "access_type" not in query and "token" not in query
        cookie = response.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=lax" in cookie
        assert "Max-Age=600" in cookie and "Path=/" in cookie
        assert "Secure" not in cookie and "Domain=" not in cookie
        binding = browser.cookies.get("roam_oauth")
        assert binding is not None
        flow = get_login_flow_store()._pending[sha256(binding.encode()).digest()]
        assert flow.state == query["state"][0]
        assert flow.nonce == query["nonce"][0]
        assert flow.redirect_uri == ENVIRONMENT["GOOGLE_OIDC_REDIRECT_URI"]
        assert query["code_challenge"] == [
            create_s256_code_challenge(flow.code_verifier)
        ]
        for value in (flow.state, flow.nonce, flow.code_verifier):
            assert value not in cookie
        assert flow.code_verifier not in response.headers["location"]
        assert ENVIRONMENT["GOOGLE_OIDC_CLIENT_SECRET"] not in str(response.headers)
        assert response.headers["cache-control"] == "no-store"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.content == b""
    assert len(discovery) == 1


def test_restart_login_replaces_browser_flow_and_caches_metadata(
    discovery: list[httpx.Request],
) -> None:
    with TestClient(app) as browser:
        first = browser.get("/auth/google/start", follow_redirects=False)
        second = browser.get("/auth/google/start", follow_redirects=False)
    q1 = parse_qs(urlsplit(first.headers["location"]).query)
    q2 = parse_qs(urlsplit(second.headers["location"]).query)
    assert q1["state"] != q2["state"] and q1["nonce"] != q2["nonce"]
    assert q1["code_challenge"] != q2["code_challenge"]
    assert len(get_login_flow_store()._pending) == 1
    assert len(discovery) == 1


def test_discovery_refreshes_after_cache_expiry(
    monkeypatch: pytest.MonkeyPatch, discovery: list[httpx.Request]
) -> None:
    now = [0.0]
    monkeypatch.setattr("app.providers.google_oidc.monotonic", lambda: now[0])
    with TestClient(app) as browser:
        assert (
            browser.get("/auth/google/start", follow_redirects=False).status_code == 302
        )
        now[0] = 3600.0
        assert (
            browser.get("/auth/google/start", follow_redirects=False).status_code == 302
        )
    assert len(discovery) == 2


def test_flow_from_different_browser_is_not_removed(
    discovery: list[httpx.Request],
) -> None:
    with TestClient(app) as first:
        first.get("/auth/google/start", follow_redirects=False)
    first_key = next(iter(get_login_flow_store()._pending))
    with TestClient(app) as second:
        second.cookies.set("roam_oauth", "invented-binding")
        second.get("/auth/google/start", follow_redirects=False)
    assert first_key in get_login_flow_store()._pending
    assert len(get_login_flow_store()._pending) == 2


def test_separate_browsers_get_independent_flows(
    discovery: list[httpx.Request],
) -> None:
    for _ in range(2):
        with TestClient(app) as browser:
            assert (
                browser.get("/auth/google/start", follow_redirects=False).status_code
                == 302
            )
    assert len(get_login_flow_store()._pending) == 2


def test_production_cookie_and_configured_redirect_ignore_host_header(
    monkeypatch: pytest.MonkeyPatch, discovery: list[httpx.Request]
) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("APP_BASE_URL", "https://roam.example")
    monkeypatch.setenv(
        "GOOGLE_OIDC_REDIRECT_URI", "https://roam.example/auth/google/callback"
    )
    with TestClient(app, base_url="https://roam.example") as browser:
        response = browser.get(
            "/auth/google/start",
            follow_redirects=False,
            headers={
                "Host": "attacker.example",
                "X-Forwarded-Host": "attacker.example",
            },
        )
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("__Host-roam_oauth=") and "Secure" in cookie
    assert "Domain=" not in cookie and "Path=/" in cookie
    assert "attacker.example" not in response.headers["location"]


def test_query_parameters_cannot_override_auth_parameters(
    discovery: list[httpx.Request],
) -> None:
    with TestClient(app) as browser:
        response = browser.get(
            "/auth/google/start?scope=mail&redirect_uri=https://attacker.example&state=fixed",
            follow_redirects=False,
        )
    query = parse_qs(urlsplit(response.headers["location"]).query)
    assert query["scope"] == ["openid email profile"]
    assert query["state"] != ["fixed"]
    assert query["redirect_uri"] == [ENVIRONMENT["GOOGLE_OIDC_REDIRECT_URI"]]


def test_missing_config_and_health_remain_safe(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("GOOGLE_OIDC_CLIENT_SECRET")
    with TestClient(app) as browser:
        assert browser.get("/health").json() == {"status": "ok"}
        response = browser.get("/auth/google/start", follow_redirects=False)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AUTH_NOT_CONFIGURED"
    assert "set-cookie" not in response.headers and "location" not in response.headers


@pytest.mark.parametrize(
    "metadata",
    [
        {**METADATA, "issuer": "https://attacker.example"},
        {**METADATA, "authorization_endpoint": "https://attacker.example/auth"},
        {**METADATA, "token_endpoint": "http://oauth2.googleapis.com/token"},
        {**METADATA, "jwks_uri": "https://attacker.example/keys"},
        {**METADATA, "response_types_supported": ["token"]},
        {**METADATA, "scopes_supported": ["openid"]},
        {**METADATA, "code_challenge_methods_supported": ["plain"]},
        [],
    ],
)
def test_invalid_discovery_fails_closed(
    monkeypatch: pytest.MonkeyPatch, metadata: object
) -> None:
    mock_discovery(monkeypatch, lambda _: httpx.Response(200, json=metadata))
    with TestClient(app) as browser:
        response = browser.get("/auth/google/start", follow_redirects=False)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "AUTH_UNAVAILABLE"
    assert "set-cookie" not in response.headers
    assert "attacker.example" not in response.text
    assert not get_login_flow_store()._pending


@pytest.mark.parametrize(
    "failure", ["timeout", "redirect", "error", "html", "large", "json"]
)
def test_discovery_transport_failure_is_sanitized(
    monkeypatch: pytest.MonkeyPatch, failure: str, caplog: pytest.LogCaptureFixture
) -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        if failure == "timeout":
            raise httpx.ReadTimeout("SENSITIVE-UPSTREAM-DETAIL", request=request)
        if failure == "redirect":
            return httpx.Response(302, headers={"location": "https://attacker.example"})
        if failure == "error":
            return httpx.Response(500, text="SENSITIVE-UPSTREAM-DETAIL")
        if failure == "html":
            return httpx.Response(200, text="SENSITIVE-UPSTREAM-DETAIL")
        body = "x" * 65537 if failure == "large" else "{bad-json"
        return httpx.Response(
            200, text=body, headers={"content-type": "application/json"}
        )

    mock_discovery(monkeypatch, respond)
    with TestClient(app) as browser:
        response = browser.get("/auth/google/start", follow_redirects=False)
    assert response.status_code == 503
    assert "set-cookie" not in response.headers
    assert "SENSITIVE-UPSTREAM-DETAIL" not in response.text + caplog.text


def test_missing_optional_pkce_metadata_still_uses_s256(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    metadata = dict(METADATA)
    metadata.pop("code_challenge_methods_supported")
    mock_discovery(monkeypatch, lambda _: httpx.Response(200, json=metadata))
    with TestClient(app) as browser:
        response = browser.get("/auth/google/start", follow_redirects=False)
    assert parse_qs(urlsplit(response.headers["location"]).query)[
        "code_challenge_method"
    ] == ["S256"]


def test_capacity_returns_429_without_eviction(
    monkeypatch: pytest.MonkeyPatch, discovery: list[httpx.Request]
) -> None:
    store = LoginFlowStore(capacity=1)
    monkeypatch.setattr("app.api.auth.get_login_flow_store", lambda: store)
    for expected in (302, 429):
        with TestClient(app) as browser:
            response = browser.get("/auth/google/start", follow_redirects=False)
        assert response.status_code == expected
    assert len(store._pending) == 1
    assert response.headers["retry-after"] == "600"
    assert "set-cookie" not in response.headers


def test_unapproved_legacy_session_path_is_absent() -> None:
    with TestClient(app) as browser:
        assert browser.get("/api/v1/me").status_code == 404
