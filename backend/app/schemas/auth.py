"""Safe authentication error contract; no ORM/provider objects are returned."""

from pydantic import BaseModel


class AuthErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str
    details: dict[str, str]


class AuthErrorResponse(BaseModel):
    error: AuthErrorDetail
