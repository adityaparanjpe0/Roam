"""Import every model so Alembic sees the complete application metadata."""

from app.db.models.activity import Activity
from app.db.models.trip import Trip
from app.db.models.trip_day import TripDay
from app.db.models.user import User

__all__ = ["Activity", "Trip", "TripDay", "User"]
