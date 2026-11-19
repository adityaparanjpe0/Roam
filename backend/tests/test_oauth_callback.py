"""Callback orchestration never authenticates a browser without app sessions."""

import asyncio
import logging
from collections.abc import Iterator
from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient
from starlette.types import Message, Scope
from uvicorn.protocols.utils import get_path_with_query_string

from app.api.auth import get_google_oidc_client
from app.core.auth_logging import RedactOAuthCallbackQuery
from app.core.oauth_flow import LoginFlowStore
from app.domain.identity import VerifiedIdentity
from app.domain.session import IssuedSession
from app.main import app
from app.providers.google_oidc import (
    EmailNotVerified,
    GoogleDiscoveryError,
    GoogleIdentityError,
)
from app.services.auth import UserPersistenceUnavailable
from tests.test_oauth_config import ENVIRONMENT
from tests.test_oauth_login import isolated_oauth as isolated_oauth

STATE = "synthetic-state"
BINDING = "synthetic-browser-binding"
IDENTITY = VerifiedIdentity(
    "https://accounts.google.com", "subject", "student@example.com", "Student"
)


@pytest.fixture
def callback(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[TestClient, list[str], list[VerifiedIdentity], list[float]]]:
    calls: list[str] = []
    saved: list[VerifiedIdentity] = []
    now = [0.0]
    store = LoginFlowStore(clock=lambda: now[0])
    store.save(
        BINDING,
        state=STATE,
        nonce="nonce",
        code_verifier="verifier",
        redirect_uri=ENVIRONMENT["GOOGLE_OIDC_REDIRECT_URI"],
        previous_browser_token=None,
    )
    monkeypatch.setattr("app.api.auth.get_login_flow_store", lambda: store)
    client = get_google_oidc_client()

    def exchange(code: str, flow: object) -> VerifiedIdentity:
        calls.append(code)
        return IDENTITY

    def persist(
        identity: VerifiedIdentity, previous_token: str | None
    ) -> IssuedSession:
        assert calls == ["synthetic-code"]  # Provider verification precedes DB work.
        saved.append(identity)
        return IssuedSession("a" * 43, "b" * 43, datetime(2030, 1, 8, tzinfo=UTC))

    monkeypatch.setattr(client, "exchange_identity", exchange)
    monkeypatch.setattr("app.api.auth.create_login_session", persist)
    with TestClient(app, follow_redirects=False) as browser:
        browser.cookies.set("roam_oauth", BINDING)
        yield browser, calls, saved, now


def test_callback_sets_session_cookies_only_after_success(callback: tuple) -> None:
    browser, calls, saved, _ = callback
    response = browser.get(
        "/auth/google/callback", params={"code": "synthetic-code", "state": STATE}
    )
    assert response.status_code == 303
    assert response.headers["location"] == ENVIRONMENT["APP_BASE_URL"] + "/"
    assert response.content == b""
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert saved == [IDENTITY] and calls == ["synthetic-code"]
    assert browser.cookies.get("roam_session") == "a" * 43
    assert browser.cookies.get("roam_csrf") == "b" * 43
    assert "subject" not in response.text and IDENTITY.email not in response.text
    assert browser.get("/api/v1/me").status_code == 404


@pytest.mark.parametrize("name", ["roam_oauth", "roam_session", "roam_csrf"])
def test_callback_rejects_ambiguous_cookies_before_exchange(
    callback: tuple, name: str
) -> None:
    browser, calls, saved, _ = callback
    browser.cookies.clear()
    response = browser.get(
        "/auth/google/callback",
        params={"code": "synthetic-code", "state": STATE},
        headers={"Cookie": f"roam_oauth={BINDING}; {name}=first; {name} =second"},
    )
    assert response.status_code == 400
    assert not calls and not saved


