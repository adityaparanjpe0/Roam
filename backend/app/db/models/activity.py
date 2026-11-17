"""User-entered itinerary storage; provider-backed activities are deferred."""

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, IdentityMixin

if TYPE_CHECKING:
    from app.db.models.trip_day import TripDay


class Activity(IdentityMixin, AuditMixin, Base):
    __tablename__ = "activities"
    __table_args__ = (
        CheckConstraint("length(btrim(title)) > 0", name="title_nonempty"),
        CheckConstraint("starts_at < ends_at", name="time_range"),
        CheckConstraint("sort_order >= 0", name="sort_order_nonnegative"),
        CheckConstraint("estimated_cost_minor >= 0", name="cost_nonnegative"),
        CheckConstraint("origin = 'user_entered'", name="origin"),
        CheckConstraint(
            "category IN ('sightseeing', 'food', 'culture', 'outdoors', "
            "'shopping', 'other')",
            name="category",
        ),
        CheckConstraint(
            "(estimated_cost_minor IS NULL AND cost_confidence = 'unknown') OR "
            "(estimated_cost_minor IS NOT NULL AND cost_confidence = 'user')",
            name="cost_confidence",
        ),
        Index(
            "ix_activities_day_start_order", "trip_day_id", "starts_at", "sort_order"
        ),
    )

    trip_day_id: Mapped[UUID] = mapped_column(
        ForeignKey("trip_days.id", ondelete="CASCADE")
    )
    origin: Mapped[str] = mapped_column(String(24), server_default="user_entered")
    title: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(24))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    sort_order: Mapped[int] = mapped_column(server_default="0")
    estimated_cost_minor: Mapped[int | None] = mapped_column(BigInteger)
    cost_confidence: Mapped[str] = mapped_column(String(24), server_default="unknown")
    notes: Mapped[str | None] = mapped_column(String(2000))
    locked: Mapped[bool] = mapped_column(server_default="false")
    day: Mapped["TripDay"] = relationship(back_populates="activities")
