"""Create an isolated database; never migrate, clear, or drop the developer database."""

import os
from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.db.session import dispose_database_engine, get_engine
from tests.db_support import ensure_owned_database, parse_test_admin_url
from tests.migration_support import migration_config


@pytest.fixture(scope="session")
def scratch_database(
    request: pytest.FixtureRequest,
) -> Iterator[Callable[[], AbstractContextManager[URL]]]:
    if not request.config.getoption("--run-db-tests"):
        pytest.fail(
            "Database fixtures require the explicit --run-db-tests option.",
            pytrace=False,
        )
    try:
        admin_url = parse_test_admin_url(os.environ.get("TEST_DATABASE_ADMIN_URL"))
    except ValueError as error:
        pytest.fail(str(error), pytrace=False)

    admin = create_engine(
        admin_url,
        isolation_level="AUTOCOMMIT",
        poolclass=NullPool,
        connect_args={
            "connect_timeout": 5,
            "options": "-c statement_timeout=10000 -c lock_timeout=3000",
            "hostaddr": "::1" if admin_url.host == "::1" else "127.0.0.1",
        },
        echo=False,
        hide_parameters=True,
    )
    created: set[str] = set()

    @contextmanager
    def create() -> Iterator[URL]:
        name = f"roam_test_{uuid4().hex}"
        # Internally generated identifiers only, quoted by SQLAlchemy.
        quoted_name = admin.dialect.identifier_preparer.quote(name)
        try:
            with admin.connect() as connection:
                connection.exec_driver_sql(f"CREATE DATABASE {quoted_name}")
            created.add(name)
        except SQLAlchemyError:
            pytest.fail(
                "Cannot create an isolated test database. "
                "Check local test admin credentials and CREATEDB permission.",
                pytrace=False,
            )

        try:
            yield admin_url.set(database=name)
        finally:
            ensure_owned_database(name, created)
            with admin.connect() as connection:
                connection.exec_driver_sql(f"DROP DATABASE {quoted_name}")
            created.remove(name)

    try:
        yield create
    finally:
        admin.dispose()


@pytest.fixture(scope="session")
def isolated_database_url(
    scratch_database: Callable[[], AbstractContextManager[URL]],
) -> Iterator[URL]:
    with scratch_database() as url:
        yield url


@pytest.fixture
def database_engine(
    isolated_database_url: URL, monkeypatch: pytest.MonkeyPatch
) -> Iterator[Engine]:
    dispose_database_engine()
    monkeypatch.setenv(
        "DATABASE_URL", isolated_database_url.render_as_string(hide_password=False)
    )
    engine = get_engine()
    try:
        yield engine
    finally:
        dispose_database_engine()


@pytest.fixture
def session_probe(database_engine: Engine) -> Iterator[None]:
    # Test-only table in the owned scratch database, not an application schema.
    # Milestone 2 application schema tests will use Alembic exclusively.
    with database_engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE session_probe "
                "(id integer PRIMARY KEY, value text NOT NULL)"
            )
        )
    try:
        yield
    finally:
        with database_engine.begin() as connection:
            connection.execute(text("DROP TABLE session_probe"))


@pytest.fixture
def model_session(database_engine: Engine) -> Iterator[Session]:
    # All application tables come from migrations, never metadata.create_all().
    with database_engine.connect() as connection:
        command.upgrade(migration_config(connection), "head")
        transaction = connection.begin()
        try:
            with Session(
                connection, join_transaction_mode="create_savepoint"
            ) as session:
                yield session
        finally:
            # Undo committed savepoints too, preserving test isolation.
            transaction.rollback()
