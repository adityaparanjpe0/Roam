"""Token boundaries and stateful CSRF policy, without a database or network."""

from datetime import UTC, datetime
from hashlib import sha256

import pytest

from app.core.session_security import (
    AuthenticationRequired,
    CsrfRejected,
    new_token,
    token_hash,
    trusted_request_origin,
    validate_csrf,
)
from app.domain.session import IssuedSession


@pytest.mark.parametrize(
    "value",
    [None, "", "a" * 42, "a" * 44, "a" * 42 + "\n", "ü" * 43, "a.b.c", "a" * 42 + " "],
)
def test_malformed_tokens_rejected(value: str | None) -> None:
    with pytest.raises(AuthenticationRequired):
        token_hash(value)


def test_tokens_request_256_bits_from_standard_csprng(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[int] = []

    def generate(count: int) -> str:
        calls.append(count)
        return "a" * 43

    monkeypatch.setattr("app.core.session_security.secrets.token_urlsafe", generate)
    assert new_token() == "a" * 43 and calls == [32]


@pytest.mark.parametrize(
    ("origin", "referer", "expected"),
    [
        ("http://127.0.0.1:5173", None, True),
        (None, "http://127.0.0.1:5173/path?x=1", True),
        (None, None, False),
        ("null", None, False),
        ("https://attacker.example", "http://127.0.0.1:5173/", False),
        ("http://127.0.0.1:8000", None, False),
        ("http://127.0.0.1:5173.attacker.example", None, False),
        ("http://127.0.0.1:5173 https://attacker.example", None, False),
        (None, "http://127.0.0.1:5173@attacker.example/", False),
        (None, "http://user@127.0.0.1:5173/", False),
        (None, "http://127.0.0.1:5173/\n", False),
    ],
)
def test_origin_policy(origin: str | None, referer: str | None, expected: bool) -> None:
    assert trusted_request_origin(origin, referer, "http://127.0.0.1:5173") is expected


@pytest.mark.parametrize(
    ("cookie", "header", "origin"),
    [
        (None, "a" * 43, True),
        ("a" * 43, None, True),
        ("a" * 43, "b" * 43, True),
        ("b" * 43, "b" * 43, True),
        ("a" * 43, "a" * 43, False),
        ("malformed", "malformed", True),
    ],
)
def test_csrf_requires_matching_session_cookie_header_and_origin(
    cookie: str | None, header: str | None, origin: bool
) -> None:
    with pytest.raises(CsrfRejected):
        validate_csrf(
            sha256(("a" * 43).encode()).digest(), cookie, header, trusted_origin=origin
        )


def test_csrf_accepts_correct_stateful_token() -> None:
    validate_csrf(
        sha256(("a" * 43).encode()).digest(), "a" * 43, "a" * 43, trusted_origin=True
    )


def test_internal_session_result_repr_does_not_expose_tokens() -> None:
    issued = IssuedSession(
        "private-bearer", "private-csrf", datetime(2030, 1, 1, tzinfo=UTC)
    )
    assert "private" not in repr(issued)
