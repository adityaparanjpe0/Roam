"""Versioned HTTP mutations with real PostgreSQL sessions, locks and rollback."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import Engine, event, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.models import Activity, Trip, TripDay
from app.domain.identity import VerifiedIdentity
from app.main import app
from app.services import trips
from app.services.auth import create_login_session
from tests.integration.test_trip_crud_api import ORIGIN
from tests.integration.test_trip_crud_api import auth_database as auth_database
from tests.integration.test_trip_crud_api import browsers as browsers
from tests.trip_fixtures import trip_payload

pytestmark = pytest.mark.database


def test_patch_only_changes_supplied_fields_and_increments_once(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
) -> None:
    alice, _ = browsers
    original = alice.post("/api/v1/trips", json=trip_payload()).json()
    response = alice.patch(
        f"/api/v1/trips/{original['id']}",
        json={"base_version": 1, "title": "  Summer plans  "},
    )
    assert (
        response.status_code == 200 and response.headers["cache-control"] == "no-store"
    )
    changed = response.json()
    assert changed["title"] == "Summer plans" and changed["version"] == 2
    for name in set(original) - {"title", "version", "updated_at"}:
        assert changed[name] == original[name]
    assert changed["updated_at"] >= original["updated_at"]
    assert alice.get(f"/api/v1/trips/{original['id']}").json() == changed
    with Session(auth_database) as db:
        record = db.get(Trip, UUID(original["id"]))
        assert record is not None and record.version == 2
        assert record.preferences == {"schema_version": 1}


def test_patch_metadata_fields_and_explicit_constraint_clear(
    browsers: tuple[TestClient, TestClient],
) -> None:
    alice, _ = browsers
    original = alice.post("/api/v1/trips", json=trip_payload()).json()
    patch = {
        "base_version": 1,
        "destination_label": " Porto ",
        "timezone": "Europe/Lisbon",
        "start_date": "2027-06-01",
        "end_date": "2027-06-07",
        "traveler_count": 4,
        "budget_per_person_minor": 12345,
        "currency": "USD",
        "interests": ["outdoors"],
        "free_text_constraints": " Step-free routes ",
    }
    url = f"/api/v1/trips/{original['id']}"
    response = alice.patch(url, json=patch)
    assert response.status_code == 200
    result = response.json()
    assert result["destination_label"] == "Porto"
    assert (
        result["title"] == original["title"]
    )  # Destination changes do not rename a trip.
    assert result["free_text_constraints"] == "Step-free routes"
    for field in [
        "start_date",
        "end_date",
        "traveler_count",
        "budget_per_person_minor",
        "interests",
    ]:
        assert result[field] == patch[field]
    response = alice.patch(url, json={"base_version": 2, "free_text_constraints": None})
    assert response.status_code == 200
    assert (
        response.json()["free_text_constraints"] is None
        and response.json()["version"] == 3
    )


@pytest.mark.parametrize(
    "fields",
    [
        {"start_date": "2027-04-01"},
        {"end_date": "2027-03-26"},
        {"end_date": "2027-04-10"},
        {"title": "Changed", "start_date": "2027-04-01"},
    ],
)
def test_validates_merged_dates_and_preserves_every_field_on_failure(
    browsers: tuple[TestClient, TestClient],
    fields: dict[str, object],
) -> None:
    alice, _ = browsers
    original = alice.post("/api/v1/trips", json=trip_payload()).json()
    url = f"/api/v1/trips/{original['id']}"
    response = alice.patch(url, json={"base_version": 1} | fields)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_FAILED"
    assert alice.get(url).json() == original


def test_stale_update_does_not_overwrite_and_returns_owned_current_version(
    browsers: tuple[TestClient, TestClient],
) -> None:
    alice, _ = browsers
    original = alice.post("/api/v1/trips", json=trip_payload()).json()
    url = f"/api/v1/trips/{original['id']}"
    accepted = alice.patch(url, json={"base_version": 1, "title": "First edit"})
    response = alice.patch(url, json={"base_version": 1, "title": "Stale edit"})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "VERSION_CONFLICT"
    assert response.json()["error"]["details"] == {"current_version": 2}
    assert response.headers["x-request-id"] == response.json()["error"]["request_id"]
    assert alice.get(url).json() == accepted.json()


def test_cross_owner_and_missing_patch_have_same_404_before_version_check(
    browsers: tuple[TestClient, TestClient],
) -> None:
    alice, bob = browsers
    original = alice.post("/api/v1/trips", json=trip_payload()).json()
    responses = [
        bob.patch(
            f"/api/v1/trips/{trip_id}", json={"base_version": 999, "title": "Not mine"}
        )
        for trip_id in [original["id"], str(uuid4())]
    ]
    for response in responses:
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "RESOURCE_NOT_FOUND"
        assert response.json()["error"]["details"] == {}
        assert "current_version" not in response.text
    assert alice.get(f"/api/v1/trips/{original['id']}").json() == original


@pytest.mark.parametrize("failure", ["csrf", "origin", "owner", "empty", "null"])
def test_invalid_or_unauthorized_patch_does_not_mutate(
    browsers: tuple[TestClient, TestClient],
    failure: str,
) -> None:
    alice, bob = browsers
    original = alice.post("/api/v1/trips", json=trip_payload()).json()
    url = f"/api/v1/trips/{original['id']}"
    body: dict[str, object] = {"base_version": 1, "title": "Changed"}
    if failure == "csrf":
        alice.headers["X-CSRF-Token"] = bob.headers["X-CSRF-Token"]
    elif failure == "origin":
        alice.headers["Origin"] = "https://other.example"
    elif failure == "owner":
        body["owner_id"] = str(uuid4())
    elif failure == "empty":
        body = {"base_version": 1}
    else:
        body["title"] = None
    response = alice.patch(url, json=body)
    assert response.status_code == (403 if failure in {"csrf", "origin"} else 422)
    assert alice.get(url).json() == original


def test_existing_itinerary_allows_only_title_and_preserves_locked_activity(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
) -> None:
    alice, _ = browsers
    original = alice.post("/api/v1/trips", json=trip_payload()).json()
    trip_id = UUID(original["id"])
    with Session(auth_database) as db, db.begin():
        day = TripDay(trip_id=trip_id, local_date=date(2027, 3, 27))
        activity = Activity(
            day=day,
            title="Keep this plan",
            category="food",
            locked=True,
            starts_at=datetime(2027, 3, 27, 12, tzinfo=UTC),
            ends_at=datetime(2027, 3, 27, 13, tzinfo=UTC),
        )
        db.add(activity)
        db.flush()
        activity_id = activity.id
    url = f"/api/v1/trips/{trip_id}"
    for patch in [
        {"start_date": "2027-03-28"},
        {"timezone": "UTC"},
        {"budget_per_person_minor": 1},
        {"free_text_constraints": None},
    ]:
        response = alice.patch(url, json={"base_version": 1} | patch)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "TRIP_HAS_ITINERARY"
        assert alice.get(url).json() == original
    response = alice.patch(url, json={"base_version": 1, "title": "A new trip name"})
    assert response.status_code == 200 and response.json()["version"] == 2
    with Session(auth_database) as db:
        saved = db.get(Activity, activity_id)
        assert saved is not None and saved.title == "Keep this plan" and saved.locked
        assert saved.starts_at == datetime(2027, 3, 27, 12, tzinfo=UTC)
        assert db.scalar(
            select(TripDay.local_date).where(TripDay.trip_id == trip_id)
        ) == date(2027, 3, 27)


def test_untouched_unknown_legacy_budget_is_not_fabricated(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
) -> None:
    alice, _ = browsers
    original = alice.post("/api/v1/trips", json=trip_payload()).json()
    trip_id = UUID(original["id"])
    with Session(auth_database) as db, db.begin():
        db.execute(
            update(Trip).where(Trip.id == trip_id).values(budget_per_person_minor=None)
        )
    response = alice.patch(
        f"/api/v1/trips/{trip_id}",
        json={"base_version": 1, "title": "Still unspecified"},
    )
    assert response.status_code == 200
    assert response.json()["budget_per_person_minor"] is None


def test_patch_commit_failure_rolls_back_values_version_and_timestamp(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    alice, _ = browsers
    original = alice.post("/api/v1/trips", json=trip_payload()).json()
    url = f"/api/v1/trips/{original['id']}"

    def before_commit(db: Session) -> None:
        record = db.get(Trip, UUID(original["id"]))
        assert record is not None and record.version == 2
        raise SQLAlchemyError("PRIVATE_SQL_DETAILS")

    def failed_session(bind: Engine) -> Session:
        db = Session(bind)
        event.listen(db, "before_commit", before_commit)
        return db

    with monkeypatch.context() as patch:
        patch.setattr(trips, "Session", failed_session)
        response = alice.patch(url, json={"base_version": 1, "title": "Must roll back"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert "PRIVATE_SQL_DETAILS" not in response.text + caplog.text
    assert alice.get(url).json() == original
    # A failed write must release its lock and connection for the next request.
    assert (
        alice.patch(url, json={"base_version": 1, "title": "Recovered"}).status_code
        == 200
    )


def test_two_simultaneous_updates_with_same_version_have_exactly_one_winner(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    alice, _ = browsers
    original = alice.post("/api/v1/trips", json=trip_payload()).json()
    issued = create_login_session(
        VerifiedIdentity(
            "https://accounts.google.com", "alice", "alice@example.com", "Alice"
        ),
        None,
    )
    # Independent sessions avoid serializing the test on one auth-session row.
    with TestClient(app, base_url=ORIGIN, follow_redirects=False) as second:
        second.cookies.set("roam_session", issued.token, domain="127.0.0.1")
        second.cookies.set("roam_csrf", issued.csrf_token, domain="127.0.0.1")
        second.headers.update({"Origin": ORIGIN, "X-CSRF-Token": issued.csrf_token})
        barrier = Barrier(2)
        lookup = trips.get_owned_trip

        def simultaneous_lookup(
            db: Session, *, owner_id: UUID, trip_id: UUID, for_update: bool = False
        ) -> Trip | None:
            assert for_update
            barrier.wait(timeout=5)
            return lookup(db, owner_id=owner_id, trip_id=trip_id, for_update=for_update)

        def edit(browser: TestClient, title: str) -> Response:
            return browser.patch(
                f"/api/v1/trips/{original['id']}",
                json={"base_version": 1, "title": title},
            )

        with monkeypatch.context() as patch:
            patch.setattr(trips, "get_owned_trip", simultaneous_lookup)
            with ThreadPoolExecutor(max_workers=2) as pool:
                a = pool.submit(edit, alice, "First contender")
                b = pool.submit(edit, second, "Second contender")
                responses = [a.result(timeout=10), b.result(timeout=10)]
    assert sorted(response.status_code for response in responses) == [200, 409]
    success = next(
        response.json() for response in responses if response.status_code == 200
    )
    conflict = next(
        response.json() for response in responses if response.status_code == 409
    )
    assert success["version"] == 2 and conflict["error"]["details"] == {
        "current_version": 2
    }
    assert alice.get(f"/api/v1/trips/{original['id']}").json() == success
