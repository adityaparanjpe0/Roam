"""Safety checks shared by integration fixtures and their database-free tests."""

import re

from pydantic import SecretStr, ValidationError
from sqlalchemy.engine import URL

from app.core.config import DatabaseSettings


def parse_test_admin_url(value: str | None) -> URL:
    if not value:
        raise ValueError(
            "Set TEST_DATABASE_ADMIN_URL explicitly; "
            "no development URL fallback is allowed."
        )
    try:
        url = DatabaseSettings(database_url=SecretStr(value)).sqlalchemy_url()
    except ValidationError:
        raise ValueError(
            "TEST_DATABASE_ADMIN_URL must be a valid PostgreSQL psycopg URL."
        ) from None
    if url.host not in {"127.0.0.1", "localhost", "::1"} or url.database != "postgres":
        raise ValueError(
            "TEST_DATABASE_ADMIN_URL must target "
            "the local postgres maintenance database."
        )
    return url


def ensure_owned_database(name: str, created: set[str]) -> None:
    if not re.fullmatch(r"roam_test_[0-9a-f]{32}", name) or name not in created:
        raise ValueError(
            "Refusing to drop a database not created "
            "and registered by this test process."
        )
