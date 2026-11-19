"""Bounded Google I/O with Authlib OAuth and maintained JOSE/OIDC validation."""

from threading import Lock
from time import monotonic, time
from typing import Literal

import httpx
from authlib.common.security import generate_token
from authlib.oauth2.base import OAuth2Error
from authlib.oauth2.client import OAuth2Client
from authlib.oidc.core import CodeIDToken
from joserfc import jwt
from joserfc.errors import InvalidKeyIdError, JoseError
from joserfc.jwk import KeySet
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.core.config import GoogleOAuthSettings
from app.core.oauth_flow import PendingLogin
from app.domain.identity import VerifiedIdentity

GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
GOOGLE_SCOPES = "openid email profile"


class GoogleDiscoveryError(ValueError):
    """Safe error boundary: do not expose upstream URLs, bodies, or exceptions."""


class GoogleIdentityError(ValueError):
    """Invalid authorization code, token, or profile; no underlying details."""


class EmailNotVerified(GoogleIdentityError):
    """The signed identity does not satisfy Roam's verified-email policy."""


class _GoogleProfile(BaseModel):
    model_config = ConfigDict(strict=True, hide_input_in_errors=True)
    sub: str = Field(min_length=1, max_length=255)
    email: str = Field(min_length=3, max_length=254)
    name: str | None = None

    @field_validator("sub")
    @classmethod
    def valid_subject(cls, value: str) -> str:
        if not value.strip() or any(ord(char) < 32 for char in value):
            raise ValueError("Invalid subject")
        return value  # Never lowercase/trim an external identifier.

    @field_validator("email")
    @classmethod
    def normalized_email(cls, value: str) -> str:
        value = value.strip().lower()
        if value.count("@") != 1 or any(
            char.isspace() or ord(char) < 32 for char in value
        ):
            raise ValueError("Invalid email")
        local, domain = value.split("@")
        if not local or not domain:
            raise ValueError("Invalid email")
        return value

    @field_validator("name")
    @classmethod
    def bounded_name(cls, value: str | None) -> str | None:
        if value is not None and any(ord(char) < 32 for char in value):
            raise ValueError("Invalid display name")
        return (value.strip()[:120] or None) if value is not None else None


def _bounded_response(
    method: str,
    url: str,
    *,
    data: dict[str, str] | None = None,
    headers: dict[str, str] | None = None,
    auth: httpx.BasicAuth | None = None,
) -> httpx.Response:
    """No retries, proxy inheritance, redirects, or unbounded response bodies."""
    deadline = monotonic() + 5.0
    with httpx.Client(timeout=5.0, follow_redirects=False, trust_env=False) as client:
        with client.stream(
            method, url, data=data, headers=headers, auth=auth
        ) as response:
            content_type = response.headers.get("content-type", "")
            if content_type.split(";")[0].strip().lower() != "application/json":
                raise GoogleDiscoveryError
            body = bytearray()
            # Do not buffer 4096 bytes before checking the deadline: a slow
            # peer could keep each individual read under HTTPX's read timeout.
            for chunk in response.iter_bytes():
                if len(body) + len(chunk) > 65536 or monotonic() > deadline:
                    raise GoogleDiscoveryError
                body.extend(chunk)
            if monotonic() > deadline:
                raise GoogleDiscoveryError
            # iter_bytes has already decoded compression. These wire headers
            # no longer describe the bounded in-memory body; retaining them
            # would trigger a second decode or advertise the wrong length.
            decoded_headers = httpx.Headers(response.headers)
            for name in ("content-encoding", "content-length", "transfer-encoding"):
                decoded_headers.pop(name, None)
            return httpx.Response(
                response.status_code,
                headers=decoded_headers,
                content=bytes(body),
                request=response.request,
            )


