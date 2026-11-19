"""PostgreSQL operations for opaque application sessions, never bearer strings."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.session_security import ABSOLUTE_SESSION_LIFETIME, IDLE_SESSION_LIFETIME
from app.db.models.app_session import AppSession
from app.db.models.user import User


def insert_session(
    db: Session,
    *,
    user_id: UUID,
    token_hash: bytes,
    csrf_hash: bytes,
    now: datetime,
    previous_hash: bytes | None,
) -> None:
    if previous_hash is not None:
        db.execute(
            update(AppSession)
            .where(
                AppSession.token_hash == previous_hash,
                AppSession.revoked_at.is_(None),
            )
            .values(revoked_at=now)
        )
    db.add(
        AppSession(
            user_id=user_id,
            token_hash=token_hash,
            csrf_hash=csrf_hash,
            created_at=now,
            expires_at=now + ABSOLUTE_SESSION_LIFETIME,
            last_seen_at=now,
        )
    )


def locked_session(db: Session, token_hash: bytes) -> tuple[AppSession, User] | None:
    row = db.execute(
        select(AppSession, User)
        .join(User, AppSession.user_id == User.id)
        .where(AppSession.token_hash == token_hash)
        .with_for_update(of=AppSession)
    ).one_or_none()
    return (row[0], row[1]) if row is not None else None


def revoke_session(
    db: Session, *, session_id: UUID, user_id: UUID, now: datetime
) -> bool:
    result = db.scalar(
        update(AppSession)
        .where(
            AppSession.id == session_id,
            AppSession.user_id == user_id,
            AppSession.revoked_at.is_(None),
            AppSession.created_at <= now,
            AppSession.expires_at > now,
            AppSession.last_seen_at > now - IDLE_SESSION_LIFETIME,
        )
        .values(revoked_at=now)
        .returning(AppSession.id)
    )
    return result is not None
