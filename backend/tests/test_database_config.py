"""Database-free configuration, safety, liveness, and shutdown regression tests."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError
from sqlalchemy import event

from app.core.config import (
    DatabaseConfigurationError,
    DatabaseSettings,
    load_database_settings,
)
from app.db.session import dispose_database_engine, get_engine
from app.main import app
from tests.db_support import ensure_owned_database, parse_test_admin_url

# Synthetic, non-working credentials only; no development environment file is read.
LOCAL_URL = "postgresql+psycopg://example:synthetic-only@127.0.0.1/example"


@pytest.fixture(autouse=True)
def clear_engine() -> Iterator[None]:
    dispose_database_engine()
    yield
    dispose_database_engine()


def test_secret_is_redacted_from_settings_and_url_representation() -> None:
    settings = DatabaseSettings(database_url=SecretStr(LOCAL_URL))
    assert "synthetic-only" not in repr(settings)
    assert "synthetic-only" not in str(settings.sqlalchemy_url())


@pytest.mark.parametrize(
    "value",
    [
        "",
        "not-a-url",
        "sqlite:///example",
        "postgresql+asyncpg://u:p@localhost/example",
        "postgresql+psycopg://localhost/example",
        "postgresql+psycopg://u@localhost/example",
        "postgresql+psycopg://u:p@localhost",
        "postgresql+psycopg://u:p@localhost:99999/example",
    ],
)
def test_invalid_database_configuration_fails_without_echoing_input(
    value: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DATABASE_URL", value)
    with pytest.raises(DatabaseConfigurationError) as error:
        load_database_settings()
    if value:
        assert value not in str(error.value)


def test_missing_database_configuration_is_explicit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(DatabaseConfigurationError, match="Set DATABASE_URL"):
        load_database_settings()


def test_remote_url_requires_verified_tls() -> None:
    with pytest.raises(ValidationError, match="verify-full") as error:
        DatabaseSettings(
            database_url=SecretStr(LOCAL_URL.replace("127.0.0.1", "example.invalid"))
        )
    assert "synthetic-only" not in str(error.value)


def test_verified_tls_parameters_are_preserved() -> None:
    value = (
        LOCAL_URL.replace("127.0.0.1", "example.invalid")
        + "?sslmode=verify-full&sslrootcert=/certs/root.crt"
    )
    url = DatabaseSettings(database_url=SecretStr(value)).sqlalchemy_url()
    assert url.query["sslmode"] == "verify-full"
    assert url.query["sslrootcert"] == "/certs/root.crt"


def test_liveness_without_database_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}


def test_engine_is_lazy_cached_and_disposed_at_shutdown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", LOCAL_URL)

    def forbid_connection(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("This database-free test must never connect")

    monkeypatch.setattr("psycopg.connect", forbid_connection)
    engine = get_engine()
    assert get_engine() is engine
    disposed: list[bool] = []
    event.listen(engine, "engine_disposed", lambda _engine: disposed.append(True))
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
    assert disposed == [True]
    assert get_engine() is not engine


def test_engine_initialization_is_shared_across_threads(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", LOCAL_URL)
    with ThreadPoolExecutor(max_workers=8) as executor:
        engines = list(executor.map(lambda _index: get_engine(), range(16)))
    assert all(engine is engines[0] for engine in engines)


@pytest.mark.parametrize(
    "key", ["host", "hostaddr", "dbname", "service", "user", "password", "port"]
)
def test_query_cannot_override_explicit_connection_identity(key: str) -> None:
    with pytest.raises(ValidationError, match="query overrides"):
        DatabaseSettings(database_url=SecretStr(LOCAL_URL + f"?{key}=override"))


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        LOCAL_URL,
        LOCAL_URL.replace("127.0.0.1", "example.invalid") + "?sslmode=verify-full",
    ],
)
def test_admin_configuration_cannot_target_development_or_remote_database(
    value: str | None,
) -> None:
    with pytest.raises(ValueError):
        parse_test_admin_url(value)


def test_admin_url_must_target_local_maintenance_database() -> None:
    url = parse_test_admin_url(LOCAL_URL.rsplit("/", 1)[0] + "/postgres")
    assert url.host == "127.0.0.1" and url.database == "postgres"


@pytest.mark.parametrize(
    "name",
    [
        "roam_dev",
        "postgres",
        "roam_test_existing",
        'roam_test_"; DROP DATABASE roam_dev; --',
    ],
)
def test_cleanup_rejects_arbitrary_database_names(name: str) -> None:
    with pytest.raises(ValueError, match="Refusing to drop"):
        ensure_owned_database(name, {name})


def test_cleanup_also_requires_runtime_ownership_registration() -> None:
    name = "roam_test_" + "a" * 32
    with pytest.raises(ValueError, match="Refusing to drop"):
        ensure_owned_database(name, set())
    ensure_owned_database(name, {name})
