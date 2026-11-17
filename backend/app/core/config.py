"""Validate database configuration without exposing credentials."""

import os

from pydantic import BaseModel, ConfigDict, SecretStr, ValidationError, field_validator
from sqlalchemy.engine import URL, make_url
from sqlalchemy.exc import ArgumentError


class DatabaseConfigurationError(ValueError):
    """Database configuration is absent or invalid; messages contain no secrets."""


class DatabaseSettings(BaseModel):
    """Environment-provided connection URL; loading settings does not connect."""

    model_config = ConfigDict(frozen=True, hide_input_in_errors=True)
    database_url: SecretStr

    @field_validator("database_url")
    @classmethod
    def validate_url(cls, value: SecretStr) -> SecretStr:
        try:
            url = make_url(value.get_secret_value())
        except (ArgumentError, ValueError):
            raise ValueError("Expected a valid PostgreSQL psycopg URL") from None
        if (
            url.drivername != "postgresql+psycopg"
            or not url.host
            or not url.username
            or not url.password
            or not url.database
            or (url.port is not None and not 1 <= url.port <= 65535)
        ):
            raise ValueError(
                "Expected a PostgreSQL psycopg URL with explicit credentials, "
                "host, and database"
            )
        routing_keys = {
            "host",
            "hostaddr",
            "port",
            "dbname",
            "database",
            "user",
            "password",
            "service",
            "servicefile",
        }
        if routing_keys.intersection(url.query):
            raise ValueError("Put connection identity in the URL, not query overrides")
        if url.host not in {"127.0.0.1", "localhost", "::1", "db"}:
            if url.query.get("sslmode") != "verify-full":
                raise ValueError(
                    "Remote database connections require sslmode=verify-full"
                )
        return value

    def sqlalchemy_url(self) -> URL:
        """Return the parsed URL for the driver; never log its unredacted form."""
        return make_url(self.database_url.get_secret_value())


def load_database_settings() -> DatabaseSettings:
    """Read only on database use, keeping the liveness endpoint independent."""
    value = os.environ.get("DATABASE_URL")
    if not value:
        raise DatabaseConfigurationError(
            "Set DATABASE_URL before using database features."
        )
    try:
        return DatabaseSettings(database_url=SecretStr(value))
    except ValidationError:
        raise DatabaseConfigurationError(
            "DATABASE_URL is invalid. Use postgresql+psycopg with credentials, "
            "host, and database; remote hosts require sslmode=verify-full."
        ) from None