@pytest.mark.parametrize(
    "error,status,code",
    [
        ("access_denied", 400, "OAUTH_CONSENT_DENIED"),
        ("server_error", 503, "AUTH_UNAVAILABLE"),
        ("temporarily_unavailable", 503, "AUTH_UNAVAILABLE"),
        ("PRIVATE_UNKNOWN_ERROR", 400, "OAUTH_CALLBACK_INVALID"),
    ],
)
def test_provider_errors_are_classified_and_safely_logged(
    callback: tuple,
    caplog: pytest.LogCaptureFixture,
    error: str,
    status: int,
    code: str,
) -> None:
    browser, calls, saved, _ = callback
    caplog.set_level(logging.INFO, logger="roam.auth")
    response = browser.get(
        "/auth/google/callback",
        params={
            "state": STATE,
            "error": error,
            "error_description": "PRIVATE_TEXT",
            "error_uri": "https://attacker.example",
            "next": "https://attacker.example",
        },
        headers={"X-Request-ID": "PRIVATE_ID"},
    )
    assert response.status_code == status
    assert response.json()["error"]["code"] == code
    assert "location" not in response.headers
    request_id = response.json()["error"]["request_id"]
    assert response.headers["x-request-id"] == request_id
    records = [
        record.getMessage() for record in caplog.records if record.name == "roam.auth"
    ]
    assert records == [
        f"auth_failure code={code} status={status} request_id={request_id}"
    ]
    assert "PRIVATE" not in records[0] + response.text
    assert not calls and not saved
    browser.cookies.set("roam_oauth", BINDING)
    assert (
        browser.get(
            "/auth/google/callback", params={"code": "synthetic-code", "state": STATE}
        ).status_code
        == 400
    )


def test_redirect_ignores_host_headers_and_return_to_parameters(
    callback: tuple,
) -> None:
    browser, _, _, _ = callback
    response = browser.get(
        "/auth/google/callback",
        params={
            "code": "synthetic-code",
            "state": STATE,
            "next": "//attacker.example",
            "return_to": "https://attacker.example",
        },
        headers={
            "Host": "attacker.example",
            "X-Forwarded-Host": "attacker.example",
            "X-Forwarded-Proto": "http",
        },
    )
    assert response.status_code == 303
    assert response.headers["location"] == ENVIRONMENT["APP_BASE_URL"] + "/"


def test_consumed_callback_cannot_exchange_again(callback: tuple) -> None:
    browser, calls, saved, _ = callback
    query = {"code": "synthetic-code", "state": STATE}
    assert browser.get("/auth/google/callback", params=query).status_code == 303
    browser.cookies.set("roam_oauth", BINDING)
    assert browser.get("/auth/google/callback", params=query).status_code == 400
    assert calls == ["synthetic-code"] and saved == [IDENTITY]


@pytest.mark.parametrize("query", ["code=untrusted", "state=wrong&code=untrusted"])
def test_unbound_callback_cannot_destroy_pending_browser_flow(
    callback: tuple, query: str
) -> None:
    browser, calls, saved, _ = callback
    rejected = browser.get("/auth/google/callback?" + query)
    assert rejected.status_code == 400
    assert "set-cookie" not in rejected.headers
    assert not calls and not saved
    valid = browser.get(
        "/auth/google/callback", params={"state": STATE, "code": "synthetic-code"}
    )
    assert valid.status_code == 303
    assert calls == ["synthetic-code"] and saved == [IDENTITY]


@pytest.mark.parametrize(
    "query",
    [
        "code=synthetic-code",
        "state=wrong&code=synthetic-code",
        "state=synthetic-state",
        "state=synthetic-state&code=",
        "state=synthetic-state&code=a&code=b",
        "state=synthetic-state&state=synthetic-state&code=a",
        "state=synthetic-state&code=a&error=access_denied",
        "state=synthetic-state&code=a&iss=https://attacker.example",
        "state=synthetic-state&code=%00",
        "state=synthetic-state&code=" + "x" * 4097,
        "state=synthetic-state&code=a&extra=" + "x" * 8193,
    ],
)
def test_invalid_callbacks_do_not_call_google_or_database(
    callback: tuple, query: str
) -> None:
    browser, calls, saved, _ = callback
    response = browser.get("/auth/google/callback?" + query)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "OAUTH_CALLBACK_INVALID"
    assert not calls and not saved


