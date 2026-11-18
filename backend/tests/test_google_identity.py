"""Real RSA signature and Authlib OIDC validation; no Google calls/credentials."""

import httpx
import pytest
from joserfc import jwt
from joserfc.jwk import KeySet, OctKey, RSAKey

from app.core.config import GoogleOAuthSettings
from app.core.oauth_flow import PendingLogin
from app.providers.google_oidc import (
    EmailNotVerified,
    GoogleDiscoveryError,
    GoogleIdentityError,
    GoogleOidcClient,
)
from tests.test_oauth_config import ENVIRONMENT
from tests.test_oauth_login import METADATA, mock_discovery

NOW = 2_000_000_000
NONCE = "synthetic-nonce"
ACCESS_TOKEN = "synthetic-access-token"


@pytest.fixture(scope="module")
def signing_key() -> RSAKey:
    # Ephemeral test-only keys: never stored or used by the application.
    key = RSAKey.generate_key(2048)
    key.ensure_kid()
    return key


@pytest.fixture
def claims() -> dict[str, object]:
    return {
        "iss": "https://accounts.google.com",
        "sub": "stable-subject",
        "aud": ENVIRONMENT["GOOGLE_OIDC_CLIENT_ID"],
        "iat": NOW - 60,
        "exp": NOW + 600,
        "nonce": NONCE,
        "email": "Student@Example.COM",
        "email_verified": True,
        "name": "Student",
    }


@pytest.fixture
def oidc_client(
    monkeypatch: pytest.MonkeyPatch, signing_key: RSAKey
) -> GoogleOidcClient:
    settings = GoogleOAuthSettings.model_validate(
        {key.lower(): value for key, value in ENVIRONMENT.items()}
    )
    client = GoogleOidcClient(settings)
    key_set = KeySet.import_key_set({"keys": [signing_key.as_dict(private=False)]})
    monkeypatch.setattr("app.providers.google_oidc.time", lambda: NOW)
    monkeypatch.setattr(client, "_trusted_keys", lambda **_: key_set)

    # No unexpected live network call can accidentally pass these unit tests.
    def deny(*args: object, **kwargs: object) -> None:
        raise AssertionError("Unexpected network")

    monkeypatch.setattr(httpx.HTTPTransport, "handle_request", deny)
    return client


def token(claims: dict[str, object], key: RSAKey) -> dict[str, object]:
    return {
        "id_token": jwt.encode({"alg": "RS256", "kid": key.kid}, claims, key),
        "access_token": ACCESS_TOKEN,
    }


def test_verified_claims_become_minimal_identity(
    oidc_client: GoogleOidcClient, claims: dict[str, object], signing_key: RSAKey
) -> None:
    identity = oidc_client.validate_identity_token(token(claims, signing_key), NONCE)
    assert identity.subject == "stable-subject"
    assert identity.issuer == "https://accounts.google.com"
    assert identity.email == "student@example.com"
    assert identity.display_name == "Student"
    assert ACCESS_TOKEN not in repr(identity)


@pytest.mark.parametrize(
    "overrides",
    [
        {"iss": "https://attacker.example"},
        {"aud": "another-client"},
        {"aud": []},
        {"exp": NOW - 31},
        {"exp": True},
        {"iat": NOW + 31},
        {"nonce": "wrong"},
        {"nonce": "wrong", "nonce_supported": False},
        {"azp": "another-client"},
        {"sub": ""},
        {"sub": 123},
        {"sub": "s" * 256},
        {"email": "not-an-email"},
        {"email": "a@"},
        {"email": "a @example.com"},
        {"name": 123},
        {"name": "bad\x00name"},
        {"at_hash": "wrong-hash"},
        {"aud": [ENVIRONMENT["GOOGLE_OIDC_CLIENT_ID"], "other"]},
    ],
)
def test_invalid_claims_fail_closed(
    oidc_client: GoogleOidcClient,
    claims: dict[str, object],
    signing_key: RSAKey,
    overrides: dict[str, object],
) -> None:
    claims.update(overrides)
    with pytest.raises(GoogleIdentityError):
        oidc_client.validate_identity_token(token(claims, signing_key), NONCE)


@pytest.mark.parametrize(
    "missing", ["iss", "sub", "aud", "exp", "iat", "nonce", "email"]
)
def test_required_claims(
    oidc_client: GoogleOidcClient,
    claims: dict[str, object],
    signing_key: RSAKey,
    missing: str,
) -> None:
    del claims[missing]
    with pytest.raises(GoogleIdentityError):
        oidc_client.validate_identity_token(token(claims, signing_key), NONCE)


