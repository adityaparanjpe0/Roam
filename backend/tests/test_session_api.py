"""Session routes and reusable dependencies with explicitly fake persistence."""

from collections.abc import Iterator
from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.api.sessions import (
    SessionHTTPError,
    get_current_user,
    get_session_settings,
    session_error_response,
    set_session_cookies,
)
from app.core.config import AppSettings
from app.core.session_security import AuthenticationRequired, token_hash, validate_csrf
from app.domain.session import AuthenticatedSession, CurrentUser, IssuedSession
from app.main import app
from app.services.sessions import SessionsUnavailable

BEARER = "a" * 43
CSRF = "b" * 43
ORIGIN = "http://127.0.0.1:5173"
USER = CurrentUser(UUID(int=1), "student@example.com", "Student")
AUTH = AuthenticatedSession(UUID(int=2), USER)


@pytest.fixture(autouse=True)
def session_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[list[AuthenticatedSession]]:
    get_session_settings.cache_clear()
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("APP_BASE_URL", ORIGIN)
    # Sessions must not depend on Google credentials or provider availability.
    monkeypatch.delenv("GOOGLE_OIDC_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_OIDC_CLIENT_SECRET", raising=False)
    revoked: list[AuthenticatedSession] = []

    def authenticate(token: str | None, **kwargs: object) -> AuthenticatedSession:
        token_hash(token)
        if token != BEARER:
            raise AuthenticationRequired
        if kwargs.get("unsafe"):
            validate_csrf(
                token_hash(CSRF),
                kwargs.get("csrf_cookie"),
                kwargs.get("csrf_header"),
                trusted_origin=bool(kwargs.get("trusted_origin")),
            )
        return AUTH

    monkeypatch.setattr("app.api.sessions.authenticate_session", authenticate)
    monkeypatch.setattr("app.api.sessions.logout_session", revoked.append)
    yield revoked
    get_session_settings.cache_clear()


def test_me_returns_only_safe_profile() -> None:
    with TestClient(app) as browser:
        browser.cookies.set("roam_session", BEARER)
        response = browser.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {
        "user": {"id": str(USER.id), "email": USER.email, "display_name": "Student"}
    }
    assert response.headers["cache-control"] == "no-store"
    assert BEARER not in response.text and CSRF not in response.text
    assert "set-cookie" not in response.headers


@pytest.mark.parametrize("name", ["roam_session", "roam_csrf"])
@pytest.mark.parametrize("spacing", [" =", "= ", "\t=\t"])
def test_cookie_parser_normalized_duplicates_are_rejected(
    name: str, spacing: str
) -> None:
    with TestClient(app) as browser:
        response = browser.get(
            "/api/auth/me",
            headers={
                "Cookie": (
                    f"roam_session={BEARER}; roam_csrf={CSRF}; {name}{spacing}{BEARER}"
                )
            },
        )
    assert response.status_code == 401


@pytest.mark.parametrize("operation", ["authenticate_session", "logout_session"])
def test_database_outage_has_safe_correlated_diagnostics(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture, operation: str
) -> None:
    def fail(*args: object, **kwargs: object) -> None:
        raise SessionsUnavailable("PRIVATE_DATABASE_DETAILS")

    monkeypatch.setattr(f"app.api.sessions.{operation}", fail)
    with TestClient(app) as browser:
        browser.cookies.set("roam_session", BEARER)
        browser.cookies.set("roam_csrf", CSRF)
        response = browser.post(
            "/api/auth/logout",
            headers={"Origin": ORIGIN, "X-CSRF-Token": CSRF, "X-Request-ID": "PRIVATE"},
        )
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    request_id = response.json()["error"]["request_id"]
    assert response.headers["x-request-id"] == request_id
    UUID(request_id)
    assert request_id in caplog.text and "DATABASE_UNAVAILABLE" in caplog.text
    assert "set-cookie" not in response.headers  # Outage is not confirmed logout.
    for private in ("PRIVATE", BEARER, CSRF, USER.email):
        assert private not in caplog.text + response.text


def test_foreign_origin_has_no_credentialed_cors_and_cannot_logout() -> None:
    with TestClient(app) as browser:
        browser.cookies.set("roam_session", BEARER)
        browser.cookies.set("roam_csrf", CSRF)
        preflight = browser.options(
            "/api/auth/logout",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "POST",
            },
        )
        mutation = browser.post(
            "/api/auth/logout",
            headers={"Origin": "https://attacker.example", "X-CSRF-Token": CSRF},
        )
        read = browser.get(
            "/api/auth/me", headers={"Origin": "https://attacker.example"}
        )
    assert preflight.status_code == 405
    assert mutation.status_code == 403
    for response in (preflight, mutation, read):
        assert "access-control-allow-origin" not in response.headers
        assert "access-control-allow-credentials" not in response.headers


