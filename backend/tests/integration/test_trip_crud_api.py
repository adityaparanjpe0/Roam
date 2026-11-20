"""HTTP, real session/CSRF checks, and PostgreSQL in fixture-owned databases."""

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, event, func, select, text, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.api.sessions import get_session_settings
from app.core import session_security as security
from app.db.models import AppSession, Trip, TripDay
from app.domain.identity import VerifiedIdentity
from app.main import app
from app.services import trips
from app.services.auth import create_login_session
from tests.integration.test_google_users import auth_database as auth_database
from tests.trip_fixtures import trip_payload

pytestmark = pytest.mark.database
ORIGIN = "http://127.0.0.1:5173"
NOW = datetime(2030, 1, 1, tzinfo=UTC)


@pytest.fixture
def browsers(
    auth_database: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[TestClient, TestClient]]:
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("APP_BASE_URL", ORIGIN)
    # Existing sessions work even when Google credentials/network are unavailable.
    monkeypatch.delenv("GOOGLE_OIDC_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_OIDC_CLIENT_SECRET", raising=False)
    monkeypatch.setattr(security, "utc_now", lambda: NOW)
    monkeypatch.setattr("app.services.sessions.get_engine", lambda: auth_database)
    monkeypatch.setattr(trips, "get_engine", lambda: auth_database)
    get_session_settings.cache_clear()
    try:
        with (
            TestClient(app, base_url=ORIGIN, follow_redirects=False) as alice,
            TestClient(app, base_url=ORIGIN, follow_redirects=False) as bob,
        ):
            for browser, subject in [(alice, "alice"), (bob, "bob")]:
                issued = create_login_session(
                    VerifiedIdentity(
                        "https://accounts.google.com",
                        subject,
                        subject + "@example.com",
                        subject.title(),
                    ),
                    None,
                )
                browser.cookies.set("roam_session", issued.token, domain="127.0.0.1")
                browser.cookies.set("roam_csrf", issued.csrf_token, domain="127.0.0.1")
                browser.headers.update(
                    {"Origin": ORIGIN, "X-CSRF-Token": issued.csrf_token}
                )
            yield alice, bob
    finally:
        get_session_settings.cache_clear()


def test_create_commits_owned_draft_and_detail_round_trips(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
) -> None:
    alice, _ = browsers
    owner_id = alice.get("/api/auth/me").json()["user"]["id"]
    response = alice.post("/api/v1/trips", json=trip_payload())
    assert response.status_code == 201
    trip = response.json()
    trip_id = UUID(trip["id"])
    assert response.headers["location"] == f"/api/v1/trips/{trip_id}"
    assert response.headers["cache-control"] == "no-store"
    assert trip["title"] == trip["destination_label"] == "Lisbon, Portugal"
    assert trip["status"] == "draft" and trip["version"] == 1
    assert trip["budget_per_person_minor"] == 75050 and trip["interests"] == [
        "food",
        "culture",
    ]
    assert trip["created_at"].endswith("Z") and trip["updated_at"].endswith("Z")
    assert not {
        "owner_id",
        "preferences",
        "destination_provider_id",
        "days",
    }.intersection(trip)
    with Session(auth_database) as db:
        record = db.get(Trip, trip_id)
        assert record is not None and str(record.owner_id) == owner_id
        assert record.preferences == {"schema_version": 1}
        assert record.destination_provider_id is None
        assert db.scalar(select(func.count()).select_from(TripDay)) == 0
    detail = alice.get(response.headers["location"])
    assert detail.status_code == 200 and detail.json() == trip
    assert detail.headers["cache-control"] == "no-store"


def test_other_owner_and_missing_trip_are_indistinguishable(
    browsers: tuple[TestClient, TestClient],
) -> None:
    alice, bob = browsers
    trip = alice.post("/api/v1/trips", json=trip_payload()).json()
    private = bob.get(f"/api/v1/trips/{trip['id']}")
    absent = bob.get(f"/api/v1/trips/{uuid4()}")
    assert private.status_code == absent.status_code == 404
    for response in [private, absent]:
        error = response.json()["error"]
        assert error["code"] == "RESOURCE_NOT_FOUND"
        assert error["message"] == "Trip not found." and error["details"] == {}
        assert response.headers["x-request-id"] == error["request_id"]
        assert trip["destination_label"] not in response.text
    assert private.json()["error"]["request_id"] != absent.json()["error"]["request_id"]


