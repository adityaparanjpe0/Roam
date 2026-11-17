"""Verify real PostgreSQL operations only in the fixture-owned database."""

from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import Engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import QueuePool

from app.core.config import DatabaseSettings
from app.db.session import create_database_engine, get_db_session

pytestmark = pytest.mark.database


def test_connects_to_isolated_postgresql(database_engine: Engine) -> None:
    with database_engine.connect() as connection:
        name = connection.scalar(text("SELECT current_database()"))
        assert isinstance(name, str) and name.startswith("roam_test_")
        assert connection.scalar(text("SELECT 1")) == 1


def test_fastapi_dependency_returns_connection_after_request(
    database_engine: Engine,
) -> None:
    test_app = FastAPI()

    @test_app.get("/probe")
    def probe(session: Annotated[Session, Depends(get_db_session)]) -> dict[str, int]:
        value = session.scalar(text("SELECT 1"))
        assert isinstance(value, int)
        return {"value": value}

    with TestClient(test_app) as client:
        assert client.get("/probe").json() == {"value": 1}
    assert isinstance(database_engine.pool, QueuePool)
    assert database_engine.pool.checkedout() == 0


def test_invalid_credentials_are_rejected_without_password_in_error(
    database_engine: Engine,
) -> None:
    invalid_password = "deliberately-invalid-test-password"
    url = database_engine.url.set(password=invalid_password)
    engine = create_database_engine(
        DatabaseSettings(
            database_url=SecretStr(url.render_as_string(hide_password=False))
        )
    )
    try:
        with pytest.raises(OperationalError) as error:
            engine.connect()
        assert invalid_password not in str(error.value)
    finally:
        engine.dispose()