class _TokenTransport:
    """Authlib's documented session.post interface using existing bounded HTTPX."""

    def post(
        self,
        url: str,
        *,
        data: dict[str, str],
        headers: dict[str, str],
        auth: httpx.BasicAuth,
    ) -> httpx.Response:
        response = _bounded_response("POST", url, data=data, headers=headers, auth=auth)
        response.raise_for_status()
        return response


class GoogleDiscovery(BaseModel):
    """Accept standard extra metadata, but constrain every endpoint we will use."""

    model_config = ConfigDict(frozen=True, hide_input_in_errors=True)
    issuer: Literal["https://accounts.google.com"]
    authorization_endpoint: Literal["https://accounts.google.com/o/oauth2/v2/auth"]
    token_endpoint: Literal["https://oauth2.googleapis.com/token"]
    jwks_uri: Literal["https://www.googleapis.com/oauth2/v3/certs"]
    response_types_supported: list[str]
    scopes_supported: list[str]
    code_challenge_methods_supported: list[str] | None = None


class GoogleOidcClient:
    """Reusable metadata cache; create a fresh Authlib protocol client per flow."""

    def __init__(self, settings: GoogleOAuthSettings) -> None:
        self.settings = settings
        self._metadata: GoogleDiscovery | None = None
        self._metadata_expires_at = 0.0
        self._lock = Lock()
        self._key_set: KeySet | None = None
        self._keys_expires_at = 0.0
        self._keys_lock = Lock()

    def discovery(self) -> GoogleDiscovery:
        with self._lock:
            if self._metadata is not None and monotonic() < self._metadata_expires_at:
                return self._metadata
            try:
                response = _bounded_response("GET", GOOGLE_DISCOVERY_URL)
                response.raise_for_status()
                metadata = GoogleDiscovery.model_validate_json(response.content)
                if "code" not in metadata.response_types_supported or not {
                    "openid",
                    "email",
                    "profile",
                }.issubset(metadata.scopes_supported):
                    raise GoogleDiscoveryError
                methods = metadata.code_challenge_methods_supported
                # Google's discovery may omit this optional field. Always send
                # S256 anyway; never downgrade to plain or omit the challenge.
                if methods is not None and "S256" not in methods:
                    raise GoogleDiscoveryError
            except (httpx.HTTPError, ValidationError, GoogleDiscoveryError):
                raise GoogleDiscoveryError("Google sign-in is unavailable.") from None
            self._metadata = metadata
            self._metadata_expires_at = monotonic() + 3600
            return metadata

    def authorization_url(self) -> tuple[str, str, str, str]:
        metadata = self.discovery()
        nonce = generate_token(48)
        verifier = generate_token(64)
        # Authlib's public protocol client constructs state and PKCE. No token
        # request is made here, so no transport/session or client secret is needed.
        client = OAuth2Client(
            session=None,
            client_id=self.settings.google_oidc_client_id,
            redirect_uri=self.settings.google_oidc_redirect_uri,
            scope=GOOGLE_SCOPES,
            code_challenge_method="S256",
        )
        url, state = client.create_authorization_url(
            metadata.authorization_endpoint,
            state=generate_token(48),
            nonce=nonce,
            code_verifier=verifier,
        )
        return str(url), str(state), nonce, verifier

    def _trusted_keys(self, *, refresh: bool = False) -> KeySet:
        with self._keys_lock:
            if (
                not refresh
                and self._key_set is not None
                and monotonic() < self._keys_expires_at
            ):
                return self._key_set
            try:
                response = _bounded_response("GET", self.discovery().jwks_uri)
                response.raise_for_status()
                document = response.json()
                if not isinstance(document, dict) or not isinstance(
                    document.get("keys"), list
                ):
                    raise GoogleDiscoveryError
                keys = document["keys"]
                if not 1 <= len(keys) <= 10 or any(
                    not isinstance(key, dict) for key in keys
                ):
                    raise GoogleDiscoveryError
                key_set = KeySet.import_key_set({"keys": keys})
            except (httpx.HTTPError, JoseError, ValueError, TypeError, KeyError):
                raise GoogleDiscoveryError("Google sign-in is unavailable.") from None
            self._key_set = key_set
            # Conservative cache; unknown kid triggers at most one extra fetch
            # per callback for rotation. Never fetch a URL from the JWT header.
            self._keys_expires_at = monotonic() + 300
            return key_set

    def exchange_identity(self, code: str, flow: PendingLogin) -> VerifiedIdentity:
        metadata = self.discovery()
        if flow.redirect_uri != self.settings.google_oidc_redirect_uri:
            raise GoogleIdentityError
        client = OAuth2Client(
            session=_TokenTransport(),
            client_id=self.settings.google_oidc_client_id,
            client_secret=self.settings.google_oidc_client_secret.get_secret_value(),
            redirect_uri=flow.redirect_uri,
            code_challenge_method="S256",
        )
        try:
            token = client.fetch_token(
                metadata.token_endpoint,
                grant_type="authorization_code",
                code=code,
                code_verifier=flow.code_verifier,
                auth=httpx.BasicAuth(
                    self.settings.google_oidc_client_id,
                    self.settings.google_oidc_client_secret.get_secret_value(),
                ),
            )
        except httpx.HTTPStatusError as error:
            if 400 <= error.response.status_code < 500:
                raise GoogleIdentityError(
                    "Google code exchange was rejected."
                ) from None
            raise GoogleDiscoveryError("Google sign-in is unavailable.") from None
        except (httpx.HTTPError, GoogleDiscoveryError):
            raise GoogleDiscoveryError("Google sign-in is unavailable.") from None
        except (OAuth2Error, ValueError, TypeError, KeyError):
            raise GoogleIdentityError(
                "Google identity could not be verified."
            ) from None
        return self.validate_identity_token(token, flow.nonce)

    def validate_identity_token(
        self, token: dict[str, object], nonce: str
    ) -> VerifiedIdentity:
        """Verify signature, OIDC claims, and finally Roam's profile policy."""
        raw = token.get("id_token")
        if not isinstance(raw, str) or not 1 <= len(raw) <= 16384 or not nonce:
            raise GoogleIdentityError
        access_token = token.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise GoogleIdentityError
        try:
            keys = self._trusted_keys()
            try:
                decoded = jwt.decode(raw, keys, algorithms=["RS256"])
            except InvalidKeyIdError:
                decoded = jwt.decode(
                    raw, self._trusted_keys(refresh=True), algorithms=["RS256"]
                )
            # Authlib treats falsy optional values as absent. When supplied,
            # these OIDC claims must be nonempty strings, not null/list/bool.
            # Authlib still performs their audience/hash validation below.
            for name in ("azp", "at_hash"):
                if name in decoded.claims and (
                    not isinstance(decoded.claims[name], str)
                    or not decoded.claims[name]
                ):
                    raise GoogleIdentityError
            claims = CodeIDToken(
                decoded.claims,
                decoded.header,
                options={
                    "iss": {
                        "values": ["https://accounts.google.com", "accounts.google.com"]
                    },
                    "aud": {"value": self.settings.google_oidc_client_id},
                },
                params={
                    "client_id": self.settings.google_oidc_client_id,
                    "nonce": nonce,
                    "access_token": access_token,
                },
            )
            claims.validate(now=int(time()), leeway=30)
            if claims.get("email_verified") is not True:
                raise EmailNotVerified
            profile = _GoogleProfile.model_validate(claims)
        except EmailNotVerified:
            raise
        except GoogleDiscoveryError:
            raise
        except (JoseError, ValidationError, ValueError, TypeError, KeyError):
            raise GoogleIdentityError(
                "Google identity could not be verified."
            ) from None
        return VerifiedIdentity(
            issuer="https://accounts.google.com",
            subject=profile.sub,
            email=profile.email,
            display_name=profile.name,
        )
