"""Authenticated trip metadata routes; never trust a client-supplied owner."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.errors import APIError
from app.api.sessions import get_current_user
from app.domain.session import CurrentUser
from app.schemas.errors import ErrorResponse
from app.schemas.trips import (
    TripCreate,
    TripListResponse,
    TripResponse,
    decode_cursor,
)
from app.services import trips

router = APIRouter(
    prefix="/api/v1/trips",
    tags=["trips"],
    responses={status: {"model": ErrorResponse} for status in (401, 403, 422, 503)},
)
UserDependency = Annotated[CurrentUser, Depends(get_current_user)]


@router.post("", status_code=201, response_model=TripResponse)
def create(data: TripCreate, user: UserDependency, response: Response) -> TripResponse:
    """Create an owned draft using a Roam session and CSRF cookie/header + origin."""
    try:
        result = trips.create_trip(user.id, data)
    except trips.TripStorageUnavailable:
        raise APIError(
            503, "DATABASE_UNAVAILABLE", "Cannot save trip right now."
        ) from None
    response.headers["Location"] = f"/api/v1/trips/{result.id}"
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get("", response_model=TripListResponse)
def list_owned(
    user: UserDependency,
    response: Response,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: Annotated[str | None, Query(min_length=1, max_length=512)] = None,
) -> TripListResponse:
    """List the session user's trips; the cursor never grants ownership."""
    try:
        parsed = decode_cursor(cursor) if cursor is not None else None
    except ValueError:
        raise APIError(
            422,
            "VALIDATION_FAILED",
            "Check the request fields.",
            {"cursor": "Invalid cursor."},
        ) from None
    try:
        result = trips.list_trips(user.id, limit=limit, cursor=parsed)
    except trips.TripStorageUnavailable:
        raise APIError(
            503, "DATABASE_UNAVAILABLE", "Cannot load trips right now."
        ) from None
    response.headers["Cache-Control"] = "no-store"
    return result


@router.get(
    "/{trip_id}", response_model=TripResponse, responses={404: {"model": ErrorResponse}}
)
def retrieve(trip_id: UUID, user: UserDependency, response: Response) -> TripResponse:
    """Return owned metadata; missing and other-owner IDs have the same 404."""
    try:
        result = trips.retrieve_trip(user.id, trip_id)
    except trips.TripNotFound:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Trip not found.") from None
    except trips.TripStorageUnavailable:
        raise APIError(
            503, "DATABASE_UNAVAILABLE", "Cannot load trip right now."
        ) from None
    response.headers["Cache-Control"] = "no-store"
    return result
