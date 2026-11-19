"""Validate/revoke sessions in short transactions; no OAuth/provider calls."""

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core import session_security as security
from app.core.config import DatabaseConfigurationError
from app.db.session import get_engine
from app.db.session_repository import locked_session, revoke_session
from app.domain.session import AuthenticatedSession, CurrentUser


class SessionsUnavailable(ValueError):
    """Safe database error boundary with no cookies, SQL, or configuration."""


def authenticate_session(
    token: str | None,
    *,
    unsafe: bool = False,
    csrf_cookie: str | None = None,
    csrf_header: str | None = None,
    trusted_origin: bool = False,
) -> AuthenticatedSession:
    digest = security.token_hash(token)  # Reject malformed input before database use.
    try:
        with Session(get_engine()) as db, db.begin():
            found = locked_session(db, digest)
            if found is None:
                raise security.AuthenticationRequired
            row, user = found
            now = security.utc_now()
            if (
                row.revoked_at is not None
                or row.created_at > now
                or row.expires_at <= now
                or row.last_seen_at <= now - security.IDLE_SESSION_LIFETIME
            ):
                raise security.AuthenticationRequired
            if unsafe:
                security.validate_csrf(
                    row.csrf_hash,
                    csrf_cookie,
                    csrf_header,
                    trusted_origin=trusted_origin,
                )
            # Row lock serializes this update with logout/rotation. Invalid/CSRF
            # rejected requests never touch idle activity or revive a session.
            row.last_seen_at = max(row.last_seen_at, now)
            return AuthenticatedSession(
                row.id, CurrentUser(user.id, user.email, user.display_name)
            )
    except (DatabaseConfigurationError, SQLAlchemyError):
        raise SessionsUnavailable("Session storage is unavailable.") from None


def logout_session(session: AuthenticatedSession) -> None:
    try:
        with Session(get_engine()) as db, db.begin():
            if not revoke_session(
                db,
                session_id=session.id,
                user_id=session.user.id,
                now=security.utc_now(),
            ):
                raise security.AuthenticationRequired
    except (DatabaseConfigurationError, SQLAlchemyError):
        raise SessionsUnavailable("Session storage is unavailable.") from None
