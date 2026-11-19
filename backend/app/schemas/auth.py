"""Safe authentication error contract; no ORM/provider objects are returned."""

from uuid import UUID

from pydantic import BaseModel


class AuthErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str
    details: dict[str, str]


class AuthErrorResponse(BaseModel):
    error: AuthErrorDetail


class CurrentUserResponse(BaseModel):
    id: UUID
    email: str
    display_name: str | None


class MeResponse(BaseModel):
    user: CurrentUserResponse
