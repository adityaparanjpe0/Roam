"""Trip ownership, dates, and bounded preferences; no mutation API yet."""

from datetime import date
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, IdentityMixin

if TYPE_CHECKING:
    from app.db.models.trip_day import TripDay
    from app.db.models.user import User


class Trip(IdentityMixin, AuditMixin, Base):
    __tablename__ = "trips"
    __table_args__ = (
        CheckConstraint("length(btrim(title)) > 0", name="title_nonempty"),
        CheckConstraint(
            "length(btrim(destination_label)) > 0", name="destination_nonempty"
        ),
        CheckConstraint("length(btrim(timezone)) > 0", name="timezone_nonempty"),
        CheckConstraint(
            "end_date >= start_date AND end_date - start_date < 14", name="date_range"
        ),
        CheckConstraint("traveler_count BETWEEN 1 AND 20", name="traveler_count"),
        CheckConstraint("budget_per_person_minor >= 0", name="budget_nonnegative"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        CheckConstraint("status IN ('draft', 'ready', 'archived')", name="status"),
        CheckConstraint("version >= 1", name="version_positive"),
        CheckConstraint(
            "CASE WHEN jsonb_typeof(interests) = 'array' THEN "
            "jsonb_array_length(interests) <= 20 AND "
            "octet_length(interests::text) <= 2048 ELSE false END",
            name="interests_shape",
        ),
        CheckConstraint(
            "jsonb_typeof(preferences) = 'object' AND "
            "preferences @> '{\"schema_version\": 1}'::jsonb AND "
            "octet_length(preferences::text) <= 8192",
            name="preferences_shape",
        ),
    )

    owner_id: Mapped[UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    title: Mapped[str] = mapped_column(String(120))
    destination_label: Mapped[str] = mapped_column(String(200))
    destination_provider_id: Mapped[str | None] = mapped_column(String(512))
    timezone: Mapped[str] = mapped_column(String(64))
    start_date: Mapped[date]
    end_date: Mapped[date]
    traveler_count: Mapped[int] = mapped_column(SmallInteger)
    budget_per_person_minor: Mapped[int | None] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    interests: Mapped[list[str]] = mapped_column(
        JSONB, server_default=text("'[]'::jsonb")
    )
    preferences: Mapped[dict[str, object]] = mapped_column(
        JSONB, server_default=text("'{\"schema_version\": 1}'::jsonb")
    )
    free_text_constraints: Mapped[str | None] = mapped_column(String(4000))
    status: Mapped[str] = mapped_column(String(16), server_default="draft")
    version: Mapped[int] = mapped_column(server_default="1")
    owner: Mapped["User"] = relationship(back_populates="trips")
    days: Mapped[list["TripDay"]] = relationship(
        back_populates="trip", cascade="all, delete-orphan", passive_deletes=True
    )


Index("ix_trips_owner_updated_id", Trip.owner_id, Trip.updated_at.desc(), Trip.id)
