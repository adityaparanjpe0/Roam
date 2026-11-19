"""Real PostgreSQL session lifecycle and HTTP behavior with no Google requests."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Event

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, delete, func, select, text, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.auth import get_google_oidc_client, get_login_flow_store
from app.api.sessions import get_session_settings
from app.core import session_security as security
from app.core.oauth_flow import LoginFlowStore
from app.db.models import AppSession, User
from app.db.session_repository import insert_session, locked_session
from app.domain.identity import VerifiedIdentity
from app.main import app
from app.services.auth import UserPersistenceUnavailable, create_login_session
from app.services.sessions import authenticate_session
from tests.integration.test_google_users import auth_database as auth_database
from tests.test_oauth_config import ENVIRONMENT

pytestmark = pytest.mark.database
NOW = datetime(2030, 1, 1, tzinfo=UTC)
IDENTITY = VerifiedIdentity(
    "https://accounts.google.com", "subject", "student@example.com", "Student"
)
ORIGIN = ENVIRONMENT["APP_BASE_URL"]


@pytest.fixture(autouse=True)
def setup_session_environment(
    auth_database: Engine, monkeypatch: pytest.MonkeyPatch
) -> Iterator[list[datetime]]:
    for name, value in ENVIRONMENT.items():
        monkeypatch.setenv(name, value)
    get_session_settings.cache_clear()
    get_google_oidc_client.cache_clear()
    monkeypatch.setattr("app.api.auth._login_flow_store", LoginFlowStore())
    monkeypatch.setattr("app.services.sessions.get_engine", lambda: auth_database)
    now = [NOW]
    monkeypatch.setattr(security, "utc_now", lambda: now[0])
    yield now
    get_session_settings.cache_clear()
    get_google_oidc_client.cache_clear()


def browser_with(token: str, csrf: str | None = None) -> TestClient:
    browser = TestClient(app, base_url=ORIGIN, follow_redirects=False)
    browser.cookies.set("roam_session", token, domain="127.0.0.1")
    if csrf is not None:
        browser.cookies.set("roam_csrf", csrf, domain="127.0.0.1")
    return browser


def test_creation_stores_only_hashes_and_me_returns_safe_profile(
    auth_database: Engine,
) -> None:
    issued = create_login_session(IDENTITY, None)
    with Session(auth_database) as db:
        row = db.scalar(select(AppSession))
        assert row is not None
        assert len(row.token_hash) == 32 and len(row.csrf_hash) == 32
        assert row.token_hash == security.token_hash(issued.token)
        assert row.csrf_hash == security.token_hash(issued.csrf_token)
        assert row.created_at == NOW and row.last_seen_at == NOW
        assert row.expires_at == NOW + timedelta(days=7)
        assert db.get(User, row.user_id).oidc_subject == IDENTITY.subject
        assert (
            "token" not in AppSession.__table__.columns
            and "csrf_token" not in AppSession.__table__.columns
        )
    with browser_with(issued.token) as browser:
        response = browser.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json()["user"]["email"] == IDENTITY.email
    assert issued.token not in response.text and issued.csrf_token not in response.text
    assert set(response.json()) == {"user"}


@pytest.mark.parametrize(
    "condition", ["absolute", "idle", "revoked", "unknown", "malformed"]
)
def test_invalid_session_states_are_unauthorized(
    auth_database: Engine, condition: str
) -> None:
    issued = create_login_session(IDENTITY, None)
    token = issued.token
    with Session(auth_database) as db, db.begin():
        if condition == "absolute":
            db.execute(
                update(AppSession).values(
                    created_at=NOW - timedelta(days=8),
                    last_seen_at=NOW - timedelta(days=8),
                    expires_at=NOW - timedelta(days=1),
                )
            )
        elif condition == "idle":
            db.execute(
                update(AppSession).values(
                    created_at=NOW - timedelta(days=2),
                    last_seen_at=NOW - timedelta(hours=24),
                    expires_at=NOW + timedelta(days=5),
                )
            )
        elif condition == "revoked":
            db.execute(update(AppSession).values(revoked_at=NOW))
        elif condition == "unknown":
            token = "z" * 43
        else:
            token = "malformed"
    with browser_with(token) as browser:
        response = browser.get("/api/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"


def test_idle_refresh_never_extends_absolute_expiry(
    auth_database: Engine, setup_session_environment: list[datetime]
) -> None:
    issued = create_login_session(IDENTITY, None)
    with browser_with(issued.token) as browser:
        for hours in range(23, 168, 23):
            setup_session_environment[0] = NOW + timedelta(hours=hours)
            assert browser.get("/api/auth/me").status_code == 200
        setup_session_environment[0] = NOW + timedelta(days=7)
        assert browser.get("/api/auth/me").status_code == 401
    with Session(auth_database) as db:
        assert db.scalar(select(AppSession.expires_at)) == issued.expires_at


def test_logout_revokes_and_copied_cookie_cannot_be_replayed(
    auth_database: Engine,
) -> None:
    issued = create_login_session(IDENTITY, None)
    with browser_with(issued.token, issued.csrf_token) as browser:
        response = browser.post(
            "/api/auth/logout",
            headers={"Origin": ORIGIN, "X-CSRF-Token": issued.csrf_token},
        )
        assert response.status_code == 204 and not response.content
    with Session(auth_database) as db:
        assert db.scalar(select(AppSession.revoked_at)) == NOW
    with browser_with(issued.token, issued.csrf_token) as copied:
        assert copied.get("/api/auth/me").status_code == 401
        assert (
            copied.post(
                "/api/auth/logout",
                headers={"Origin": ORIGIN, "X-CSRF-Token": issued.csrf_token},
            ).status_code
            == 401
        )


def test_login_rotates_and_revokes_prior_browser_session(auth_database: Engine) -> None:
    first = create_login_session(IDENTITY, None)
    second = create_login_session(IDENTITY, first.token)
    assert first.token != second.token and first.csrf_token != second.csrf_token
    with browser_with(first.token) as browser:
        assert browser.get("/api/auth/me").status_code == 401
    with browser_with(second.token) as browser:
        assert browser.get("/api/auth/me").status_code == 200
    with Session(auth_database) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(func.count()).select_from(AppSession)) == 2


def test_csrf_is_bound_to_session_and_does_not_refresh_on_failure(
    auth_database: Engine, setup_session_environment: list[datetime]
) -> None:
    first = create_login_session(IDENTITY, None)
    second = create_login_session(IDENTITY, None)
    setup_session_environment[0] = NOW + timedelta(hours=1)
    with browser_with(first.token, second.csrf_token) as browser:
        assert (
            browser.post(
                "/api/auth/logout",
                headers={"Origin": ORIGIN, "X-CSRF-Token": second.csrf_token},
            ).status_code
            == 403
        )
    with Session(auth_database) as db:
        row = db.scalar(
            select(AppSession).where(
                AppSession.token_hash == security.token_hash(first.token)
            )
        )
        assert row.last_seen_at == NOW and row.revoked_at is None


def test_revoking_one_browser_does_not_revoke_another(auth_database: Engine) -> None:
    first = create_login_session(IDENTITY, None)
    second = create_login_session(IDENTITY, None)
    with browser_with(first.token, first.csrf_token) as browser:
        assert (
            browser.post(
                "/api/auth/logout",
                headers={"Origin": ORIGIN, "X-CSRF-Token": first.csrf_token},
            ).status_code
            == 204
        )
    with browser_with(second.token) as browser:
        assert browser.get("/api/auth/me").status_code == 200


def test_session_and_profile_rollback_together(
    auth_database: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    first = create_login_session(IDENTITY, None)

    def fail(db: Session, **kwargs: object) -> None:
        insert_session(db, **kwargs)
        db.flush()
        raise SQLAlchemyError("SENSITIVE")

    monkeypatch.setattr("app.services.auth.insert_session", fail)
    with pytest.raises(UserPersistenceUnavailable):
        create_login_session(
            VerifiedIdentity(
                IDENTITY.issuer, IDENTITY.subject, "changed@example.com", "Changed"
            ),
            first.token,
        )
    with Session(auth_database) as db:
        assert db.scalar(select(User.email)) == IDENTITY.email
        assert db.scalar(select(func.count()).select_from(AppSession)) == 1
        assert db.scalar(select(AppSession.revoked_at)) is None
    assert authenticate_session(first.token).user.email == IDENTITY.email


def test_user_deletion_cascades_sessions(auth_database: Engine) -> None:
    create_login_session(IDENTITY, None)
    with Session(auth_database) as db, db.begin():
        db.execute(delete(User))
    with Session(auth_database) as db:
        assert db.scalar(select(func.count()).select_from(AppSession)) == 0


@pytest.mark.parametrize(
    "field", ["token_hash", "csrf_hash", "expires_at", "last_seen_at", "revoked_at"]
)
def test_session_database_constraints(auth_database: Engine, field: str) -> None:
    create_login_session(IDENTITY, None)
    invalid = {
        "token_hash": b"short",
        "csrf_hash": b"short",
        "expires_at": NOW + timedelta(days=8),
        "last_seen_at": NOW - timedelta(seconds=1),
        "revoked_at": NOW - timedelta(seconds=1),
    }
    with Session(auth_database) as db:
        with pytest.raises(IntegrityError), db.begin():
            db.execute(update(AppSession).values(**{field: invalid[field]}))


def test_absolute_constraint_uses_hours_across_dst(auth_database: Engine) -> None:
    create_login_session(IDENTITY, None)
    spring = datetime(2030, 3, 8, tzinfo=UTC)
    with Session(auth_database) as db, db.begin():
        db.execute(text("SET LOCAL TIME ZONE 'America/New_York'"))
        db.execute(
            update(AppSession).values(
                created_at=spring,
                last_seen_at=spring,
                expires_at=spring + timedelta(hours=168),
            )
        )


def test_callback_commits_real_session_then_me_authenticates(
    auth_database: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = get_google_oidc_client()
    monkeypatch.setattr(client, "exchange_identity", lambda *args: IDENTITY)
    get_login_flow_store().save(
        "flow-binding",
        state="flow-state",
        nonce="nonce",
        code_verifier="verifier",
        redirect_uri=ENVIRONMENT["GOOGLE_OIDC_REDIRECT_URI"],
        previous_browser_token=None,
    )
    with TestClient(app, base_url=ORIGIN, follow_redirects=False) as browser:
        browser.cookies.set("roam_oauth", "flow-binding", domain="127.0.0.1")
        response = browser.get(
            "/auth/google/callback",
            params={"code": "synthetic-code", "state": "flow-state"},
        )
        assert response.status_code == 303
        bearer = browser.cookies.get("roam_session")
        csrf = browser.cookies.get("roam_csrf")
        assert bearer is not None and csrf is not None
        assert browser.get("/api/auth/me").status_code == 200
        assert (
            browser.post(
                "/api/auth/logout", headers={"Origin": ORIGIN, "X-CSRF-Token": csrf}
            ).status_code
            == 204
        )


def test_validation_waiting_on_logout_cannot_revive_session(
    auth_database: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    issued = create_login_session(IDENTITY, None)
    waiting = Event()

    def observe(db: Session, digest: bytes) -> object:
        waiting.set()
        return locked_session(db, digest)

    monkeypatch.setattr("app.services.sessions.locked_session", observe)
    with Session(auth_database) as db:
        row = db.scalar(select(AppSession).with_for_update())
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(authenticate_session, issued.token)
            assert waiting.wait(timeout=5)
            row.revoked_at = NOW
            db.commit()
            with pytest.raises(security.AuthenticationRequired):
                future.result(timeout=5)
    with Session(auth_database) as db:
        assert db.scalar(select(AppSession.revoked_at)) == NOW
        assert db.scalar(select(AppSession.last_seen_at)) == NOW
