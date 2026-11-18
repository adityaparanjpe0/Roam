"""Google discovery and Authlib authorization URL creation; no token exchange."""

from threading import Lock
from time import monotonic
from typing import Literal

import httpx
from authlib.common.security import generate_token
from authlib.oauth2.client import OAuth2Client
from pydantic import BaseModel, ConfigDict, ValidationError

from app.core.config import GoogleOAuthSettings

GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid-configuration"
GOOGLE_SCOPES = "openid email profile"


class GoogleDiscoveryError(ValueError):
    """Safe error boundary: do not expose upstream URLs, bodies, or exceptions."""


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

    def discovery(self) -> GoogleDiscovery:
        with self._lock:
            if self._metadata is not None and monotonic() < self._metadata_expires_at:
                return self._metadata
            try:
                # Fixed host, certificate verification, no environment proxies,
                # redirects, credentials, or retries. Bound the document size.
                with httpx.Client(
                    timeout=5.0, follow_redirects=False, trust_env=False
                ) as client:
                    with client.stream("GET", GOOGLE_DISCOVERY_URL) as response:
                        response.raise_for_status()
                        content_type = response.headers.get("content-type", "")
                        if (
                            content_type.split(";")[0].strip().lower()
                            != "application/json"
                        ):
                            raise GoogleDiscoveryError
                        body = bytearray()
                        deadline = monotonic() + 5.0
                        for chunk in response.iter_bytes(chunk_size=4096):
                            body.extend(chunk)
                            if len(body) > 65536 or monotonic() > deadline:
                                raise GoogleDiscoveryError
                metadata = GoogleDiscovery.model_validate_json(body)
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