@pytest.mark.parametrize("binding", [None, "other-browser", "x" * 129])
def test_missing_or_wrong_browser_binding(callback: tuple, binding: str | None) -> None:
    browser, calls, saved, _ = callback
    browser.cookies.clear()
    if binding is not None:
        browser.cookies.set("roam_oauth", binding)
    assert (
        browser.get(
            "/auth/google/callback", params={"state": STATE, "code": "synthetic-code"}
        ).status_code
        == 400
    )
    assert not calls and not saved


def test_expired_attempt(callback: tuple) -> None:
    browser, calls, saved, now = callback
    now[0] = 600.0
    assert (
        browser.get(
            "/auth/google/callback", params={"state": STATE, "code": "synthetic-code"}
        ).status_code
        == 400
    )
    assert not calls and not saved


def test_denied_consent_consumes_flow_without_reflecting_provider_text(
    callback: tuple,
) -> None:
    browser, calls, saved, _ = callback
    response = browser.get(
        "/auth/google/callback",
        params={
            "state": STATE,
            "error": "access_denied",
            "error_description": "SENSITIVE",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "OAUTH_CONSENT_DENIED"
    assert "SENSITIVE" not in response.text
    browser.cookies.set("roam_oauth", BINDING)
    assert (
        browser.get(
            "/auth/google/callback", params={"state": STATE, "code": "synthetic-code"}
        ).status_code
        == 400
    )
    assert not calls and not saved


@pytest.mark.parametrize(
    ("error", "status"),
    [
        (GoogleIdentityError("SENSITIVE"), 400),
        (EmailNotVerified("SENSITIVE"), 403),
        (GoogleDiscoveryError("SENSITIVE"), 503),
    ],
)
def test_provider_failure_never_writes_profile(
    callback: tuple, monkeypatch: pytest.MonkeyPatch, error: Exception, status: int
) -> None:
    browser, calls, saved, _ = callback

    def fail(*args: object) -> None:
        raise error

    monkeypatch.setattr(get_google_oidc_client(), "exchange_identity", fail)
    response = browser.get(
        "/auth/google/callback", params={"state": STATE, "code": "synthetic-code"}
    )
    assert response.status_code == status
    assert "SENSITIVE" not in response.text
    assert not saved


def test_database_failure_does_not_issue_authentication(
    callback: tuple, monkeypatch: pytest.MonkeyPatch
) -> None:
    browser, calls, _, _ = callback

    def fail(identity: VerifiedIdentity, previous_token: str | None) -> None:
        raise UserPersistenceUnavailable("SENSITIVE")

    monkeypatch.setattr("app.api.auth.create_login_session", fail)
    response = browser.get(
        "/auth/google/callback", params={"state": STATE, "code": "synthetic-code"}
    )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert "SENSITIVE" not in response.text
    assert all(
        "Max-Age=0" in cookie for cookie in response.headers.get_list("set-cookie")
    )
    assert calls == ["synthetic-code"]


@pytest.mark.parametrize("path", ["/auth/google/callback", "/auth/google/callback/"])
def test_asgi_scope_used_by_uvicorn_does_not_contain_callback_query(path: str) -> None:
    scope: Scope = {
        "type": "http",
        "path": path,
        "root_path": "",
        "query_string": b"code=SENSITIVE&state=private",
        "state": {},
    }
    messages: list[Message] = []

    async def downstream(inner: Scope, receive: object, send: object) -> None:
        assert inner["state"]["oauth_callback_query"] == b"code=SENSITIVE&state=private"
        assert "SENSITIVE" not in get_path_with_query_string(inner)

    async def receive() -> Message:
        return {"type": "http.request", "body": b""}

    async def send(message: Message) -> None:
        messages.append(message)

    asyncio.run(RedactOAuthCallbackQuery(downstream)(scope, receive, send))
    assert scope["query_string"] == b""
