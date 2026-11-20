"""DELETE's HTTP header contract; database behavior has PostgreSQL coverage."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.services import trips
from tests.test_trip_api_errors import authenticated_client as authenticated_client


@pytest.mark.parametrize(
    "value",
    [
        None,
        "1",
        '"0"',
        '"01"',
        '"-1"',
        '"1.0"',
        'W/"1"',
        "*",
        '"1", "2"',
        '"2147483648"',
        '"99999999999999999"',
        "PRIVATE_INPUT",
    ],
)
def test_invalid_precondition_is_safe_and_never_calls_storage(
    authenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
    value: str | None,
) -> None:
    def unexpected(*args: object) -> None:
        pytest.fail("Malformed header must not reach trip storage")

    monkeypatch.setattr(trips, "delete_trip", unexpected)
    response = authenticated_client.delete(
        f"/api/v1/trips/{uuid4()}", headers={} if value is None else {"If-Match": value}
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"
    assert "PRIVATE_INPUT" not in response.text + caplog.text
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-request-id"] == response.json()["error"]["request_id"]


def test_duplicate_headers_are_rejected(authenticated_client: TestClient) -> None:
    response = authenticated_client.delete(
        f"/api/v1/trips/{uuid4()}", headers=[("If-Match", '"1"'), ("If-Match", '"1"')]
    )
    assert response.status_code == 422


@pytest.mark.parametrize("version", [1, 2_147_483_647])
def test_valid_header_reaches_service_and_success_has_no_body(
    authenticated_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    version: int,
) -> None:
    received = []

    def record(*args: object) -> None:
        received.append(args)

    monkeypatch.setattr(trips, "delete_trip", record)
    trip_id = uuid4()
    response = authenticated_client.delete(
        f"/api/v1/trips/{trip_id}", headers={"If-Match": f'"{version}"'}
    )
    assert received[0][1:] == (trip_id, version)
    assert response.status_code == 204 and response.content == b""
    assert "content-type" not in response.headers
    assert response.headers["cache-control"] == "no-store"
