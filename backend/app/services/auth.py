"""Persist verified identity and issue sessions after all provider I/O."""

from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core import session_security as security
from app.core.config import DatabaseConfigurationError
from app.db.session import get_engine
from app.db.session_repository import insert_session
from app.db.user_repository import upsert_identity
from app.domain.identity import VerifiedIdentity
from app.domain.session import IssuedSession


class UserPersistenceUnavailable(ValueError):
    """Public boundary omits SQL, connection details, and profile data."""


def save_verified_user(identity: VerifiedIdentity) -> UUID:
    try:
        with Session(get_engine()) as session, session.begin():
            return upsert_identity(session, identity)
    except (DatabaseConfigurationError, SQLAlchemyError):
        raise UserPersistenceUnavailable("Cannot save profile right now.") from None


def create_login_session(
    identity: VerifiedIdentity, previous_token: str | None
) -> IssuedSession:
    token, csrf = security.new_token(), security.new_token()
    try:
        previous_hash = security.token_hash(previous_token)
    except security.AuthenticationRequired:
        previous_hash = None
    try:
        with Session(get_engine()) as db, db.begin():
            user_id = upsert_identity(db, identity)
            now = security.utc_now()
            insert_session(
                db,
                user_id=user_id,
                token_hash=security.token_hash(token),
                csrf_hash=security.token_hash(csrf),
                now=now,
                previous_hash=previous_hash,
            )
            issued = IssuedSession(
                token, csrf, now + security.ABSOLUTE_SESSION_LIFETIME
            )
        return issued  # Bearer cookies are set only after this commit succeeds.
    except (DatabaseConfigurationError, SQLAlchemyError):
        raise UserPersistenceUnavailable("Cannot complete sign-in right now.") from None
