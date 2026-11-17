"""Run the real Alembic environment using an owned test connection."""

from pathlib import Path

from alembic.config import Config
from sqlalchemy import Connection


def migration_config(connection: Connection) -> Config:
    config = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    # No URL string in ConfigParser: passwords may contain interpolation characters.
    config.attributes["connection"] = connection
    return config
