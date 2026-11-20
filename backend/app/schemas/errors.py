"""Shared public error envelope; details contain only allowlisted safe values."""

from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str
    details: dict[str, str | int]


class ErrorResponse(BaseModel):
    error: ErrorDetail
