"""Minimal identity value produced only after provider verification."""

from dataclasses import dataclass


@dataclass(frozen=True, repr=False)
class VerifiedIdentity:
    issuer: str
    subject: str
    email: str
    display_name: str | None
