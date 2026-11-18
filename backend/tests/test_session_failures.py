"""Infrastructure failures stay distinct from invalid credentials, without leaks."""

from uuid import UUID

import pytest
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import DatabaseConfigurationError
from app.domain.identity import VerifiedIdentity
from app.domain.session import AuthenticatedSession, CurrentUser
from app.services import auth, sessions


@pytest.mark.parametrize("operation", ["login", "lookup", "logout"])
@pytest.mark.parametrize("error_type", [SQLAlchemyError, DatabaseConfigurationError])
def test_database_failures_are_safely_mapped(
    monkeypatch: pytest.MonkeyPatch, operation: str, error_type: type[Exception]
) -> None:
    def fail() -> None:
        raise error_type("PRIVATE credentials and SQL parameters")

    monkeypatch.setattr(auth, "get_engine", fail)
    monkeypatch.setattr(sessions, "get_engine", fail)
    with pytest.raises(
        (auth.UserPersistenceUnavailable, sessions.SessionsUnavailable)
    ) as caught:
        if operation == "login":
            auth.create_login_session(
                VerifiedIdentity("https://accounts.google.com", "sub", "a@b.com", None),
                "a" * 43,
            )
        elif operation == "lookup":
            sessions.authenticate_session("a" * 43)
        else:
            sessions.logout_session(
                AuthenticatedSession(
                    UUID(int=1), CurrentUser(UUID(int=2), "a@b.com", None)
                )
            )
    assert "PRIVATE" not in str(caught.value)
    assert caught.value.__suppress_context__
