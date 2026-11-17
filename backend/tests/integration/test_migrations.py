"""Exercise reversible migrations on an independent, initially empty database."""

from collections.abc import Callable
from contextlib import AbstractContextManager

import pytest
from alembic import command
from pydantic import SecretStr
from sqlalchemy import inspect, text
from sqlalchemy.engine import URL

from app.core.config import DatabaseSettings
from app.db.session import create_database_engine
from tests.migration_support import migration_config

pytestmark = pytest.mark.database
TABLES = {"users", "trips", "trip_days", "activities", "alembic_version"}


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
