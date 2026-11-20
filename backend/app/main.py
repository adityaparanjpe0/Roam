"""Create the FastAPI application served by Uvicorn."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError

from app.api.auth import router as auth_router
from app.api.errors import APIError, api_error_response, validation_error_response
from app.api.health import router as health_router
from app.api.sessions import (
    SessionHTTPError,
    session_error_response,
)
from app.api.sessions import (
    router as session_router,
)
from app.api.trips import router as trip_router
from app.core.auth_logging import RedactOAuthCallbackQuery
from app.db.session import dispose_database_engine


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Keep startup database-independent and release a used pool on shutdown."""
    try:
        yield
    finally:
        await run_in_threadpool(dispose_database_engine)


app = FastAPI(title="Roam API", lifespan=lifespan)
app.add_middleware(RedactOAuthCallbackQuery)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(session_router)
app.include_router(trip_router)
app.exception_handler(SessionHTTPError)(session_error_response)
app.exception_handler(APIError)(api_error_response)
app.exception_handler(RequestValidationError)(validation_error_response)
