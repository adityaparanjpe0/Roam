"""Validate database configuration without exposing credentials."""

import os
from typing import Literal
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    ConfigDict,
    SecretStr,
    ValidationError,
    field_validator,
    model_validator,
)
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


class OAuthConfigurationError(ValueError):
    """Auth configuration is absent/invalid; never include environment values."""


class GoogleOAuthSettings(BaseModel):
    """Explicit origins and backend credentials, loaded only on auth use."""

    model_config = ConfigDict(frozen=True, hide_input_in_errors=True)
    app_env: Literal["development", "test", "production"]
    app_base_url: str
    google_oidc_redirect_uri: str
    google_oidc_client_id: str
    google_oidc_client_secret: SecretStr

    @field_validator("google_oidc_client_id")
    @classmethod
    def validate_client_id(cls, value: str) -> str:
        if not value.endswith(".apps.googleusercontent.com") or not (
            1 <= len(value) <= 255
        ):
            raise ValueError("Expected a Google Web application client ID")
        if any(
            not (char.isascii() and (char.isalnum() or char in "-_.")) for char in value
        ):
            raise ValueError("Invalid Google client ID")
        return value

    @field_validator("google_oidc_client_secret")
    @classmethod
    def validate_client_secret(cls, value: SecretStr) -> SecretStr:
        secret = value.get_secret_value()
        if not 1 <= len(secret) <= 4096 or any(char.isspace() for char in secret):
            raise ValueError("Expected a nonblank Google client secret")
        return value

    @model_validator(mode="after")
    def validate_urls(self) -> "GoogleOAuthSettings":
        try:
            base = urlsplit(self.app_base_url)
            valid = (
                base.scheme in {"http", "https"}
                and base.hostname
                and base.username is None
                and base.password is None
                and not base.path
                and not base.query
                and not base.fragment
                and (base.port is None or 1 <= base.port <= 65535)
                and not any(
                    char.isspace() or ord(char) < 32 or char == "\\"
                    for char in self.app_base_url
                )
            )
            local = base.hostname in {"127.0.0.1", "localhost", "::1"}
            if not valid or (
                base.scheme == "http" and (self.app_env == "production" or not local)
            ):
                raise ValueError
            if self.google_oidc_redirect_uri != (
                self.app_base_url + "/auth/google/callback"
            ):
                raise ValueError
        except ValueError:
            raise ValueError(
                "Use an exact origin and its /auth/google/callback URL; "
                "HTTP is allowed only for loopback development/test."
            ) from None
        return self

    @property
    def secure_cookie(self) -> bool:
        return self.app_base_url.startswith("https://")


def load_google_oauth_settings() -> GoogleOAuthSettings:
    """Match the database loader: explicit environment, no automatic .env read."""
    names = (
        "APP_ENV",
        "APP_BASE_URL",
        "GOOGLE_OIDC_REDIRECT_URI",
        "GOOGLE_OIDC_CLIENT_ID",
        "GOOGLE_OIDC_CLIENT_SECRET",
    )
    values = {name.lower(): os.environ.get(name, "") for name in names}
    try:
        return GoogleOAuthSettings.model_validate(values)
    except ValidationError:
        raise OAuthConfigurationError(
            "Google sign-in is not configured. Check backend OAuth settings."
        ) from None
