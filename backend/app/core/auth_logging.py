"""Remove OAuth callback queries from the ASGI scope before access logging."""

import logging
from uuid import uuid4

from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("roam.auth")


def record_auth_failure(code: str, status: int) -> str:
    """Only server-controlled codes/status/IDs enter diagnostics; no exception text.

    Do not include request URLs, headers, user profiles, or exception tracebacks.
    Incoming request IDs are untrusted and are deliberately not reused.
    """
    request_id = str(uuid4())
    level = logging.WARNING if status >= 500 else logging.INFO
    logger.log(
        level,
        "auth_failure code=%s status=%s request_id=%s",
        code,
        status,
        request_id,
    )
    return request_id


class RedactOAuthCallbackQuery:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        callback = (
            scope["type"] == "http"
            and scope.get("path", "").rstrip("/") == "/auth/google/callback"
        )
        if callback:
            # Mutate the original scope: Uvicorn uses it for its access log.
            # The route parses the original only from request.state; never log it.
            scope.setdefault("state", {})["oauth_callback_query"] = scope.get(
                "query_string", b""
            )
            scope["query_string"] = b""
        try:
            await self.app(scope, receive, send)
        finally:
            if callback:
                scope["state"].pop("oauth_callback_query", None)
