"""Create the FastAPI application served by Uvicorn."""

from fastapi import FastAPI

from app.api.health import router as health_router

app = FastAPI(title="Roam API")
app.include_router(health_router)
