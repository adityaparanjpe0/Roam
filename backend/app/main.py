"""Create the FastAPI application served by Uvicorn."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool

from app.api.auth import router as auth_router
from app.api.health import router as health_router
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
