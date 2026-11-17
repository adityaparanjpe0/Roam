"""Prove PostgreSQL storage and constraints through the migrated schema."""

from datetime import UTC, date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import DataError, IntegrityError
from sqlalchemy.orm import Session

from app.db.models import Activity, Trip, TripDay, User

pytestmark = pytest.mark.database


@pytest.fixture
def activity(model_session: Session) -> Activity:
    owner = User(
        oidc_issuer="https://issuer.example",
        oidc_subject="subject-1",
        email="student@example.com",
    )
    trip = Trip(
        owner=owner,
        title="Boston weekend",
        destination_label="Boston",
        timezone="America/New_York",
        start_date=date(2026, 11, 20),
        end_date=date(2026, 11, 21),
        traveler_count=2,
        currency="USD",
    )
    day = TripDay(trip=trip, local_date=date(2026, 11, 20))
    item = Activity(
        day=day,
        title="Walk by the river",
        category="outdoors",
        starts_at=datetime(2026, 11, 20, 15, tzinfo=UTC),
        ends_at=datetime(2026, 11, 20, 16, tzinfo=UTC),
    )
    model_session.add(item)
    model_session.flush()
    return item


def test_graph_round_trip_defaults_and_unknown_money(
    model_session: Session, activity: Activity
) -> None:
    item_id = activity.id
    model_session.commit()  # Fixture keeps this inside its rollback-only transaction.
    model_session.expunge_all()
    item = model_session.get(Activity, item_id)
    assert item is not None
    trip = item.day.trip
    assert trip.owner.email == "student@example.com"
    assert isinstance(item.id, UUID)
    assert item in item.day.activities and item.day in trip.days
    assert trip in trip.owner.trips
    assert trip.version == 1 and trip.status == "draft"
    assert trip.interests == [] and trip.preferences == {"schema_version": 1}
    assert trip.budget_per_person_minor is None
    assert item.estimated_cost_minor is None and item.cost_confidence == "unknown"
    assert item.locked is False and item.origin == "user_entered"
    assert item.sort_order == 0
    assert item.created_at.utcoffset() == timedelta(0)
    assert item.starts_at == datetime(2026, 11, 20, 15, tzinfo=UTC)
    assert trip.created_at.tzinfo is not None
    assert trip.owner.updated_at.tzinfo is not None


def test_integer_cost_zero_and_json_reassignment(
    model_session: Session, activity: Activity
) -> None:
    trip = activity.day.trip
    trip.budget_per_person_minor = 12500
    trip.interests = ["culture", "food"]
    trip.preferences = {"schema_version": 1, "pace": "relaxed"}
    activity.estimated_cost_minor = 0
    activity.cost_confidence = "user"
    activity.locked = True
    model_session.flush()
    model_session.expire_all()
    assert activity.estimated_cost_minor == 0
    assert activity.cost_confidence == "user" and activity.locked
    assert trip.budget_per_person_minor == 12500
    assert trip.preferences["pace"] == "relaxed" and trip.interests == [
        "culture",
        "food",
    ]


@pytest.mark.parametrize(
    ("target", "values", "constraint"),
    [
        ("trip", {"title": " "}, "ck_trips_title_nonempty"),
        ("trip", {"end_date": date(2026, 11, 19)}, "ck_trips_date_range"),
        ("trip", {"end_date": date(2026, 12, 4)}, "ck_trips_date_range"),
        ("trip", {"traveler_count": 0}, "ck_trips_traveler_count"),
        ("trip", {"traveler_count": 21}, "ck_trips_traveler_count"),
        ("trip", {"budget_per_person_minor": -1}, "ck_trips_budget_nonnegative"),
        ("trip", {"currency": "usd"}, "ck_trips_currency_format"),
        ("trip", {"status": "imaginary"}, "ck_trips_status"),
        ("trip", {"version": 0}, "ck_trips_version_positive"),
        ("trip", {"interests": {}}, "ck_trips_interests_shape"),
        ("trip", {"interests": ["food"] * 21}, "ck_trips_interests_shape"),
        ("trip", {"interests": ["x" * 2048]}, "ck_trips_interests_shape"),
        ("trip", {"preferences": []}, "ck_trips_preferences_shape"),
        ("trip", {"preferences": {}}, "ck_trips_preferences_shape"),
        ("trip", {"preferences": {"schema_version": 2}}, "ck_trips_preferences_shape"),
        (
            "trip",
            {"preferences": {"schema_version": 1, "text": "x" * 8192}},
            "ck_trips_preferences_shape",
        ),
        ("user", {"email": "Student@example.com"}, "ck_users_email_normalized"),
        ("user", {"oidc_subject": ""}, "ck_users_subject_nonempty"),
        ("activity", {"title": ""}, "ck_activities_title_nonempty"),
        (
            "activity",
            {"ends_at": datetime(2026, 11, 20, 15, tzinfo=UTC)},
            "ck_activities_time_range",
        ),
        ("activity", {"sort_order": -1}, "ck_activities_sort_order_nonnegative"),
        ("activity", {"category": "unrecognized"}, "ck_activities_category"),
        ("activity", {"origin": "provider_grounded"}, "ck_activities_origin"),
        (
            "activity",
            {"estimated_cost_minor": -1, "cost_confidence": "user"},
            "ck_activities_cost_nonnegative",
        ),
        ("activity", {"estimated_cost_minor": 100}, "ck_activities_cost_confidence"),
        ("activity", {"cost_confidence": "user"}, "ck_activities_cost_confidence"),
    ],
)
def test_database_rejects_invalid_values(
    model_session: Session,
    activity: Activity,
    target: str,
    values: dict[str, object],
    constraint: str,
) -> None:
    record = {
        "trip": activity.day.trip,
        "user": activity.day.trip.owner,
        "activity": activity,
    }[target]
    with pytest.raises(IntegrityError) as failure, model_session.begin_nested():
        model_session.execute(
            update(type(record)).where(type(record).id == record.id).values(**values)
        )
    assert failure.value.orig.diag.constraint_name == constraint


