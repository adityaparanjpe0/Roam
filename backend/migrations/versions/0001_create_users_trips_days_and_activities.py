"""Create users trips days and activities

Revision ID: 0001
Revises: none
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("oidc_issuer", sa.String(length=2048), nullable=False),
        sa.Column("oidc_subject", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "email = lower(btrim(email)) AND length(email) > 0",
            name=op.f("ck_users_email_normalized"),
        ),
        sa.CheckConstraint(
            "length(btrim(oidc_issuer)) > 0", name=op.f("ck_users_issuer_nonempty")
        ),
        sa.CheckConstraint(
            "length(btrim(oidc_subject)) > 0", name=op.f("ck_users_subject_nonempty")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint(
            "oidc_issuer", "oidc_subject", name=op.f("uq_users_oidc_issuer")
        ),
    )
    op.create_table(
        "trips",
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("destination_label", sa.String(length=200), nullable=False),
        sa.Column("destination_provider_id", sa.String(length=512), nullable=True),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("traveler_count", sa.SmallInteger(), nullable=False),
        sa.Column("budget_per_person_minor", sa.BigInteger(), nullable=True),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column(
            "interests",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{\"schema_version\": 1}'::jsonb"),
            nullable=False,
        ),
        sa.Column("free_text_constraints", sa.String(length=4000), nullable=True),
        sa.Column(
            "status", sa.String(length=16), server_default="draft", nullable=False
        ),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "CASE WHEN jsonb_typeof(interests) = 'array' THEN "
            "jsonb_array_length(interests) <= 20 AND "
            "octet_length(interests::text) <= 2048 ELSE false END",
            name=op.f("ck_trips_interests_shape"),
        ),
        sa.CheckConstraint(
            "currency ~ '^[A-Z]{3}$'", name=op.f("ck_trips_currency_format")
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'ready', 'archived')", name=op.f("ck_trips_status")
        ),
        sa.CheckConstraint(
            "budget_per_person_minor >= 0", name=op.f("ck_trips_budget_nonnegative")
        ),
        sa.CheckConstraint(
            "end_date >= start_date AND end_date - start_date < 14",
            name=op.f("ck_trips_date_range"),
        ),
        sa.CheckConstraint(
            "jsonb_typeof(preferences) = 'object' AND "
            "preferences @> '{\"schema_version\": 1}'::jsonb AND "
            "octet_length(preferences::text) <= 8192",
            name=op.f("ck_trips_preferences_shape"),
        ),
        sa.CheckConstraint(
            "length(btrim(destination_label)) > 0",
            name=op.f("ck_trips_destination_nonempty"),
        ),
        sa.CheckConstraint(
            "length(btrim(timezone)) > 0", name=op.f("ck_trips_timezone_nonempty")
        ),
        sa.CheckConstraint(
            "length(btrim(title)) > 0", name=op.f("ck_trips_title_nonempty")
        ),
        sa.CheckConstraint(
            "traveler_count BETWEEN 1 AND 20", name=op.f("ck_trips_traveler_count")
        ),
        sa.CheckConstraint("version >= 1", name=op.f("ck_trips_version_positive")),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["users.id"],
            name=op.f("fk_trips_owner_id_users"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trips")),
    )
    op.create_index(
        "ix_trips_owner_updated_id",
        "trips",
        ["owner_id", sa.literal_column("updated_at DESC"), "id"],
        unique=False,
    )
    op.create_table(
        "trip_days",
        sa.Column("trip_id", sa.Uuid(), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("summary", sa.String(length=500), nullable=True),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["trip_id"],
            ["trips.id"],
            name=op.f("fk_trip_days_trip_id_trips"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_trip_days")),
        sa.UniqueConstraint("trip_id", "local_date", name=op.f("uq_trip_days_trip_id")),
    )
    op.create_table(
        "activities",
        sa.Column("trip_day_id", sa.Uuid(), nullable=False),
        sa.Column(
            "origin",
            sa.String(length=24),
            server_default="user_entered",
            nullable=False,
        ),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("estimated_cost_minor", sa.BigInteger(), nullable=True),
        sa.Column(
            "cost_confidence",
            sa.String(length=24),
            server_default="unknown",
            nullable=False,
        ),
        sa.Column("notes", sa.String(length=2000), nullable=True),
        sa.Column("locked", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "(estimated_cost_minor IS NULL AND cost_confidence = 'unknown') OR "
            "(estimated_cost_minor IS NOT NULL AND cost_confidence = 'user')",
            name=op.f("ck_activities_cost_confidence"),
        ),
        sa.CheckConstraint(
            "category IN ('sightseeing', 'food', 'culture', 'outdoors', "
            "'shopping', 'other')",
            name=op.f("ck_activities_category"),
        ),
        sa.CheckConstraint(
            "origin = 'user_entered'", name=op.f("ck_activities_origin")
        ),
        sa.CheckConstraint(
            "estimated_cost_minor >= 0", name=op.f("ck_activities_cost_nonnegative")
        ),
        sa.CheckConstraint(
            "length(btrim(title)) > 0", name=op.f("ck_activities_title_nonempty")
        ),
        sa.CheckConstraint(
            "sort_order >= 0", name=op.f("ck_activities_sort_order_nonnegative")
        ),
        sa.CheckConstraint(
            "starts_at < ends_at", name=op.f("ck_activities_time_range")
        ),
        sa.ForeignKeyConstraint(
            ["trip_day_id"],
            ["trip_days.id"],
            name=op.f("fk_activities_trip_day_id_trip_days"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_activities")),
    )
    op.create_index(
        "ix_activities_day_start_order",
        "activities",
        ["trip_day_id", "starts_at", "sort_order"],
        unique=False,
    )


def downgrade() -> None:
    # Destructive: only rehearse on disposable databases; this deletes all app data.
    op.drop_index("ix_activities_day_start_order", table_name="activities")
    op.drop_table("activities")
    op.drop_table("trip_days")
    op.drop_index("ix_trips_owner_updated_id", table_name="trips")
    op.drop_table("trips")
    op.drop_table("users")
