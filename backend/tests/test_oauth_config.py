"""Configuration rejects unsafe deployments without exposing environment values."""

import pytest
from pydantic import ValidationError

from app.core.config import (
    GoogleOAuthSettings,
    OAuthConfigurationError,
    load_google_oauth_settings,
)

ENVIRONMENT = {
    "APP_ENV": "test",
    "APP_BASE_URL": "http://127.0.0.1:5173",
    "GOOGLE_OIDC_REDIRECT_URI": "http://127.0.0.1:5173/auth/google/callback",
    "GOOGLE_OIDC_CLIENT_ID": "test-client.apps.googleusercontent.com",
    "GOOGLE_OIDC_CLIENT_SECRET": "synthetic-secret-not-a-real-credential",
}


def test_valid_loopback_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    for name, value in ENVIRONMENT.items():
        monkeypatch.setenv(name, value)
    settings = load_google_oauth_settings()
    assert settings.secure_cookie is False
    assert "synthetic-secret" not in repr(settings)


@pytest.mark.parametrize("missing", list(ENVIRONMENT))
def test_missing_setting_fails_safely(
    monkeypatch: pytest.MonkeyPatch, missing: str
) -> None:
    for name, value in ENVIRONMENT.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv(missing)
    with pytest.raises(OAuthConfigurationError) as error:
        load_google_oauth_settings()
    assert "synthetic-secret" not in str(error.value)
    assert "test-client" not in str(error.value)


@pytest.mark.parametrize(
    "override",
    [
        {"app_env": "staging"},
        {"google_oidc_client_id": "not-google"},
        {"google_oidc_client_id": "bad value.apps.googleusercontent.com"},
        {"google_oidc_client_secret": ""},
        {"google_oidc_client_secret": " "},
        {"google_oidc_client_secret": "bad\nsecret"},
        {"google_oidc_client_secret": "x" * 4097},
        {"app_env": "production"},
        {"app_base_url": "http://roam.example"},
        {"app_base_url": "http://127.0.0.1.attacker.example:5173"},
        {"app_base_url": "https://user:password@roam.example"},
        {"app_base_url": "http://127.0.0.1:5173/"},
        {"app_base_url": "http://127.0.0.1:99999"},
        {"app_base_url": "http://127.0.0.1:5173?x=1"},
        {"app_base_url": "http://127.0.0.1:5173#fragment"},
        {"app_base_url": "http://127.0.0.1:5173\n"},
        {"google_oidc_redirect_uri": "http://127.0.0.1:8000/auth/google/callback"},
        {"google_oidc_redirect_uri": "http://127.0.0.1:5173/auth/google/callback/"},
        {"google_oidc_redirect_uri": "https://attacker.example/auth/google/callback"},
    ],
)
def test_reject_invalid_settings(override: dict[str, str]) -> None:
    data = {name.lower(): value for name, value in ENVIRONMENT.items()}
    data.update(override)
    with pytest.raises(ValidationError):
        GoogleOAuthSettings.model_validate(data)


@pytest.mark.parametrize("origin", ["https://roam.example", "https://127.0.0.1:5173"])
def test_https_production_uses_secure_cookie(origin: str) -> None:
    data = {name.lower(): value for name, value in ENVIRONMENT.items()}
    data.update(
        app_env="production",
        app_base_url=origin,
        google_oidc_redirect_uri=origin + "/auth/google/callback",
    )
    assert GoogleOAuthSettings.model_validate(data).secure_cookie is True
