"""Google callbacks verify identity before atomically issuing a Roam session."""

from functools import lru_cache
from uuid import uuid4

from authlib.common.security import generate_token
from fastapi import APIRouter, Request
from fastapi.responses import (
    JSONResponse,
    RedirectResponse,
    Response,
)
from starlette.datastructures import QueryParams

from app.api.sessions import session_cookie_names, set_session_cookies
from app.core.config import OAuthConfigurationError, load_google_oauth_settings
from app.core.oauth_flow import (
    FLOW_TTL_SECONDS,
    InvalidLoginFlow,
    LoginCapacityError,
    LoginFlowStore,
)
from app.providers.google_oidc import (
    EmailNotVerified,
    GoogleDiscoveryError,
    GoogleIdentityError,
    GoogleOidcClient,
)
from app.schemas.auth import AuthErrorDetail, AuthErrorResponse
from app.services.auth import UserPersistenceUnavailable, create_login_session

router = APIRouter(prefix="/auth/google", tags=["auth"])


@lru_cache(maxsize=1)
def get_google_oidc_client() -> GoogleOidcClient:
    return GoogleOidcClient(load_google_oauth_settings())


@lru_cache(maxsize=1)
def get_login_flow_store() -> LoginFlowStore:
    return LoginFlowStore()


@router.get(
    "/start",
    status_code=302,
    response_class=RedirectResponse,
    responses={
        429: {"model": AuthErrorResponse},
        503: {"model": AuthErrorResponse},
    },
)
def start_google_login(request: Request) -> Response:
    """Redirect only after discovery and server-side flow storage succeed."""
    headers = {"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"}
    try:
        client = get_google_oidc_client()
        settings = client.settings
        url, state, nonce, verifier = client.authorization_url()
        cookie_name = "__Host-roam_oauth" if settings.secure_cookie else "roam_oauth"
        browser_token = generate_token(48)
        get_login_flow_store().save(
            browser_token,
            state=state,
            nonce=nonce,
            code_verifier=verifier,
            redirect_uri=settings.google_oidc_redirect_uri,
            previous_browser_token=request.cookies.get(cookie_name),
        )
    except (OAuthConfigurationError, GoogleDiscoveryError, LoginCapacityError) as error:
        if isinstance(error, LoginCapacityError):
            status, code, message = (
                429,
                "AUTH_CAPACITY_REACHED",
                "Try signing in later.",
            )
            headers["Retry-After"] = str(FLOW_TTL_SECONDS)
        elif isinstance(error, OAuthConfigurationError):
            status, code, message = (
                503,
                "AUTH_NOT_CONFIGURED",
                "Sign-in is not configured.",
            )
        else:
            status, code, message = (
                503,
                "AUTH_UNAVAILABLE",
                "Google sign-in is unavailable.",
            )
        body = AuthErrorResponse(
            error=AuthErrorDetail(
                code=code, message=message, request_id=str(uuid4()), details={}
            )
        )
        return JSONResponse(body.model_dump(), status_code=status, headers=headers)
    response = RedirectResponse(url, status_code=302, headers=headers)
    response.set_cookie(
        cookie_name,
        browser_token,
        max_age=FLOW_TTL_SECONDS,
        secure=settings.secure_cookie,
        httponly=True,
        samesite="lax",
        path="/",
    )
    return response


@router.get(
    "/callback",
    status_code=303,
    response_class=RedirectResponse,
    responses={
        400: {"model": AuthErrorResponse},
        403: {"model": AuthErrorResponse},
        503: {"model": AuthErrorResponse},
    },
)
def google_callback(request: Request) -> Response:
    """Consume the attempt before any exchange. Persist only verified identity."""
    headers = {
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
    }
    try:
        client = get_google_oidc_client()
        cookie_name = (
            "__Host-roam_oauth" if client.settings.secure_cookie else "roam_oauth"
        )
        raw = getattr(request.state, "oauth_callback_query", b"")
        if len(raw) > 8192:
            raise InvalidLoginFlow
        params = QueryParams(raw)
        if any(len(params.getlist(key)) != 1 for key in params):
            raise InvalidLoginFlow
        flow = get_login_flow_store().consume(
            request.cookies.get(cookie_name), params.get("state")
        )
        if "error" in params:
            if "code" in params:
                raise InvalidLoginFlow
            # Never reflect Google's error_description or other provider text.
            status, code, message = (
                400,
                "OAUTH_CONSENT_DENIED",
                "Google sign-in was not completed.",
            )
        else:
            authorization_code = params.get("code", "")
            if not 1 <= len(authorization_code) <= 4096 or any(
                not char.isascii() or char.isspace() or ord(char) < 32
                for char in authorization_code
            ):
                raise InvalidLoginFlow
            if "iss" in params and params["iss"] not in {
                "https://accounts.google.com",
                "accounts.google.com",
            }:
                raise InvalidLoginFlow
            identity = client.exchange_identity(authorization_code, flow)
            # This service opens its transaction only after all provider I/O and
            # signature/claim validation have succeeded.
            bearer_name, _ = session_cookie_names(client.settings)
            issued = create_login_session(identity, request.cookies.get(bearer_name))
            response: Response = RedirectResponse(
                client.settings.app_base_url + "/",
                status_code=303,
                headers=headers,
            )
            set_session_cookies(response, client.settings, issued)
            _clear_flow_cookies(response)
            return response
    except InvalidLoginFlow:
        status, code, message = (
            400,
            "OAUTH_CALLBACK_INVALID",
            "Restart Google sign-in and try again.",
        )
    except EmailNotVerified:
        status, code, message = (
            403,
            "EMAIL_NOT_VERIFIED",
            "A Google-verified email is required.",
        )
    except GoogleIdentityError:
        status, code, message = (
            400,
            "OAUTH_IDENTITY_INVALID",
            "Google identity could not be verified.",
        )
    except OAuthConfigurationError:
        status, code, message = 503, "AUTH_NOT_CONFIGURED", "Sign-in is not configured."
    except GoogleDiscoveryError:
        status, code, message = (
            503,
            "AUTH_UNAVAILABLE",
            "Google sign-in is unavailable.",
        )
    except UserPersistenceUnavailable:
        status, code, message = (
            503,
            "DATABASE_UNAVAILABLE",
            "Cannot save profile right now. Restart sign-in later.",
        )
    body = AuthErrorResponse(
        error=AuthErrorDetail(
            code=code,
            message=message,
            request_id=str(uuid4()),
            details={},
        )
    )
    response = JSONResponse(body.model_dump(), status_code=status, headers=headers)
    _clear_flow_cookies(response)
    return response


def _clear_flow_cookies(response: Response) -> None:
    for name, secure in (("roam_oauth", False), ("__Host-roam_oauth", True)):
        response.delete_cookie(
            name, path="/", secure=secure, httponly=True, samesite="lax"
        )
