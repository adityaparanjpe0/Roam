"""Omitted and explicit-null patch fields must have different meanings."""

import pytest
from pydantic import ValidationError

from app.schemas.trips import TripPatch


def test_only_supplied_fields_are_merged_and_constraints_can_be_cleared() -> None:
    patch = TripPatch.model_validate({"base_version": 2, "title": "  New title  "})
    assert patch.model_dump(mode="json", exclude_unset=True) == {
        "base_version": 2,
        "title": "New title",
    }
    assert TripPatch.model_validate(
        {"base_version": 2, "free_text_constraints": None}
    ).model_fields_set == {"base_version", "free_text_constraints"}
    assert (
        TripPatch.model_validate(
            {"base_version": 1, "free_text_constraints": " \n "}
        ).free_text_constraints
        is None
    )


@pytest.mark.parametrize(
    "field",
    [
        "base_version",
        "title",
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
def test_explicit_null_is_not_an_omission(field: str) -> None:
    with pytest.raises(ValidationError):
        TripPatch.model_validate({"base_version": 1, "title": "New", field: None})


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"title": "New"},
        {"base_version": 1},
        {"base_version": 0, "title": "New"},
        {"base_version": True, "title": "New"},
        {"base_version": "1", "title": "New"},
        {"base_version": 1.0, "title": "New"},
        {"base_version": 2_147_483_648, "title": "New"},
        {"base_version": 1, "title": " "},
        {"base_version": 1, "title": "x" * 121},
        {"base_version": 1, "destination_label": "\x00"},
        {"base_version": 1, "timezone": "Not/A_Zone"},
        {"base_version": 1, "traveler_count": True},
        {"base_version": 1, "traveler_count": 21},
        {"base_version": 1, "budget_per_person_minor": 0},
        {"base_version": 1, "budget_per_person_minor": 1.5},
        {"base_version": 1, "budget_per_person_minor": "100"},
        {"base_version": 1, "budget_per_person_minor": 100_000_001},
        {"base_version": 1, "interests": []},
        {"base_version": 1, "interests": ["food", "food"]},
        {"base_version": 1, "interests": ["fake"]},
        {"base_version": 1, "start_date": "2027-2-01"},
        {"base_version": 1, "start_date": "2027-02-29"},
        {"base_version": 1, "start_date": 123},
        {"base_version": 1, "currency": "EUR"},
        {"base_version": 1, "free_text_constraints": "\x00"},
        {"base_version": 1, "free_text_constraints": "x" * 4001},
        {"base_version": 1, "owner_id": "someone", "title": "New"},
        {"base_version": 1, "version": 2, "title": "New"},
        {"base_version": 1, "status": "ready", "title": "New"},
        {"base_version": 1, "preferences": {}, "title": "New"},
    ],
)
def test_rejects_invalid_patch_values(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        TripPatch.model_validate(payload)


def test_dates_are_preserved_as_wire_dates_for_effective_state_validation() -> None:
    patch = TripPatch.model_validate({"base_version": 1, "start_date": "2027-04-01"})
    # Whether this precedes the trip's unchanged end date is checked after loading it.
    assert patch.model_dump(mode="json", exclude_unset=True) == {
        "base_version": 1,
        "start_date": "2027-04-01",
    }
