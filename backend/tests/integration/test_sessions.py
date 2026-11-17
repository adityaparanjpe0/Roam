"""Transactions must commit explicitly and release connections on every exit path."""

import pytest
from sqlalchemy import Engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.pool import QueuePool

from app.db.session import get_db_session

pytestmark = pytest.mark.database


def test_explicit_commit_is_visible_to_an_independent_session(
    database_engine: Engine, session_probe: None
) -> None:
    with Session(database_engine) as session, session.begin():
        session.execute(
            text("INSERT INTO session_probe VALUES (:id, :value)"),
            {"id": 1, "value": "committed"},
        )
    with Session(database_engine) as other:
        assert (
            other.scalar(text("SELECT value FROM session_probe WHERE id = 1"))
            == "committed"
        )


def test_dependency_close_rolls_back_uncommitted_work(
    database_engine: Engine, session_probe: None
) -> None:
    dependency = get_db_session()
    session = next(dependency)
    session.execute(text("INSERT INTO session_probe VALUES (1, 'uncommitted')"))
    dependency.close()
    with Session(database_engine) as other:
        assert other.scalar(text("SELECT count(*) FROM session_probe")) == 0


def test_dependency_exception_rolls_back_and_closes(
    database_engine: Engine, session_probe: None
) -> None:
    dependency = get_db_session()
    session = next(dependency)
    session.execute(text("INSERT INTO session_probe VALUES (1, 'failed')"))
    with pytest.raises(RuntimeError, match="synthetic failure"):
        dependency.throw(RuntimeError("synthetic failure"))
    assert isinstance(database_engine.pool, QueuePool)
    assert database_engine.pool.checkedout() == 0
    with Session(database_engine) as other:
        assert other.scalar(text("SELECT count(*) FROM session_probe")) == 0


def test_constraint_failure_rolls_back_the_complete_transaction(
    database_engine: Engine, session_probe: None
) -> None:
    with Session(database_engine) as session:
        with pytest.raises(IntegrityError):
            with session.begin():
                session.execute(text("INSERT INTO session_probe VALUES (1, 'first')"))
                session.execute(
                    text("INSERT INTO session_probe VALUES (1, 'duplicate')")
                )
        assert session.scalar(text("SELECT count(*) FROM session_probe")) == 0
