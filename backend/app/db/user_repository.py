"""Atomic identity upsert; emails never select or merge accounts."""

from uuid import UUID

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models.user import User
from app.domain.identity import VerifiedIdentity


def upsert_identity(session: Session, identity: VerifiedIdentity) -> UUID:
    statement = insert(User).values(
        oidc_issuer=identity.issuer,
        oidc_subject=identity.subject,
        email=identity.email,
        display_name=identity.display_name,
    )
    returning_statement = statement.on_conflict_do_update(
        index_elements=[User.oidc_issuer, User.oidc_subject],
        set_={
            "email": statement.excluded.email,
            "display_name": func.coalesce(
                statement.excluded.display_name, User.display_name
            ),
            "updated_at": func.now(),
        },
    ).returning(User.id)
    user_id = session.scalar(returning_statement)
    if user_id is None:
        raise RuntimeError("Identity upsert returned no user")
    return user_id
