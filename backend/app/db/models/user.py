"""Google identity storage; account deletion remains pending."""

from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import AuditMixin, Base, IdentityMixin

if TYPE_CHECKING:
    from app.db.models.trip import Trip


class User(IdentityMixin, AuditMixin, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("oidc_issuer", "oidc_subject"),
        CheckConstraint("length(btrim(oidc_issuer)) > 0", name="issuer_nonempty"),
        CheckConstraint("length(btrim(oidc_subject)) > 0", name="subject_nonempty"),
        CheckConstraint(
            "email = lower(btrim(email)) AND length(email) > 0",
            name="email_normalized",
        ),
    )

    oidc_issuer: Mapped[str] = mapped_column(String(2048))
    oidc_subject: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(254))
    display_name: Mapped[str | None] = mapped_column(String(120))
    # PostgreSQL rejects deletion while trips exist; no implicit account cascade.
    trips: Mapped[list["Trip"]] = relationship(
        back_populates="owner", passive_deletes="all"
    )