@pytest.mark.parametrize("verified", [False, None, "true", "false", 1, 0])
def test_email_verified_requires_literal_boolean_true(
    oidc_client: GoogleOidcClient,
    claims: dict[str, object],
    signing_key: RSAKey,
    verified: object,
) -> None:
    claims["email_verified"] = verified
    with pytest.raises(EmailNotVerified):
        oidc_client.validate_identity_token(token(claims, signing_key), NONCE)


def test_missing_email_verified_is_rejected(
    oidc_client: GoogleOidcClient, claims: dict[str, object], signing_key: RSAKey
) -> None:
    del claims["email_verified"]
    with pytest.raises(EmailNotVerified):
        oidc_client.validate_identity_token(token(claims, signing_key), NONCE)


def test_legacy_issuer_is_normalized_after_validation(
    oidc_client: GoogleOidcClient, claims: dict[str, object], signing_key: RSAKey
) -> None:
    claims["iss"] = "accounts.google.com"
    claims["name"] = "Long name " * 30
    identity = oidc_client.validate_identity_token(token(claims, signing_key), NONCE)
    assert identity.issuer == "https://accounts.google.com"
    assert identity.display_name is not None and len(identity.display_name) == 120


def test_multiple_audiences_require_matching_authorized_party(
    oidc_client: GoogleOidcClient, claims: dict[str, object], signing_key: RSAKey
) -> None:
    claims.update(
        aud=[ENVIRONMENT["GOOGLE_OIDC_CLIENT_ID"], "other"],
        azp=ENVIRONMENT["GOOGLE_OIDC_CLIENT_ID"],
    )
    assert (
        oidc_client.validate_identity_token(token(claims, signing_key), NONCE).subject
        == "stable-subject"
    )


def test_wrong_signature_and_embedded_key_cannot_override_trust(
    oidc_client: GoogleOidcClient, claims: dict[str, object], signing_key: RSAKey
) -> None:
    attacker = RSAKey.generate_key(2048)
    raw = jwt.encode(
        {
            "alg": "RS256",
            "kid": signing_key.kid,
            "jwk": attacker.as_dict(private=False),
        },
        claims,
        attacker,
    )
    with pytest.raises(GoogleIdentityError):
        oidc_client.validate_identity_token(
            {"id_token": raw, "access_token": ACCESS_TOKEN}, NONCE
        )


def test_hmac_token_rejected(
    oidc_client: GoogleOidcClient, claims: dict[str, object]
) -> None:
    raw = jwt.encode({"alg": "HS256"}, claims, OctKey.generate_key(256))
    with pytest.raises(GoogleIdentityError):
        oidc_client.validate_identity_token(
            {"id_token": raw, "access_token": ACCESS_TOKEN}, NONCE
        )


@pytest.mark.parametrize("raw", [None, "", "not-a-token", "x" * 16385])
def test_malformed_tokens_rejected(oidc_client: GoogleOidcClient, raw: object) -> None:
    with pytest.raises(GoogleIdentityError):
        oidc_client.validate_identity_token(
            {"id_token": raw, "access_token": ACCESS_TOKEN}, NONCE
        )


def test_code_exchange_uses_library_pkce_and_no_persistent_token_state(
    monkeypatch: pytest.MonkeyPatch,
    claims: dict[str, object],
    signing_key: RSAKey,
) -> None:
    settings = GoogleOAuthSettings.model_validate(
        {key.lower(): value for key, value in ENVIRONMENT.items()}
    )
    client = GoogleOidcClient(settings)
    monkeypatch.setattr("app.providers.google_oidc.time", lambda: NOW)
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("openid-configuration"):
            return httpx.Response(200, json=METADATA)
        if request.url.path == "/token":
            from urllib.parse import parse_qs

            payload = parse_qs(request.content.decode())
            assert payload["grant_type"] == ["authorization_code"]
            assert payload["code"] == ["synthetic-code"]
            assert payload["code_verifier"] == ["synthetic-verifier"]
            assert payload["redirect_uri"] == [ENVIRONMENT["GOOGLE_OIDC_REDIRECT_URI"]]
            assert (
                request.headers["authorization"]
                == httpx.BasicAuth(
                    ENVIRONMENT["GOOGLE_OIDC_CLIENT_ID"],
                    ENVIRONMENT["GOOGLE_OIDC_CLIENT_SECRET"],
                )._auth_header
            )
            return httpx.Response(
                200,
                json={**token(claims, signing_key), "refresh_token": "discard-this"},
            )
        assert request.url.path == "/oauth2/v3/certs"
        return httpx.Response(200, json={"keys": [signing_key.as_dict(private=False)]})

    mock_discovery(monkeypatch, respond)
    flow = PendingLogin(
        "state", NONCE, "synthetic-verifier", settings.google_oidc_redirect_uri, 600
    )
    identity = client.exchange_identity("synthetic-code", flow)
    assert identity.subject == "stable-subject"
    assert [request.method for request in requests] == ["GET", "POST", "GET"]
    assert not hasattr(client, "token")
    assert "discard-this" not in repr(identity)


