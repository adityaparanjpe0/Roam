"""Use validated runtime settings or an explicitly supplied test connection."""

from alembic import context
from sqlalchemy import Connection

from app.core.config import load_database_settings
from app.db.base import Base
from app.db.models import Activity, Trip, TripDay, User  # noqa: F401
from app.db.session import create_database_engine


def migrate(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=Base.metadata,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    context.configure(
        url=load_database_settings().sqlalchemy_url(),
        target_metadata=Base.metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()
elif connection := context.config.attributes.get("connection"):
    migrate(connection)
else:
    engine = create_database_engine(load_database_settings())
    try:
        with engine.connect() as connection:
            migrate(connection)
    finally:
        engine.dispose()
