"""Short synchronous transactions; no provider calls or implicit commits."""

from uuid import UUID

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import DatabaseConfigurationError
from app.db.models.trip import Trip
from app.db.session import get_engine
from app.db.trip_repository import get_owned_trip, list_owned_trips
from app.schemas.trips import (
    TripCreate,
    TripCursor,
    TripListResponse,
    TripResponse,
    TripSummary,
    encode_cursor,
)


class TripNotFound(ValueError):
    """Missing and other-owner resources deliberately have one outcome."""


class TripStorageUnavailable(ValueError):
    """Safe error boundary; never include the underlying SQL exception."""


def create_trip(owner_id: UUID, data: TripCreate) -> TripResponse:
    try:
        with Session(get_engine()) as db, db.begin():
            trip = Trip(
                owner_id=owner_id,
                title=data.resolved_title,
                destination_label=data.destination_label,
                timezone=data.timezone,
                start_date=data.start_date,
                end_date=data.end_date,
                traveler_count=data.traveler_count,
                budget_per_person_minor=data.budget_per_person_minor,
                currency=data.currency,
                interests=list(data.interests),
                free_text_constraints=data.free_text_constraints,
            )
            db.add(trip)
            db.flush()
            result = TripResponse.model_validate(trip)
        # The context must commit successfully before we return any success.
        return result
    except (DatabaseConfigurationError, SQLAlchemyError):
        raise TripStorageUnavailable from None


def retrieve_trip(owner_id: UUID, trip_id: UUID) -> TripResponse:
    try:
        with Session(get_engine()) as db, db.begin():
            trip = get_owned_trip(db, owner_id=owner_id, trip_id=trip_id)
            if trip is None:
                raise TripNotFound
            result = TripResponse.model_validate(trip)
        return result
    except (DatabaseConfigurationError, SQLAlchemyError):
        raise TripStorageUnavailable from None


def list_trips(
    owner_id: UUID,
    *,
    limit: int,
    cursor: TripCursor | None,
) -> TripListResponse:
    after = (cursor.updated_at, cursor.id) if cursor is not None else None
    try:
        with Session(get_engine()) as db, db.begin():
            rows = list_owned_trips(db, owner_id=owner_id, limit=limit, after=after)
            page = rows[:limit]
            next_cursor = (
                encode_cursor(page[-1].updated_at, page[-1].id)
                if len(rows) > limit
                else None
            )
            result = TripListResponse(
                items=[TripSummary.model_validate(trip) for trip in page],
                next_cursor=next_cursor,
            )
        return result
    except (DatabaseConfigurationError, SQLAlchemyError):
        raise TripStorageUnavailable from None
