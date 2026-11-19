"""Opaque random tokens and session-bound CSRF checks; no JWT/signing protocol."""

import re
import secrets
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from hmac import compare_digest
from urllib.parse import urlsplit

ABSOLUTE_SESSION_LIFETIME = timedelta(days=7)
IDLE_SESSION_LIFETIME = timedelta(hours=24)
_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_-]{43}", re.ASCII)


class AuthenticationRequired(ValueError):
    """All missing, malformed, expired, unknown, and revoked sessions look alike."""


class CsrfRejected(ValueError):
    """Unsafe request did not establish session-bound same-origin intent."""


def new_token() -> str:
    return secrets.token_urlsafe(32)


def utc_now() -> datetime:
    return datetime.now(UTC)


def token_hash(token: str | None) -> bytes:
    if token is None or _TOKEN_PATTERN.fullmatch(token) is None:
        raise AuthenticationRequired
    return sha256(token.encode("ascii")).digest()


def trusted_request_origin(
    origin: str | None, referer: str | None, expected: str
) -> bool:
    if origin is not None:
        return origin == expected  # 'null', duplicates, and lists cannot match.
    if referer is None or any(
        char.isspace() or ord(char) < 32 or char == "\\" for char in referer
    ):
        return False
    try:
        parsed = urlsplit(referer)
        if parsed.username is not None or parsed.password is not None:
            return False
        return f"{parsed.scheme}://{parsed.netloc}" == expected
    except ValueError:
        return False


def validate_csrf(
    stored_hash: bytes, cookie: str | None, header: str | None, *, trusted_origin: bool
) -> None:
    try:
        cookie_hash = token_hash(cookie)
        header_hash = token_hash(header)
    except AuthenticationRequired:
        raise CsrfRejected from None
    if (
        not trusted_origin
        or not compare_digest(cookie_hash, header_hash)
        or not compare_digest(stored_hash, header_hash)
    ):
        raise CsrfRejected
