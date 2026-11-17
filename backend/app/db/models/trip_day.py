"""One local calendar day per trip; cross-row date validation comes later."""

from datetime import date
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdentityMixin

if TYPE_CHECKING:
    from app.db.models.activity import Activity
    from app.db.models.trip import Trip


class TripDay(IdentityMixin, Base):
    __tablename__ = "trip_days"
    __table_args__ = (UniqueConstraint("trip_id", "local_date"),)

    trip_id: Mapped[UUID] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"))
    local_date: Mapped[date]
    summary: Mapped[str | None] = mapped_column(String(500))
    trip: Mapped["Trip"] = relationship(back_populates="days")
    activities: Mapped[list["Activity"]] = relationship(
        back_populates="day", cascade="all, delete-orphan", passive_deletes=True
    )
