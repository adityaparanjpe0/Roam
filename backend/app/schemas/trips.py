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
    ValidationInfo,
    field_validator,
    model_validator,
)
from pydantic.config import JsonDict
from pydantic.json_schema import SkipJsonSchema

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
MinorBudget = Annotated[int, Field(strict=True, ge=1, le=100_000_000)]
TravelerCount = Annotated[int, Field(strict=True, ge=1, le=20)]
TimezoneName = Annotated[
    str, StringConstraints(strict=True, min_length=1, max_length=64)
]
Constraints = Annotated[str, StringConstraints(strict=True, max_length=4000)]
Interests = Annotated[list[Interest], Field(min_length=1, max_length=8)]


@lru_cache(maxsize=1)
def supported_timezones() -> frozenset[str]:
    return frozenset(available_timezones()) - {"localtime", "posixrules"}


class TripMetadata(BaseModel):
    """Complete effective state; an untouched legacy budget may remain unknown."""

    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    destination_label: Destination
    title: Title | None = None
    timezone: TimezoneName
    start_date: date
    end_date: date
    traveler_count: TravelerCount
    budget_per_person_minor: MinorBudget | None
    currency: Literal["USD"]
    interests: Interests
    free_text_constraints: Constraints | None = None

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
    def date_range(self) -> "TripMetadata":
        if not 0 <= (self.end_date - self.start_date).days < 14:
            raise ValueError("Choose 1 to 14 inclusive days")
        return self

    @property
    def resolved_title(self) -> str:
        return self.title if self.title is not None else self.destination_label[:120]


class TripCreate(TripMetadata):
    # New creates need a known positive budget; stored legacy null remains readable.
    budget_per_person_minor: MinorBudget


def omit_internal_default(schema: JsonDict) -> None:
    """An internal omission marker is not a client-visible default value."""
    schema.pop("default", None)


class TripPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    base_version: Annotated[int, Field(strict=True, ge=1, le=2_147_483_647)]
    # None marks an omitted field internally. Explicit null is rejected below;
    # SkipJsonSchema keeps the wire contract non-nullable for these fields.
    title: Title | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=omit_internal_default
    )
    destination_label: Destination | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=omit_internal_default
    )
    timezone: TimezoneName | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=omit_internal_default
    )
    start_date: date | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=omit_internal_default
    )
    end_date: date | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=omit_internal_default
    )
    traveler_count: TravelerCount | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=omit_internal_default
    )
    budget_per_person_minor: MinorBudget | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=omit_internal_default
    )
    currency: Literal["USD"] | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=omit_internal_default
    )
    interests: Interests | SkipJsonSchema[None] = Field(
        default=None, json_schema_extra=omit_internal_default
    )
    free_text_constraints: Constraints | None = None

    @field_validator("*", mode="before")
    @classmethod
    def reject_explicit_null(cls, value: object, info: ValidationInfo) -> object:
        if value is None and info.field_name != "free_text_constraints":
            raise ValueError("This field cannot be cleared")
        return value

    @field_validator("start_date", "end_date", mode="before")
    @classmethod
    def calendar_date(cls, value: object) -> date:
        return TripMetadata.calendar_date(value)

    @field_validator("timezone")
    @classmethod
    def iana_timezone(cls, value: str | None) -> str | None:
        return TripMetadata.iana_timezone(value) if value is not None else None

    @field_validator("interests")
    @classmethod
    def unique_interests(cls, value: list[Interest] | None) -> list[Interest] | None:
        return TripMetadata.unique_interests(value) if value is not None else None

    @field_validator("free_text_constraints")
    @classmethod
    def normalize_constraints(cls, value: str | None) -> str | None:
        return TripMetadata.normalize_constraints(value)

    @field_validator("destination_label", "title", "free_text_constraints")
    @classmethod
    def postgres_text(cls, value: str | None) -> str | None:
        return TripMetadata.postgres_text(value)

    @model_validator(mode="after")
    def nonempty_update(self) -> "TripPatch":
        if not self.model_fields_set - {"base_version"}:
            raise ValueError("Supply at least one field to update")
        return self


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
