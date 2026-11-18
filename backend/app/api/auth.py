"""Login initiation only. No callback, user upsert, or application session yet."""

from functools import lru_cache
from uuid import uuid4

from authlib.common.security import generate_token
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

from app.core.config import OAuthConfigurationError, load_google_oauth_settings
from app.core.oauth_flow import FLOW_TTL_SECONDS, LoginCapacityError, LoginFlowStore
from app.providers.google_oidc import GoogleDiscoveryError, GoogleOidcClient
from app.schemas.auth import AuthErrorDetail, AuthErrorResponse

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