@pytest.mark.parametrize(
    "failure", ["invalid_grant", "timeout", "redirect", "malformed"]
)
def test_failed_exchange_is_not_retried(
    monkeypatch: pytest.MonkeyPatch, failure: str
) -> None:
    settings = GoogleOAuthSettings.model_validate(
        {key.lower(): value for key, value in ENVIRONMENT.items()}
    )
    client = GoogleOidcClient(settings)
    calls: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("openid-configuration"):
            return httpx.Response(200, json=METADATA)
        calls.append(request.method)
        if failure == "timeout":
            raise httpx.ReadTimeout("SENSITIVE", request=request)
        if failure == "redirect":
            return httpx.Response(302, headers={"location": "https://attacker.example"})
        if failure == "malformed":
            return httpx.Response(200, json={"access_token": ACCESS_TOKEN})
        return httpx.Response(
            400, json={"error": "invalid_grant", "error_description": "SENSITIVE"}
        )

    mock_discovery(monkeypatch, respond)
    flow = PendingLogin(
        "state", NONCE, "verifier", settings.google_oidc_redirect_uri, 600
    )
    with pytest.raises((GoogleIdentityError, GoogleDiscoveryError)) as error:
        client.exchange_identity("synthetic-code", flow)
    assert calls == ["POST"]
    assert "SENSITIVE" not in str(error.value)


@pytest.mark.parametrize(
    "document",
    [
        {},
        {"keys": None},
        {"keys": []},
        {"keys": [None]},
        {"keys": [{"kty": "unknown"}]},
    ],
)
def test_bad_jwks_fails_safely(
    monkeypatch: pytest.MonkeyPatch, document: object
) -> None:
    settings = GoogleOAuthSettings.model_validate(
        {key.lower(): value for key, value in ENVIRONMENT.items()}
    )
    client = GoogleOidcClient(settings)

    def respond(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json=METADATA
            if request.url.path.endswith("openid-configuration")
            else document,
        )

    mock_discovery(monkeypatch, respond)
    with pytest.raises(GoogleDiscoveryError):
        client._trusted_keys()


def test_unknown_kid_refreshes_only_trusted_google_jwks(
    monkeypatch: pytest.MonkeyPatch,
    signing_key: RSAKey,
    claims: dict[str, object],
) -> None:
    replacement = RSAKey.generate_key(2048)
    replacement.ensure_kid()
    settings = GoogleOAuthSettings.model_validate(
        {key.lower(): value for key, value in ENVIRONMENT.items()}
    )
    client = GoogleOidcClient(settings)
    monkeypatch.setattr("app.providers.google_oidc.time", lambda: NOW)
    fetched: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("openid-configuration"):
            return httpx.Response(200, json=METADATA)
        fetched.append(str(request.url))
        assert str(request.url) == METADATA["jwks_uri"]
        key = signing_key if len(fetched) == 1 else replacement
        return httpx.Response(200, json={"keys": [key.as_dict(private=False)]})

    mock_discovery(monkeypatch, respond)
    client._trusted_keys()
    assert (
        client.validate_identity_token(token(claims, replacement), NONCE).subject
        == "stable-subject"
    )
    assert len(fetched) == 2


def test_non_success_token_status_cannot_be_accepted(
    monkeypatch: pytest.MonkeyPatch,
    signing_key: RSAKey,
    claims: dict[str, object],
) -> None:
    settings = GoogleOAuthSettings.model_validate(
        {key.lower(): value for key, value in ENVIRONMENT.items()}
    )
    client = GoogleOidcClient(settings)
    calls: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("openid-configuration"):
            return httpx.Response(200, json=METADATA)
        calls.append(request.method)
        return httpx.Response(400, json=token(claims, signing_key))

    mock_discovery(monkeypatch, respond)
    flow = PendingLogin(
        "state", NONCE, "verifier", settings.google_oidc_redirect_uri, 600
    )
    with pytest.raises(GoogleIdentityError):
        client.exchange_identity("synthetic-code", flow)
    assert calls == ["POST"]