def test_list_contains_only_owner_trips_and_uses_compact_summaries(
    browsers: tuple[TestClient, TestClient],
) -> None:
    alice, bob = browsers
    assert alice.get("/api/v1/trips").json() == {"items": [], "next_cursor": None}
    own = alice.post("/api/v1/trips", json=trip_payload()).json()
    bob.post("/api/v1/trips", json=trip_payload() | {"title": "Bob's private trip"})
    response = alice.get("/api/v1/trips")
    assert (
        response.status_code == 200 and response.headers["cache-control"] == "no-store"
    )
    page = response.json()
    assert [item["id"] for item in page["items"]] == [own["id"]]
    assert set(page["items"][0]) == {
        "id",
        "title",
        "destination_label",
        "start_date",
        "end_date",
        "version",
        "updated_at",
    }
    assert page["next_cursor"] is None and "Bob's private trip" not in response.text


def test_cursor_pages_equal_timestamps_without_duplicates_and_never_grants_ownership(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
) -> None:
    alice, bob = browsers
    ids = [
        alice.post("/api/v1/trips", json=trip_payload()).json()["id"] for _ in range(5)
    ]
    bob.post("/api/v1/trips", json=trip_payload())
    bob.post("/api/v1/trips", json=trip_payload())
    with Session(auth_database) as db, db.begin():
        db.execute(update(Trip).values(updated_at=NOW))
    found: list[str] = []
    cursor = None
    while True:
        params = {"limit": "2"}
        if cursor is not None:
            params["cursor"] = cursor
        response = alice.get("/api/v1/trips", params=params)
        assert response.status_code == 200
        page = response.json()
        assert len(page["items"]) <= 2
        found.extend(item["id"] for item in page["items"])
        cursor = page["next_cursor"]
        if cursor is None:
            break
        assert (
            len(found) < 10
        )  # Fail rather than loop forever if cursor progression breaks.
    assert found == sorted(ids) and len(set(found)) == 5
    foreign_cursor = bob.get("/api/v1/trips?limit=1").json()["next_cursor"]
    foreign_page = alice.get("/api/v1/trips", params={"cursor": foreign_cursor}).json()
    assert {item["id"] for item in foreign_page["items"]}.issubset(ids)


def test_updated_time_precedes_uuid_in_list_order(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
) -> None:
    alice, _ = browsers
    first = alice.post("/api/v1/trips", json=trip_payload()).json()["id"]
    second = alice.post("/api/v1/trips", json=trip_payload()).json()["id"]
    with Session(auth_database) as db, db.begin():
        db.execute(
            update(Trip)
            .where(Trip.id == UUID(first))
            .values(updated_at=datetime(2030, 2, 1, tzinfo=UTC))
        )
        db.execute(update(Trip).where(Trip.id == UUID(second)).values(updated_at=NOW))
    page = alice.get("/api/v1/trips?limit=1").json()
    assert page["items"][0]["id"] == first and page["next_cursor"]
    following = alice.get(
        "/api/v1/trips", params={"cursor": page["next_cursor"]}
    ).json()
    assert [item["id"] for item in following["items"]] == [second]


@pytest.mark.parametrize("failure", ["header", "cookie", "origin", "duplicate-header"])
def test_post_requires_session_bound_csrf_and_trusted_origin(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
    failure: str,
) -> None:
    alice, _ = browsers
    if failure == "header":
        del alice.headers["X-CSRF-Token"]
    elif failure == "cookie":
        alice.cookies.delete("roam_csrf", domain="127.0.0.1")
    elif failure == "origin":
        alice.headers["Origin"] = "https://other.example"
    else:
        alice.headers.pop("X-CSRF-Token")
    response = alice.post(
        "/api/v1/trips",
        json=trip_payload(),
        headers=[("X-CSRF-Token", "a" * 43), ("X-CSRF-Token", "a" * 43)]
        if failure == "duplicate-header"
        else None,
    )
    assert (
        response.status_code == 403
        and response.json()["error"]["code"] == "CSRF_FAILED"
    )
    with Session(auth_database) as db:
        assert db.scalar(select(func.count()).select_from(Trip)) == 0