@pytest.mark.parametrize("target", ["user", "trip", "activity"])
def test_text_lengths_are_database_bounded(
    model_session: Session, activity: Activity, target: str
) -> None:
    record = {
        "user": activity.day.trip.owner,
        "trip": activity.day.trip,
        "activity": activity,
    }[target]
    field = "display_name" if target == "user" else "title"
    with pytest.raises(DataError), model_session.begin_nested():
        model_session.execute(
            update(type(record))
            .where(type(record).id == record.id)
            .values(**{field: "x" * 121})
        )


@pytest.mark.parametrize("target", ["trip", "day", "activity"])
def test_foreign_keys_reject_orphans(
    model_session: Session, activity: Activity, target: str
) -> None:
    record = {"trip": activity.day.trip, "day": activity.day, "activity": activity}[
        target
    ]
    field = {"trip": "owner_id", "day": "trip_id", "activity": "trip_day_id"}[target]
    with pytest.raises(IntegrityError) as failure, model_session.begin_nested():
        model_session.execute(
            update(type(record))
            .where(type(record).id == record.id)
            .values(**{field: uuid4()})
        )
    assert failure.value.orig.diag.constraint_name.startswith("fk_")


def test_unique_identity_pair_but_email_is_not_identity(
    model_session: Session, activity: Activity
) -> None:
    owner = activity.day.trip.owner
    with pytest.raises(IntegrityError) as failure, model_session.begin_nested():
        model_session.add(
            User(
                oidc_issuer=owner.oidc_issuer,
                oidc_subject=owner.oidc_subject,
                email="other@example.com",
            )
        )
        model_session.flush()
    assert failure.value.orig.diag.constraint_name == "uq_users_oidc_issuer"
    model_session.add(
        User(
            oidc_issuer="https://other.example",
            oidc_subject=owner.oidc_subject,
            email=owner.email,
        )
    )
    model_session.flush()
    assert model_session.scalar(select(func.count()).select_from(User)) == 2


def test_unique_day_per_trip(model_session: Session, activity: Activity) -> None:
    day = activity.day
    with pytest.raises(IntegrityError) as failure, model_session.begin_nested():
        model_session.add(TripDay(trip_id=day.trip_id, local_date=day.local_date))
        model_session.flush()
    assert failure.value.orig.diag.constraint_name == "uq_trip_days_trip_id"


def test_fourteen_inclusive_days_is_valid(
    model_session: Session, activity: Activity
) -> None:
    activity.day.trip.end_date = date(2026, 12, 3)
    model_session.flush()


def test_user_delete_restricted_and_trip_delete_cascades_in_postgresql(
    model_session: Session, activity: Activity
) -> None:
    trip_id, owner_id = activity.day.trip_id, activity.day.trip.owner_id
    with pytest.raises(IntegrityError), model_session.begin_nested():
        model_session.execute(delete(User).where(User.id == owner_id))
    # Bulk SQL bypasses ORM cascades: this proves the database cascade itself.
    model_session.execute(delete(Trip).where(Trip.id == trip_id))
    assert model_session.scalar(select(func.count()).select_from(TripDay)) == 0
    assert model_session.scalar(select(func.count()).select_from(Activity)) == 0
    assert model_session.scalar(select(func.count()).select_from(User)) == 1


def test_day_delete_cascades_activities(
    model_session: Session, activity: Activity
) -> None:
    model_session.execute(delete(TripDay).where(TripDay.id == activity.trip_day_id))
    assert model_session.scalar(select(func.count()).select_from(Activity)) == 0
    assert model_session.scalar(select(func.count()).select_from(Trip)) == 1
