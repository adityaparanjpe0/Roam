"""Safe authentication error contract; no ORM/provider objects are returned."""

from uuid import UUID

from pydantic import BaseModel

from app.schemas.errors import ErrorDetail, ErrorResponse


class AuthErrorDetail(ErrorDetail):
    """Retain the existing auth OpenAPI name and JSON representation."""


class AuthErrorResponse(ErrorResponse):
    error: AuthErrorDetail


class CurrentUserResponse(BaseModel):
    id: UUID
    email: str
    display_name: str | None


class MeResponse(BaseModel):
    user: CurrentUserResponse