def test_rejects_foreign_csrf_and_owner_spoofing(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
) -> None:
    alice, bob = browsers
    alice.headers["X-CSRF-Token"] = bob.headers["X-CSRF-Token"]
    response = alice.post("/api/v1/trips", json=trip_payload())
    assert response.status_code == 403
    alice.headers["X-CSRF-Token"] = alice.cookies.get("roam_csrf")
    response = alice.post(
        "/api/v1/trips", json=trip_payload() | {"owner_id": str(uuid4())}
    )
    assert response.status_code == 422
    with Session(auth_database) as db:
        assert db.scalar(select(func.count()).select_from(Trip)) == 0


def test_post_commit_failure_rolls_back_and_does_not_return_success(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    alice, _ = browsers

    def before_commit(session: Session) -> None:
        # Prove the insert reached PostgreSQL before the commit failure.
        assert session.scalar(select(func.count()).select_from(Trip)) == 1
        raise SQLAlchemyError("PRIVATE_SQL_DETAILS")

    def failed_commit_session(bind: Engine) -> Session:
        session = Session(bind)
        event.listen(session, "before_commit", before_commit)
        return session

    monkeypatch.setattr(trips, "Session", failed_commit_session)
    response = alice.post("/api/v1/trips", json=trip_payload())
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "DATABASE_UNAVAILABLE"
    assert "location" not in response.headers
    assert "PRIVATE_SQL_DETAILS" not in response.text + caplog.text
    with Session(auth_database) as db:
        assert db.scalar(select(func.count()).select_from(Trip)) == 0
        assert db.scalar(text("SELECT 1")) == 1


def test_repeated_posts_are_distinct_and_legacy_unknown_budget_is_readable(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
) -> None:
    alice, _ = browsers
    first = alice.post("/api/v1/trips", json=trip_payload()).json()
    second = alice.post("/api/v1/trips", json=trip_payload()).json()
    assert first["id"] != second["id"]
    with Session(auth_database) as db, db.begin():
        db.execute(
            update(Trip)
            .where(Trip.id == UUID(first["id"]))
            .values(budget_per_person_minor=None)
        )
    response = alice.get(f"/api/v1/trips/{first['id']}")
    assert (
        response.status_code == 200
        and response.json()["budget_per_person_minor"] is None
    )


@pytest.mark.parametrize("condition", ["revoked", "expired"])
def test_invalidated_real_session_cannot_use_trip_routes(
    browsers: tuple[TestClient, TestClient],
    auth_database: Engine,
    condition: str,
) -> None:
    alice, _ = browsers
    token = alice.cookies.get("roam_session")
    csrf = alice.cookies.get("roam_csrf")
    with Session(auth_database) as db, db.begin():
        statement = update(AppSession).where(
            AppSession.token_hash == security.token_hash(token)
        )
        if condition == "revoked":
            statement = statement.values(revoked_at=NOW)
        else:
            statement = statement.values(
                created_at=NOW - timedelta(days=7),
                expires_at=NOW,
                last_seen_at=NOW - timedelta(hours=1),
            )
        db.execute(statement)
    assert token is not None and csrf is not None
    for method, path in [
        ("get", "/api/v1/trips"),
        ("get", f"/api/v1/trips/{uuid4()}"),
        ("post", "/api/v1/trips"),
    ]:
        # A 401 clears browser cookies; resubmit the invalid token for each route.
        alice.cookies.set("roam_session", token, domain="127.0.0.1")
        alice.cookies.set("roam_csrf", csrf, domain="127.0.0.1")
        response = alice.request(
            method, path, json=trip_payload() if method == "post" else None
        )
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "AUTHENTICATION_REQUIRED"
    with Session(auth_database) as db:
        assert db.scalar(select(func.count()).select_from(Trip)) == 0
