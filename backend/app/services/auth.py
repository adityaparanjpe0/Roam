"""Persist an already-verified identity; no provider I/O or app session here."""

from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import DatabaseConfigurationError
from app.db.session import get_engine
from app.db.user_repository import upsert_identity
from app.domain.identity import VerifiedIdentity


class UserPersistenceUnavailable(ValueError):
    """Public boundary omits SQL, connection details, and profile data."""


def save_verified_user(identity: VerifiedIdentity) -> UUID:
    try:
        with Session(get_engine()) as session, session.begin():
            return upsert_identity(session, identity)
    except (DatabaseConfigurationError, SQLAlchemyError):
        raise UserPersistenceUnavailable("Cannot save profile right now.") from None
