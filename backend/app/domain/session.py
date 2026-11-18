"""Safe user identity and internal session results; bearer values are never JSON."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, repr=False)
class CurrentUser:
    id: UUID
    email: str
    display_name: str | None


@dataclass(frozen=True, repr=False)
class AuthenticatedSession:
    id: UUID
    user: CurrentUser


@dataclass(frozen=True, repr=False)
class IssuedSession:
    token: str
    csrf_token: str
    expires_at: datetime
