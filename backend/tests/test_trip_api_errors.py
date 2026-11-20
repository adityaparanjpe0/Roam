"""Public error/OpenAPI contracts and private-input redaction, without a DB."""

from collections.abc import Iterator
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.api.sessions import get_current_user, get_session_settings
from app.domain.session import CurrentUser
from app.main import app
from app.schemas.auth import AuthErrorDetail, AuthErrorResponse
from app.services import trips
from tests.trip_fixtures import trip_payload


@pytest.fixture
def authenticated_client() -> Iterator[TestClient]:
    # Used only for HTTP/schema isolation. PostgreSQL tests use real auth/CSRF.
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(
        UUID(int=1), "fixture@example.com", "Fixture"
    )
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_auth_error_wire_contract_is_preserved() -> None:
    body = AuthErrorResponse(
        error=AuthErrorDetail(
            code="AUTHENTICATION_REQUIRED",
            message="Sign in to continue.",
            request_id="request",
            details={},
        )
    )
    assert body.model_dump() == {
        "error": {
            "code": "AUTHENTICATION_REQUIRED",
            "message": "Sign in to continue.",
            "request_id": "request",
            "details": {},
        }
    }


def test_trip_openapi_exposes_complete_crud_contract() -> None:
    document = app.openapi()
    collection = document["paths"]["/api/v1/trips"]
    detail = document["paths"]["/api/v1/trips/{trip_id}"]
    assert set(collection) == {"get", "post"} and set(detail) == {
        "get",
        "patch",
        "delete",
    }
    assert "201" in collection["post"]["responses"]
    for operation in [
        collection["post"],
        collection["get"],
        detail["get"],
        detail["patch"],
        detail["delete"],
    ]:
        for status in ["401", "403", "422", "503"]:
            assert operation["responses"][status]["content"]["application/json"][
                "schema"
            ]["$ref"].endswith("/ErrorResponse")
    assert "404" in detail["get"]["responses"]
    assert "409" in detail["patch"]["responses"]
    assert "404" in detail["delete"]["responses"]
    assert "409" in detail["delete"]["responses"]
    assert "content" not in detail["delete"]["responses"]["204"]
    header = next(p for p in detail["delete"]["parameters"] if p["in"] == "header")
    assert header["name"] == "If-Match" and header["required"] is True
    patch = document["components"]["schemas"]["TripPatch"]
    assert patch["required"] == ["base_version"]
    assert patch["properties"]["title"]["type"] == "string"
    assert "default" not in patch["properties"]["title"]
    assert {
        part["type"] for part in patch["properties"]["free_text_constraints"]["anyOf"]
    } == {"string", "null"}
    assert (
        document["components"]["schemas"]["TripCreate"]["additionalProperties"] is False
    )
    assert "AuthErrorResponse" in document["components"]["schemas"]


@pytest.mark.parametrize(
    "patch",
    [
        {"free_text_constraints": "PRIVATE_DETAILS" * 1000},
        {"PRIVATE_DETAILS": "SECRET_INPUT"},
        {"traveler_count": "SECRET_INPUT"},
    ],
)
def test_validation_does_not_echo_input_or_unknown_keys(
    authenticated_client: TestClient, patch: dict[str, object]
) -> None:
    response = authenticated_client.post("/api/v1/trips", json=trip_payload() | patch)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"
    assert (
        "PRIVATE_DETAILS" not in response.text and "SECRET_INPUT" not in response.text
    )
    assert response.headers["x-request-id"] == response.json()["error"]["request_id"]
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize(
    "method,path,kwargs",
    [
        ("post", "/api/v1/trips", {"content": '{"SECRET_INPUT":'}),
        ("get", "/api/v1/trips/not-a-uuid", {}),
        ("get", "/api/v1/trips?limit=0", {}),
        ("get", "/api/v1/trips?limit=101", {}),
        ("get", "/api/v1/trips?limit=1.5", {}),
        ("get", "/api/v1/trips?cursor=PRIVATE_DETAILS", {}),
        ("get", "/api/v1/trips?cursor=" + "x" * 513, {}),
    ],
)
def test_invalid_body_path_and_query_share_safe_envelope(
    authenticated_client: TestClient, method: str, path: str, kwargs: dict[str, object]
) -> None:
    response = authenticated_client.request(method, path, **kwargs)
    assert response.status_code == 422
    assert set(response.json()) == {"error"}
    assert (
        "SECRET_INPUT" not in response.text and "PRIVATE_DETAILS" not in response.text
    )


@pytest.mark.parametrize(
    "path", ["/api/v1/trips", "/api/v1/trips/00000000-0000-0000-0000-000000000001"]
)
def test_storage_outage_is_safe(
    authenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    path: str,
) -> None:
    def fail(*args: object, **kwargs: object) -> None:
        raise trips.TripStorageUnavailable("PRIVATE_SQL_AND_PASSWORD")

    monkeypatch.setattr(trips, "list_trips", fail)
    monkeypatch.setattr(trips, "retrieve_trip", fail)
    response = authenticated_client.get(path)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert "PRIVATE_SQL_AND_PASSWORD" not in response.text + caplog.text


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/v1/trips"),
        ("get", "/api/v1/trips/00000000-0000-0000-0000-000000000001"),
        ("post", "/api/v1/trips"),
        ("patch", "/api/v1/trips/00000000-0000-0000-0000-000000000001"),
        ("delete", "/api/v1/trips/00000000-0000-0000-0000-000000000001"),
    ],
)
def test_all_trip_operations_require_authentication(
    monkeypatch: pytest.MonkeyPatch, method: str, path: str
) -> None:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("APP_BASE_URL", "http://127.0.0.1:5173")
    get_session_settings.cache_clear()
    try:
        with TestClient(app) as client:
            body = (
                trip_payload()
                if method == "post"
                else {"base_version": 1, "title": "New"}
                if method == "patch"
                else None
            )
            response = client.request(method, path, json=body)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
    finally:
        get_session_settings.cache_clear()
