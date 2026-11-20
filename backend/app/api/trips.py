"""Authenticated trip metadata routes; never trust a client-supplied owner."""

import re
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Request, Response

from app.api.errors import APIError
from app.api.sessions import get_current_user
from app.domain.session import CurrentUser
from app.schemas.errors import ErrorResponse
from app.schemas.trips import (
    TripCreate,
    TripListResponse,
    TripPatch,
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


@router.delete(
    "/{trip_id}",
    status_code=204,
    response_class=Response,
    responses={status: {"model": ErrorResponse} for status in (404, 409)},
)
def delete(
    trip_id: UUID,
    user: UserDependency,
    request: Request,
    if_match: Annotated[
        str,
        Header(
            alias="If-Match",
            max_length=12,
            description='One quoted trip version, e.g. "2".',
        ),
    ],
) -> Response:
    """Permanently delete an owned, version-matched trip without locked activities."""
    match = re.fullmatch(r'"([1-9][0-9]{0,9})"', if_match)
    if (
        len(request.headers.getlist("if-match")) != 1
        or match is None
        or int(match[1]) > 2_147_483_647
    ):
        raise APIError(
            422,
            "VALIDATION_FAILED",
            "Check the request fields.",
            {"If-Match": "Use one quoted positive trip version."},
        )
    try:
        trips.delete_trip(user.id, trip_id, int(match[1]))
    except trips.TripNotFound:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Trip not found.") from None
    except trips.TripVersionConflict as error:
        raise APIError(
            409,
            "VERSION_CONFLICT",
            "This trip changed. Reload and try again.",
            {"current_version": error.current_version},
        ) from None
    except trips.TripLockedActivity:
        raise APIError(
            409,
            "LOCKED_ACTIVITY",
            "This trip contains a locked activity and cannot be deleted.",
        ) from None
    except trips.TripStorageUnavailable:
        raise APIError(
            503, "DATABASE_UNAVAILABLE", "Cannot delete trip right now."
        ) from None
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


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


@router.patch(
    "/{trip_id}",
    response_model=TripResponse,
    responses={status: {"model": ErrorResponse} for status in (404, 409)},
)
def update(
    trip_id: UUID,
    data: TripPatch,
    user: UserDependency,
    response: Response,
) -> TripResponse:
    """Update owned metadata with CSRF and the version from the client's read."""
    try:
        result = trips.update_trip(user.id, trip_id, data)
    except trips.TripNotFound:
        raise APIError(404, "RESOURCE_NOT_FOUND", "Trip not found.") from None
    except trips.TripVersionConflict as error:
        raise APIError(
            409,
            "VERSION_CONFLICT",
            "This trip changed. Reload and try again.",
            {"current_version": error.current_version},
        ) from None
    except trips.TripHasItinerary:
        raise APIError(
            409,
            "TRIP_HAS_ITINERARY",
            "This trip has itinerary data. Only its title can be changed here.",
        ) from None
    except trips.TripInvalidUpdate:
        raise APIError(
            422,
            "VALIDATION_FAILED",
            "Check the complete trip, including its date range.",
        ) from None
    except trips.TripStorageUnavailable:
        raise APIError(
            503, "DATABASE_UNAVAILABLE", "Cannot update trip right now."
        ) from None
    response.headers["Cache-Control"] = "no-store"
    return result
