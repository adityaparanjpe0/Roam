"""Small owner-scoped PostgreSQL queries; callers own transactions."""

from datetime import datetime
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.db.models.trip import Trip


def get_owned_trip(db: Session, *, owner_id: UUID, trip_id: UUID) -> Trip | None:
    return db.scalar(select(Trip).where(Trip.id == trip_id, Trip.owner_id == owner_id))


def list_owned_trips(
    db: Session,
    *,
    owner_id: UUID,
    limit: int,
    after: tuple[datetime, UUID] | None,
) -> list[Trip]:
    statement = select(Trip).where(Trip.owner_id == owner_id)
    if after is not None:
        timestamp, trip_id = after
        statement = statement.where(
            or_(
                Trip.updated_at < timestamp,
                and_(Trip.updated_at == timestamp, Trip.id > trip_id),
            )
        )
    statement = statement.order_by(Trip.updated_at.desc(), Trip.id.asc()).limit(
        limit + 1
    )
    return list(db.scalars(statement).all())
