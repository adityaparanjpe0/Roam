"""Remove OAuth callback queries from the ASGI scope before access logging."""

from starlette.types import ASGIApp, Receive, Scope, Send


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
