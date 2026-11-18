"""Exercise reversible migrations on an independent, initially empty database."""

from collections.abc import Callable
from contextlib import AbstractContextManager
from uuid import uuid4

import pytest
from alembic import command
from pydantic import SecretStr
from sqlalchemy import insert, inspect, select, text
from sqlalchemy.engine import URL

from app.core.config import DatabaseSettings
from app.db.models import User
from app.db.session import create_database_engine
from tests.migration_support import migration_config

pytestmark = pytest.mark.database
TABLES = {"users", "sessions", "trips", "trip_days", "activities", "alembic_version"}


def test_fresh_upgrade_downgrade_upgrade_and_metadata_match(
    scratch_database: Callable[[], AbstractContextManager[URL]],
) -> None:
    with scratch_database() as url:
        settings = DatabaseSettings(
            database_url=SecretStr(url.render_as_string(hide_password=False))
        )
        engine = create_database_engine(settings)
        try:
            with engine.connect() as connection:
                assert inspect(connection).get_table_names() == []
                connection.commit()
                config = migration_config(connection)
                command.upgrade(config, "head")
                assert set(inspect(connection).get_table_names()) == TABLES
                assert connection.scalar(
                    text("SELECT version_num FROM alembic_version")
                )
                connection.commit()
                # Alembic raises if any autogenerate operation is needed.
                command.check(config)
                connection.commit()
                command.downgrade(config, "base")
                assert inspect(connection).get_table_names() == ["alembic_version"]
                assert (
                    connection.scalar(text("SELECT count(*) FROM alembic_version")) == 0
                )
                connection.commit()
                command.upgrade(config, "head")
                assert set(inspect(connection).get_table_names()) == TABLES
                command.check(config)
                connection.commit()
        finally:
            engine.dispose()


def test_session_revision_preserves_existing_users(
    scratch_database: Callable[[], AbstractContextManager[URL]],
) -> None:
    with scratch_database() as url:
        engine = create_database_engine(
            DatabaseSettings(
                database_url=SecretStr(url.render_as_string(hide_password=False))
            )
        )
        try:
            with engine.connect() as connection:
                config = migration_config(connection)
                command.upgrade(config, "0001")
                user_id = uuid4()
                connection.execute(
                    insert(User).values(
                        id=user_id,
                        oidc_issuer="https://accounts.google.com",
                        oidc_subject="existing-subject",
                        email="existing@example.com",
                    )
                )
                connection.commit()
                command.upgrade(config, "head")
                assert connection.scalar(select(User.id)) == user_id
                connection.commit()
                command.downgrade(config, "0001")
                assert "sessions" not in inspect(connection).get_table_names()
                assert connection.scalar(select(User.id)) == user_id
                connection.commit()
                command.upgrade(config, "head")
                command.check(config)
                connection.commit()
        finally:
            engine.dispose()
