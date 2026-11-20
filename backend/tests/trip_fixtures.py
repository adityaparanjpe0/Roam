"""Synthetic request data shared by schema and API tests."""


def trip_payload() -> dict[str, object]:
    return {
        "destination_label": "Lisbon, Portugal",
        "timezone": "Europe/Lisbon",
        "start_date": "2027-03-27",
        "end_date": "2027-03-30",
        "traveler_count": 2,
        "budget_per_person_minor": 75050,
        "currency": "USD",
        "interests": ["food", "culture"],
        "free_text_constraints": "A relaxed pace",
    }
