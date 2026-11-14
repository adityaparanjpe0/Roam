"""Check the health endpoint through the registered FastAPI application."""

from fastapi.testclient import TestClient

from app.main import app


def test_health_returns_http_200() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200


def test_health_returns_ok_body() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.json() == {"status": "ok"}


def test_health_returns_json_content_type() -> None:
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.headers["content-type"] == "application/json"
