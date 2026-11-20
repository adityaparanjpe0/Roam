"""Trip metadata contracts and bounded cursor encoding, not itinerary models."""

import base64
import binascii
import json
import re
from datetime import UTC, date, datetime
from functools import lru_cache
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import available_timezones

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

Title = Annotated[
    str,
    StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=120),
]
Destination = Annotated[
    str,
    StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=200),
]
Interest = Literal[
    "food",
    "sightseeing",
    "outdoors",
    "nightlife",
    "shopping",
    "culture",
    "adventure",
    "relaxation",
]


@lru_cache(maxsize=1)
def supported_timezones() -> frozenset[str]:
    return frozenset(available_timezones()) - {"localtime", "posixrules"}


class TripCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    destination_label: Destination
    title: Title | None = None
    timezone: Annotated[
        str, StringConstraints(strict=True, min_length=1, max_length=64)
    ]
    start_date: date
    end_date: date
    traveler_count: Annotated[int, Field(strict=True, ge=1, le=20)]
    budget_per_person_minor: Annotated[int, Field(strict=True, ge=1, le=100_000_000)]
    currency: Literal["USD"]
    interests: Annotated[list[Interest], Field(min_length=1, max_length=8)]
    free_text_constraints: (
        Annotated[str, StringConstraints(strict=True, max_length=4000)] | None
    ) = None

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def calendar_date(cls, value: object) -> date:
        if not isinstance(value, str) or not re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value
        ):
            raise ValueError("Use an exact YYYY-MM-DD date")
        return date.fromisoformat(value)

    @field_validator("timezone")
    @classmethod
    def iana_timezone(cls, value: str) -> str:
        if value not in supported_timezones():
            raise ValueError("Use a supported IANA timezone")
        return value

    @field_validator("interests")
    @classmethod
    def unique_interests(cls, value: list[Interest]) -> list[Interest]:
        if len(set(value)) != len(value):
            raise ValueError("Choose each interest once")
        return value

    @field_validator("free_text_constraints")
    @classmethod
    def normalize_constraints(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator("destination_label", "title", "free_text_constraints")
    @classmethod
    def postgres_text(cls, value: str | None) -> str | None:
        # PostgreSQL text cannot store NUL; reject it as input, not a DB outage.
        if value is not None and "\x00" in value:
            raise ValueError("Text must not contain NUL")
        return value

    @model_validator(mode="after")
    def date_range(self) -> "TripCreate":
        if not 0 <= (self.end_date - self.start_date).days < 14:
            raise ValueError("Choose 1 to 14 inclusive days")
        return self

    @property
    def resolved_title(self) -> str:
        return self.title if self.title is not None else self.destination_label[:120]


class TripSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True, hide_input_in_errors=True)

    id: UUID
    title: str
    destination_label: str
    start_date: date
    end_date: date
    version: int
    updated_at: AwareDatetime

    @field_validator("updated_at")
    @classmethod
    def utc_updated_at(cls, value: datetime) -> datetime:
        return value.astimezone(UTC)


class TripResponse(TripSummary):
    timezone: str
    traveler_count: int
    budget_per_person_minor: int | None
    currency: str
    interests: list[str]
    free_text_constraints: str | None
    status: str
    created_at: AwareDatetime

    @field_validator("created_at")
    @classmethod
    def utc_created_at(cls, value: datetime) -> datetime:
        return value.astimezone(UTC)


class TripListResponse(BaseModel):
    items: list[TripSummary]
    next_cursor: str | None


class TripCursor(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    v: Annotated[int, Field(strict=True, ge=1, le=1)]
    updated_at: AwareDatetime
    id: UUID

    @field_validator("updated_at", mode="before")
    @classmethod
    def timestamp_string(cls, value: object) -> str:
        if not isinstance(value, str) or not re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}"
            r"(?:\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})",
            value,
        ):
            raise ValueError("Use a timezone-aware timestamp")
        return value


def encode_cursor(updated_at: datetime, trip_id: UUID) -> str:
    payload = json.dumps(
        {
            "v": 1,
            "updated_at": updated_at.astimezone(UTC).isoformat(timespec="microseconds"),
            "id": str(trip_id),
        },
        separators=(",", ":"),
    )
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_cursor(value: str) -> TripCursor:
    if not 1 <= len(value) <= 512 or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ValueError("Invalid cursor")
    try:
        raw = base64.b64decode(
            value + "=" * (-len(value) % 4), altchars=b"-_", validate=True
        )
        return TripCursor.model_validate_json(raw)
    except (ValueError, binascii.Error):
        raise ValueError("Invalid cursor") from None
