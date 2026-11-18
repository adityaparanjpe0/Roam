"""Real PostgreSQL identity upserts, independent commits, and duplicate races."""

from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import AbstractContextManager
from threading import Barrier

import pytest
from alembic import command
from pydantic import SecretStr
from sqlalchemy import Engine, func, select
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import DatabaseSettings
from app.db.models.user import User
from app.db.session import create_database_engine
from app.db.user_repository import upsert_identity
from app.domain.identity import VerifiedIdentity
from app.services.auth import UserPersistenceUnavailable, save_verified_user
from tests.migration_support import migration_config

pytestmark = pytest.mark.database
ISSUER = "https://accounts.google.com"


@pytest.fixture
def auth_database(
    scratch_database: Callable[[], AbstractContextManager[URL]],
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[Engine]:
    with scratch_database() as url:
        engine = create_database_engine(
            DatabaseSettings(
                database_url=SecretStr(url.render_as_string(hide_password=False))
            )
        )
        monkeypatch.setattr("app.services.auth.get_engine", lambda: engine)
        try:
            with engine.connect() as connection:
                command.upgrade(migration_config(connection), "head")
            yield engine
        finally:
            engine.dispose()


def test_first_login_creates_user_and_repeat_updates_only_profile(
    auth_database: Engine,
) -> None:
    first = VerifiedIdentity(ISSUER, "google-subject", "first@example.com", "First")
    user_id = save_verified_user(first)
    with Session(auth_database) as session:
        original = session.get(User, user_id)
        assert original is not None
        created_at = original.created_at
    assert (
        save_verified_user(
            VerifiedIdentity(ISSUER, "google-subject", "changed@example.com", "Changed")
        )
        == user_id
    )
    with Session(auth_database) as session:
        user = session.get(User, user_id)
        assert user is not None
        assert user.email == "changed@example.com" and user.display_name == "Changed"
        assert user.created_at == created_at
        assert user.oidc_issuer == ISSUER and user.oidc_subject == "google-subject"
        assert session.scalar(select(func.count()).select_from(User)) == 1


def test_same_email_does_not_merge_different_subjects(auth_database: Engine) -> None:
    first = save_verified_user(
        VerifiedIdentity(ISSUER, "subject-one", "same@example.com", None)
    )
    second = save_verified_user(
        VerifiedIdentity(ISSUER, "subject-two", "same@example.com", None)
    )
    assert first != second
    with Session(auth_database) as session:
        assert session.scalar(select(func.count()).select_from(User)) == 2


def test_missing_optional_name_preserves_returning_profile(
    auth_database: Engine,
) -> None:
    user_id = save_verified_user(
        VerifiedIdentity(ISSUER, "subject", "first@example.com", "Keep me")
    )
    assert (
        save_verified_user(VerifiedIdentity(ISSUER, "subject", "new@example.com", None))
        == user_id
    )
    with Session(auth_database) as session:
        assert session.get(User, user_id).display_name == "Keep me"


def test_same_subject_in_different_issuers_is_not_same_user(
    auth_database: Engine,
) -> None:
    first = save_verified_user(
        VerifiedIdentity(ISSUER, "subject", "same@example.com", None)
    )
    second = save_verified_user(
        VerifiedIdentity(
            "https://other-issuer.example", "subject", "same@example.com", None
        )
    )
    assert first != second


def test_concurrent_first_logins_return_one_durable_user(auth_database: Engine) -> None:
    barrier = Barrier(2)

    def login(index: int) -> object:
        barrier.wait(timeout=5)
        return save_verified_user(
            VerifiedIdentity(
                ISSUER, "racing-subject", f"student{index}@example.com", None
            )
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        users = list(pool.map(login, [1, 2]))
    assert users[0] == users[1]
    with Session(auth_database) as session:
        assert session.scalar(select(func.count()).select_from(User)) == 1


def test_failure_rolls_back_complete_profile_write(
    auth_database: Engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail(session: Session, identity: VerifiedIdentity) -> None:
        upsert_identity(session, identity)
        raise SQLAlchemyError("SENSITIVE")

    monkeypatch.setattr("app.services.auth.upsert_identity", fail)
    with pytest.raises(UserPersistenceUnavailable) as error:
        save_verified_user(
            VerifiedIdentity(ISSUER, "subject", "student@example.com", None)
        )
    assert "SENSITIVE" not in str(error.value)
    with Session(auth_database) as session:
        assert session.scalar(select(func.count()).select_from(User)) == 0