@pytest.mark.parametrize("token", [None, "", "malformed", "ü" * 43, "z" * 43])
def test_missing_malformed_or_unknown_sessions_have_generic_401(
    token: str | None,
) -> None:
    with TestClient(app) as browser:
        if token is not None and not token.isascii():
            response = browser.get(
                "/api/auth/me",
                headers=[(b"cookie", b"roam_session=" + token.encode("latin1"))],
            )
        else:
            if token is not None:
                browser.cookies.set("roam_session", token)
            response = browser.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
    assert response.headers["cache-control"] == "no-store"
    assert all(
        "Max-Age=0" in cookie for cookie in response.headers.get_list("set-cookie")
    )


def test_logout_requires_csrf_and_revokes_before_clearing(
    session_environment: list,
) -> None:
    with TestClient(app) as browser:
        browser.cookies.set("roam_session", BEARER)
        browser.cookies.set("roam_csrf", CSRF)
        response = browser.post(
            "/api/auth/logout", headers={"Origin": ORIGIN, "X-CSRF-Token": CSRF}
        )
    assert response.status_code == 204 and response.content == b""
    assert session_environment == [AUTH]
    assert all(
        "Max-Age=0" in cookie for cookie in response.headers.get_list("set-cookie")
    )


@pytest.mark.parametrize(
    "headers",
    [
        {},
        {"Origin": ORIGIN},
        {"X-CSRF-Token": CSRF},
        {"Origin": "https://attacker.example", "X-CSRF-Token": CSRF},
        {"Origin": ORIGIN, "X-CSRF-Token": BEARER},
    ],
)
def test_logout_csrf_failure_never_calls_revocation(
    headers: dict[str, str], session_environment: list
) -> None:
    with TestClient(app) as browser:
        browser.cookies.set("roam_session", BEARER)
        browser.cookies.set("roam_csrf", CSRF)
        response = browser.post("/api/auth/logout", headers=headers)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "CSRF_FAILED"
    assert not session_environment
    assert "set-cookie" not in response.headers


def test_logout_accepts_same_origin_referer_fallback() -> None:
    with TestClient(app) as browser:
        browser.cookies.set("roam_session", BEARER)
        browser.cookies.set("roam_csrf", CSRF)
        assert (
            browser.post(
                "/api/auth/logout",
                headers={"Referer": ORIGIN + "/", "X-CSRF-Token": CSRF},
            ).status_code
            == 204
        )


@pytest.mark.parametrize(
    "headers",
    [
        [("Cookie", f"roam_session={BEARER}; roam_session={BEARER}")],
        [("Cookie", f"roam_session={BEARER}"), ("Cookie", f"roam_session={BEARER}")],
    ],
)
def test_ambiguous_bearer_cookies_are_rejected(headers: list[tuple[str, str]]) -> None:
    with TestClient(app) as browser:
        assert browser.get("/api/auth/me", headers=headers).status_code == 401


def test_reusable_current_user_dependency_protects_unsafe_routes() -> None:
    test_app = FastAPI()
    test_app.exception_handler(SessionHTTPError)(session_error_response)

    @test_app.post("/test-only-mutation")
    def change(user: CurrentUser = Depends(get_current_user)) -> dict[str, str]:
        return {"user_id": str(user.id)}

    with TestClient(test_app) as browser:
        browser.cookies.set("roam_session", BEARER)
        browser.cookies.set("roam_csrf", CSRF)
        assert browser.post("/test-only-mutation").status_code == 403
        assert browser.post(
            "/test-only-mutation", headers={"Origin": ORIGIN, "X-CSRF-Token": CSRF}
        ).json() == {"user_id": str(USER.id)}


@pytest.mark.parametrize(
    ("environment", "origin", "prefix", "secure"),
    [
        ("test", ORIGIN, "", False),
        ("production", "https://roam.example", "__Host-", True),
    ],
)
def test_cookie_policy(
    environment: str, origin: str, prefix: str, secure: bool
) -> None:
    from fastapi import Response

    settings = AppSettings.model_validate(
        {"app_env": environment, "app_base_url": origin}
    )
    response = Response()
    set_session_cookies(
        response,
        settings,
        IssuedSession(BEARER, CSRF, datetime(2030, 1, 8, tzinfo=UTC)),
    )
    bearer_cookie, csrf_cookie = response.headers.getlist("set-cookie")
    assert bearer_cookie.startswith(prefix + "roam_session=")
    assert csrf_cookie.startswith(prefix + "roam_csrf=")
    assert "HttpOnly" in bearer_cookie and "HttpOnly" not in csrf_cookie
    for cookie in (bearer_cookie, csrf_cookie):
        assert (
            "Domain=" not in cookie and "SameSite=lax" in cookie and "Path=/" in cookie
        )
        assert "Max-Age=604800" in cookie
        assert ("Secure" in cookie) is secure
