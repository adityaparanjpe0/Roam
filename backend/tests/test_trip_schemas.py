"""Strict JSON boundaries and cursor validation without database or network."""

import base64
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from pydantic import ValidationError

from app.schemas.trips import TripCreate, decode_cursor, encode_cursor
from tests.trip_fixtures import trip_payload


def test_normalizes_text_dates_and_default_title() -> None:
    payload = trip_payload()
    payload.update(
        destination_label="  Lisbon, Portugal  ", free_text_constraints=" \n "
    )
    trip = TripCreate.model_validate(payload)
    assert trip.destination_label == "Lisbon, Portugal"
    assert trip.resolved_title == "Lisbon, Portugal"
    assert trip.start_date.isoformat() == "2027-03-27"
    assert trip.free_text_constraints is None


def test_default_title_is_bounded_without_truncating_destination() -> None:
    payload = trip_payload() | {"destination_label": "a" * 200}
    trip = TripCreate.model_validate(payload)
    assert len(trip.destination_label) == 200 and len(trip.resolved_title) == 120
    assert (
        TripCreate.model_validate(payload | {"title": "  My trip  "}).resolved_title
        == "My trip"
    )


@pytest.mark.parametrize(
    "field",
    [
        "destination_label",
        "timezone",
        "start_date",
        "end_date",
        "traveler_count",
        "budget_per_person_minor",
        "currency",
        "interests",
    ],
)
def test_required_fields(field: str) -> None:
    payload = trip_payload()
    del payload[field]
    with pytest.raises(ValidationError):
        TripCreate.model_validate(payload)


@pytest.mark.parametrize(
    "patch",
    [
        {"title": " "},
        {"title": "x" * 121},
        {"title": 123},
        {"title": "Bad\x00title"},
        {"title": "Bad\ud800title"},
        {"destination_label": " "},
        {"destination_label": "x" * 201},
        {"destination_label": None},
        {"destination_label": 1},
        {"destination_label": "Bad\x00destination"},
        {"destination_label": "Bad\ud800destination"},
        {"timezone": "Not/A_Timezone"},
        {"timezone": "localtime"},
        {"timezone": "../etc/passwd"},
        {"timezone": " Europe/Lisbon "},
        {"start_date": "2027-02-29"},
        {"start_date": "0000-01-01"},
        {"start_date": "2027-3-27"},
        {"start_date": "2027-03-27T00:00:00Z"},
        {"start_date": 1700000000},
        {"start_date": True},
        {"end_date": "2027-03-26"},
        {"end_date": "2027-04-10"},
        {"traveler_count": 0},
        {"traveler_count": 21},
        {"traveler_count": 1.5},
        {"traveler_count": "2"},
        {"traveler_count": True},
        {"budget_per_person_minor": 0},
        {"budget_per_person_minor": -1},
        {"budget_per_person_minor": 100_000_001},
        {"budget_per_person_minor": 1.0},
        {"budget_per_person_minor": "100"},
        {"budget_per_person_minor": True},
        {"budget_per_person_minor": None},
        {"currency": "usd"},
        {"currency": "EUR"},
        {"interests": []},
        {"interests": ["food", "food"]},
        {"interests": ["imaginary"]},
        {"interests": "food"},
        {"interests": [1]},
        {"free_text_constraints": "x" * 4001},
        {"free_text_constraints": 123},
        {"free_text_constraints": "Bad\x00constraints"},
        {"free_text_constraints": "Bad\ud800constraints"},
        {"owner_id": "00000000-0000-0000-0000-000000000001"},
        {"version": 20},
        {"status": "ready"},
        {"preferences": {}},
        {"destination_provider_id": "fake"},
    ],
)
def test_rejects_invalid_values_and_server_controlled_fields(
    patch: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        TripCreate.model_validate(trip_payload() | patch)


@pytest.mark.parametrize(
    "patch",
    [
        {"start_date": "2000-02-29", "end_date": "2000-02-29"},
        {"end_date": "2027-04-09"},
        {"traveler_count": 1, "budget_per_person_minor": 1},
        {"traveler_count": 20, "budget_per_person_minor": 100_000_000},
        {"timezone": "UTC", "free_text_constraints": None},
        {"title": None},
    ],
)
def test_valid_boundaries_and_past_dates(patch: dict[str, object]) -> None:
    TripCreate.model_validate(trip_payload() | patch)


def test_cursor_preserves_microseconds_id_and_normalizes_timezone() -> None:
    timestamp = datetime(
        2027, 3, 1, 12, 30, 1, 123456, tzinfo=timezone(timedelta(hours=2))
    )
    trip_id = UUID(int=23)
    token = encode_cursor(timestamp, trip_id)
    decoded = decode_cursor(token)
    assert decoded.updated_at == timestamp and decoded.id == trip_id and decoded.v == 1
    assert decoded.updated_at.utcoffset() == timedelta(0)
    assert "=" not in token and len(token) <= 512


def cursor_json(payload: object) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")


@pytest.mark.parametrize(
    "token",
    [
        "",
        "x" * 513,
        "not+a+cursor",
        "!!!!",
        "a",
        cursor_json({}),
        cursor_json([]),
        cursor_json(
            {"v": 2, "id": str(UUID(int=1)), "updated_at": "2027-01-01T00:00:00Z"}
        ),
        cursor_json(
            {"v": True, "id": str(UUID(int=1)), "updated_at": "2027-01-01T00:00:00Z"}
        ),
        cursor_json({"v": 1, "id": "not-a-uuid", "updated_at": "2027-01-01T00:00:00Z"}),
        cursor_json(
            {"v": 1, "id": str(UUID(int=1)), "updated_at": "2027-01-01T00:00:00"}
        ),
        cursor_json({"v": 1, "id": str(UUID(int=1)), "updated_at": 1}),
        cursor_json({"v": 1, "id": str(UUID(int=1)), "updated_at": "42"}),
        cursor_json(
            {
                "v": 1,
                "id": str(UUID(int=1)),
                "updated_at": "2027-01-01T00:00:00Z",
                "owner_id": "someone",
            }
        ),
    ],
)
def test_rejects_malformed_or_unsupported_cursors(token: str) -> None:
    with pytest.raises(ValueError, match="Invalid cursor"):
        decode_cursor(token)
