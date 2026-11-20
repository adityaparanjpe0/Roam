"""Safe business API errors without request bodies, SQL, or exception logging."""

import logging
from uuid import uuid4

from fastapi import Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.schemas.errors import ErrorDetail, ErrorResponse

logger = logging.getLogger("roam.api")


class APIError(Exception):
    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        details: dict[str, str | int] | None = None,
    ) -> None:
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


def api_error_response(_request: Request, error: APIError) -> JSONResponse:
    request_id = str(uuid4())
    logger.log(
        logging.WARNING if error.status >= 500 else logging.INFO,
        "api_failure code=%s status=%s request_id=%s",
        error.code,
        error.status,
        request_id,
    )
    body = ErrorResponse(
        error=ErrorDetail(
            code=error.code,
            message=error.message,
            request_id=request_id,
            details=error.details,
        )
    )
    return JSONResponse(
        body.model_dump(),
        status_code=error.status,
        headers={"Cache-Control": "no-store", "X-Request-ID": request_id},
    )


async def validation_error_response(
    request: Request,
    error: RequestValidationError,
) -> JSONResponse:
    # Preserve existing behavior outside the new business API namespace.
    if not request.url.path.startswith("/api/v1/"):
        return await request_validation_exception_handler(request, error)
    fields = {
        "title",
        "destination_label",
        "timezone",
        "start_date",
        "end_date",
        "traveler_count",
        "budget_per_person_minor",
        "currency",
        "interests",
        "free_text_constraints",
        "cursor",
        "limit",
        "trip_id",
        "base_version",
    }
    messages = {
        "missing": "This field is required.",
        "extra_forbidden": "Unknown fields are not allowed.",
        "int_type": "Use an integer.",
        "string_type": "Use text.",
        "string_too_long": "Text is too long.",
        "string_too_short": "Text must not be blank.",
        "json_invalid": "Use a valid JSON body.",
    }
    details: dict[str, str | int] = {}
    for issue in error.errors():
        location = issue.get("loc", ())
        # Unknown keys and Pydantic messages/inputs can contain private text.
        field = next((part for part in location if part in fields), "request")
        details.setdefault(field, messages.get(issue["type"], "Invalid value."))
    return api_error_response(
        request,
        APIError(
            422,
            "VALIDATION_FAILED",
            "Check the request fields.",
            details,
        ),
    )
