"""Protected deletion, real session authorization and transactional PostgreSQL."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from threading import Barrier
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, event
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core import session_security as security
from app.db.models import Activity, Trip, TripDay, User
from app.domain.identity import VerifiedIdentity
from app.main import app
from app.services import trips
from app.services.auth import create_login_session
from tests.integration.test_trip_crud_api import NOW, ORIGIN
from tests.integration.test_trip_crud_api import auth_database as auth_database
from tests.integration.test_trip_crud_api import browsers as browsers
from tests.trip_fixtures import trip_payload

pytestmark = pytest.mark.database
MATCH = {"If-Match": '"1"'}


def add_itinerary(
    engine: Engine, trip_id: UUID, *, locked: bool = False
) -> tuple[UUID, UUID]:
    with Session(engine) as db, db.begin():
        day = TripDay(trip_id=trip_id, local_date=date(2027, 3, 27))
        activity = Activity(
            day=day,
            title="Keep this plan",
            category="food",
            locked=locked,
            starts_at=datetime(2027, 3, 27, 12, tzinfo=UTC),
            ends_at=datetime(2027, 3, 27, 13, tzinfo=UTC),
        )
        db.add(activity)
        db.flush()
        return day.id, activity.id


def test_delete_cascades_only_owned_children_and_preserves_users_and_other_trips(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
) -> None:
    alice, bob = browsers
    trip = alice.post("/api/v1/trips", json=trip_payload()).json()
    other = bob.post("/api/v1/trips", json=trip_payload()).json()
    day_id, activity_id = add_itinerary(auth_database, UUID(trip["id"]))
    other_day, other_activity = add_itinerary(
        auth_database, UUID(other["id"]), locked=True
    )
    url = f"/api/v1/trips/{trip['id']}"
    response = alice.delete(url, headers=MATCH)
    assert response.status_code == 204 and response.content == b""
    assert response.headers["cache-control"] == "no-store"
    assert alice.get(url).status_code == 404
    assert alice.get("/api/v1/trips").json()["items"] == []
    assert alice.delete(url, headers=MATCH).status_code == 404
    with Session(auth_database) as db:
        assert db.get(Trip, UUID(trip["id"])) is None
        assert db.get(TripDay, day_id) is None and db.get(Activity, activity_id) is None
        survivor = db.get(Trip, UUID(other["id"]))
        assert survivor is not None and db.get(User, survivor.owner_id) is not None
        assert (
            db.get(TripDay, other_day) is not None
            and db.get(Activity, other_activity) is not None
        )
    assert bob.get(f"/api/v1/trips/{other['id']}").json() == other
    assert alice.get("/api/auth/me").status_code == 200


def test_locked_activity_prevents_deletion_without_changing_any_records(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
) -> None:
    alice, _ = browsers
    trip = alice.post("/api/v1/trips", json=trip_payload()).json()
    trip_id = UUID(trip["id"])
    day_id, activity_id = add_itinerary(auth_database, trip_id, locked=True)
    unlocked_day = TripDay(trip_id=trip_id, local_date=date(2027, 3, 28))
    with Session(auth_database) as db, db.begin():
        db.add(unlocked_day)
        db.flush()
        unlocked_day_id = unlocked_day.id
    url = f"/api/v1/trips/{trip_id}"
    response = alice.delete(url, headers=MATCH)
    assert (
        response.status_code == 409
        and response.json()["error"]["code"] == "LOCKED_ACTIVITY"
    )
    assert response.json()["error"]["details"] == {}
    assert alice.get(url).json() == trip
    with Session(auth_database) as db:
        activity = db.get(Activity, activity_id)
        assert (
            activity is not None
            and activity.locked
            and activity.title == "Keep this plan"
        )
        assert (
            db.get(TripDay, day_id) is not None
            and db.get(TripDay, unlocked_day_id) is not None
        )


def test_owner_lookup_precedes_version_disclosure_and_stale_delete_preserves_trip(
    browsers: tuple[TestClient, TestClient],
) -> None:
    alice, bob = browsers
    trip = alice.post("/api/v1/trips", json=trip_payload()).json()
    url = f"/api/v1/trips/{trip['id']}"
    updated = alice.patch(
        url, json={"base_version": 1, "title": "Keep this edit"}
    ).json()
    stale = alice.delete(url, headers=MATCH)
    assert (
        stale.status_code == 409 and stale.json()["error"]["code"] == "VERSION_CONFLICT"
    )
    assert stale.json()["error"]["details"] == {"current_version": 2}
    for target in [trip["id"], str(uuid4())]:
        response = bob.delete(f"/api/v1/trips/{target}", headers=MATCH)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "RESOURCE_NOT_FOUND"
        assert response.json()["error"]["details"] == {}
    assert alice.get(url).json() == updated
    assert alice.delete(url, headers={"If-Match": '"2"'}).status_code == 204


@pytest.mark.parametrize(
    "failure",
    ["missing_csrf", "wrong_csrf", "origin", "missing_session", "revoked", "expired"],
)
def test_delete_requires_real_authentication_and_csrf(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
    monkeypatch: pytest.MonkeyPatch,
    failure: str,
) -> None:
    alice, bob = browsers
    trip = alice.post("/api/v1/trips", json=trip_payload()).json()
    url = f"/api/v1/trips/{trip['id']}"
    if failure == "missing_csrf":
        del alice.headers["X-CSRF-Token"]
    elif failure == "wrong_csrf":
        alice.headers["X-CSRF-Token"] = bob.headers["X-CSRF-Token"]
    elif failure == "origin":
        alice.headers["Origin"] = "https://attacker.example"
    elif failure == "missing_session":
        alice.cookies.clear()
    elif failure == "expired":
        monkeypatch.setattr(security, "utc_now", lambda: NOW + timedelta(days=8))
    else:
        assert alice.post("/api/auth/logout").status_code == 204
    response = alice.delete(url, headers=MATCH)
    assert response.status_code == (
        403 if failure in {"missing_csrf", "wrong_csrf", "origin"} else 401
    )
    assert response.json()["error"]["code"] == (
        "CSRF_FAILED" if response.status_code == 403 else "AUTHENTICATION_REQUIRED"
    )
    with Session(auth_database) as db:
        saved = db.get(Trip, UUID(trip["id"]))
        assert saved is not None and saved.version == 1 and saved.title == trip["title"]


def test_commit_failure_rolls_back_parent_and_cascaded_children_and_releases_lock(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    alice, _ = browsers
    trip = alice.post("/api/v1/trips", json=trip_payload()).json()
    trip_id = UUID(trip["id"])
    day_id, activity_id = add_itinerary(auth_database, trip_id)

    def before_commit(db: Session) -> None:
        assert db.get(Trip, trip_id) is None
        assert db.get(Activity, activity_id) is None
        raise SQLAlchemyError("PRIVATE_SQL_DETAILS")

    def failed_session(bind: Engine) -> Session:
        db = Session(bind)
        event.listen(db, "before_commit", before_commit)
        return db

    url = f"/api/v1/trips/{trip_id}"
    with monkeypatch.context() as patch:
        patch.setattr(trips, "Session", failed_session)
        response = alice.delete(url, headers=MATCH)
    assert (
        response.status_code == 503
        and response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    )
    assert "PRIVATE_SQL_DETAILS" not in response.text + caplog.text
    assert alice.get(url).json() == trip
    with Session(auth_database) as db:
        assert (
            db.get(TripDay, day_id) is not None
            and db.get(Activity, activity_id) is not None
        )
    assert alice.delete(url, headers=MATCH).status_code == 204


@pytest.mark.parametrize("competing_method", ["delete", "patch"])
def test_concurrent_deletion_and_mutation_have_no_lost_write(
    browsers: tuple[TestClient, TestClient],
    monkeypatch: pytest.MonkeyPatch,
    competing_method: str,
) -> None:
    alice, _ = browsers
    trip = alice.post("/api/v1/trips", json=trip_payload()).json()
    url = f"/api/v1/trips/{trip['id']}"
    issued = create_login_session(
        VerifiedIdentity(
            "https://accounts.google.com", "alice", "alice@example.com", "Alice"
        ),
        None,
    )
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

        with monkeypatch.context() as patch:
            patch.setattr(trips, "get_owned_trip", simultaneous_lookup)
            with ThreadPoolExecutor(max_workers=2) as pool:
                deletion = pool.submit(alice.delete, url, headers=MATCH)
                mutation = pool.submit(
                    second.request,
                    competing_method,
                    url,
                    headers=MATCH,
                    **(
                        {"json": {"base_version": 1, "title": "Concurrent edit"}}
                        if competing_method == "patch"
                        else {}
                    ),
                )
                deleted, modified = (
                    deletion.result(timeout=10),
                    mutation.result(timeout=10),
                )
    if competing_method == "delete":
        assert sorted([deleted.status_code, modified.status_code]) == [204, 404]
        assert alice.get(url).status_code == 404
    elif deleted.status_code == 204:
        assert modified.status_code == 404 and alice.get(url).status_code == 404
    else:
        assert deleted.status_code == 409 and modified.status_code == 200
        assert deleted.json()["error"]["details"] == {"current_version": 2}
        assert alice.get(url).json() == modified.json()
