"""Session HTTP boundary and reusable authentication/CSRF dependencies."""

from functools import lru_cache
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse

from app.core.config import AppSettings, OAuthConfigurationError, load_app_settings
from app.core.session_security import (
    ABSOLUTE_SESSION_LIFETIME,
    AuthenticationRequired,
    CsrfRejected,
    trusted_request_origin,
)
from app.domain.session import AuthenticatedSession, CurrentUser, IssuedSession
from app.schemas.auth import (
    AuthErrorDetail,
    AuthErrorResponse,
    CurrentUserResponse,
    MeResponse,
)
from app.services.sessions import (
    SessionsUnavailable,
    authenticate_session,
    logout_session,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class SessionHTTPError(Exception):
    def __init__(self, status: int, code: str, message: str) -> None:
        self.status = status
        self.code = code
        self.message = message


@lru_cache(maxsize=1)
def get_session_settings() -> AppSettings:
    return load_app_settings()


def session_cookie_names(settings: AppSettings) -> tuple[str, str]:
    prefix = "__Host-" if settings.secure_cookie else ""
    return prefix + "roam_session", prefix + "roam_csrf"


def set_session_cookies(
    response: Response, settings: AppSettings, issued: IssuedSession
) -> None:
    bearer_name, csrf_name = session_cookie_names(settings)
    for name, value, http_only in (
        (bearer_name, issued.token, True),
        (csrf_name, issued.csrf_token, False),
    ):
        response.set_cookie(
            name,
            value,
            max_age=int(ABSOLUTE_SESSION_LIFETIME.total_seconds()),
            expires=issued.expires_at,
            secure=settings.secure_cookie,
            httponly=http_only,
            samesite="lax",
            path="/",
        )


def clear_session_cookies(response: Response) -> None:
    for prefix, secure in (("", False), ("__Host-", True)):
        for suffix, http_only in (("roam_session", True), ("roam_csrf", False)):
            response.delete_cookie(
                prefix + suffix,
                path="/",
                secure=secure,
                httponly=http_only,
                samesite="lax",
            )


def session_error_response(request: Request, error: SessionHTTPError) -> JSONResponse:
    body = AuthErrorResponse(
        error=AuthErrorDetail(
            code=error.code,
            message=error.message,
            request_id=str(uuid4()),
            details={},
        )
    )
    response = JSONResponse(
        body.model_dump(),
        status_code=error.status,
        headers={"Cache-Control": "no-store"},
    )
    if error.status == 401:
        clear_session_cookies(response)
    return response


def get_current_session(request: Request) -> AuthenticatedSession:
    try:
        settings = get_session_settings()
        bearer_name, csrf_name = session_cookie_names(settings)
        # Reject ambiguous header/cookie values rather than selecting one copy.
        cookie_headers = request.headers.getlist("cookie")
        cookies = ";".join(cookie_headers)
        if len(cookie_headers) > 1 or any(
            sum(part.strip().startswith(name + "=") for part in cookies.split(";")) > 1
            for name in (bearer_name, csrf_name)
        ):
            raise AuthenticationRequired
        unsafe = request.method not in {"GET", "HEAD", "OPTIONS"}
        if unsafe and (
            len(request.headers.getlist("origin")) > 1
            or len(request.headers.getlist("x-csrf-token")) > 1
            or len(request.headers.getlist("referer")) > 1
        ):
            raise CsrfRejected
        return authenticate_session(
            request.cookies.get(bearer_name),
            unsafe=unsafe,
            csrf_cookie=request.cookies.get(csrf_name),
            csrf_header=request.headers.get("x-csrf-token"),
            trusted_origin=trusted_request_origin(
                request.headers.get("origin"),
                request.headers.get("referer"),
                settings.app_base_url,
            ),
        )
    except OAuthConfigurationError:
        raise SessionHTTPError(
            503, "AUTH_NOT_CONFIGURED", "Authentication is not configured."
        ) from None
    except AuthenticationRequired:
        raise SessionHTTPError(
            401, "AUTHENTICATION_REQUIRED", "Sign in to continue."
        ) from None
    except CsrfRejected:
        raise SessionHTTPError(
            403, "CSRF_FAILED", "Request verification failed. Reload or sign in again."
        ) from None
    except SessionsUnavailable:
        raise SessionHTTPError(
            503, "DATABASE_UNAVAILABLE", "Session storage is unavailable."
        ) from None


def get_current_user(
    session: Annotated[AuthenticatedSession, Depends(get_current_session)],
) -> CurrentUser:
    """Use on future owned-resource routes; unsafe methods also require CSRF."""
    return session.user


@router.get(
    "/me",
    response_model=MeResponse,
    responses={401: {"model": AuthErrorResponse}, 503: {"model": AuthErrorResponse}},
)
def me(
    user: Annotated[CurrentUser, Depends(get_current_user)], response: Response
) -> MeResponse:
    response.headers["Cache-Control"] = "no-store"
    return MeResponse(
        user=CurrentUserResponse(
            id=user.id, email=user.email, display_name=user.display_name
        )
    )


@router.post(
    "/logout",
    status_code=204,
    responses={
        401: {"model": AuthErrorResponse},
        403: {"model": AuthErrorResponse},
        503: {"model": AuthErrorResponse},
    },
)
def logout(
    session: Annotated[AuthenticatedSession, Depends(get_current_session)],
) -> Response:
    try:
        logout_session(session)
    except AuthenticationRequired:
        raise SessionHTTPError(
            401, "AUTHENTICATION_REQUIRED", "Sign in to continue."
        ) from None
    except SessionsUnavailable:
        raise SessionHTTPError(
            503, "DATABASE_UNAVAILABLE", "Session storage is unavailable."
        ) from None
    response = Response(status_code=204, headers={"Cache-Control": "no-store"})
    clear_session_cookies(response)
    return response
