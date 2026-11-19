"""Create opaque application sessions.

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str = "0001"
branch_labels: None = None
depends_on: None = None


def upgrade() -> None:
    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.LargeBinary(), nullable=False),
        sa.Column("csrf_hash", sa.LargeBinary(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_sessions"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_sessions_user_id_users",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("token_hash", name="uq_sessions_token_hash"),
        sa.CheckConstraint(
            "octet_length(token_hash) = 32", name=op.f("ck_sessions_token_hash_length")
        ),
        sa.CheckConstraint(
            "octet_length(csrf_hash) = 32", name=op.f("ck_sessions_csrf_hash_length")
        ),
        sa.CheckConstraint(
            "expires_at > created_at AND "
            "expires_at <= created_at + interval '168 hours'",
            name=op.f("ck_sessions_absolute_lifetime"),
        ),
        sa.CheckConstraint(
            "last_seen_at >= created_at AND last_seen_at < expires_at",
            name=op.f("ck_sessions_last_seen_range"),
        ),
        sa.CheckConstraint(
            "revoked_at IS NULL OR revoked_at >= created_at",
            name=op.f("ck_sessions_revoked_range"),
        ),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"])


def downgrade() -> None:
    # Removes login sessions only: all users must sign in again after downgrade.
    op.drop_index("ix_sessions_expires_at", table_name="sessions")
    op.drop_index("ix_sessions_user_id", table_name="sessions")
    op.drop_table("sessions")
