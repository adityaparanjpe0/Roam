"""Synchronous engine pooling and request-scoped sessions."""

from collections.abc import Iterator
from threading import Lock

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.core.config import DatabaseSettings, load_database_settings

_engine: Engine | None = None
_engine_lock = Lock()


def create_database_engine(settings: DatabaseSettings) -> Engine:
    """Build a bounded pool lazily; PostgreSQL TLS options remain in the URL."""
    url = settings.sqlalchemy_url()
    connect_args: dict[str, str | int] = {
        "connect_timeout": 5,
        "options": "-c statement_timeout=10000 -c lock_timeout=3000",
    }
    if url.host in {"127.0.0.1", "localhost", "::1"}:
        # Do not let an ambient PGHOSTADDR redirect an explicitly local URL.
        connect_args["hostaddr"] = "::1" if url.host == "::1" else "127.0.0.1"
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=0,
        pool_timeout=5,
        connect_args=connect_args,
        echo=False,
        hide_parameters=True,
    )


def get_engine() -> Engine:
    """One engine/pool per process, created only when a database operation needs it."""
    global _engine
    # Sync FastAPI requests may arrive on different threads during first use.
    with _engine_lock:
        if _engine is None:
            _engine = create_database_engine(load_database_settings())
        return _engine


def get_db_session() -> Iterator[Session]:
    """Yield one session and always close it; callers own commit/transaction scope.

    Closing rolls back uncommitted work. Never commit in dependency cleanup:
    application services should use explicit ``with session.begin():`` blocks.
    """
    with Session(get_engine()) as session:
        yield session


def dispose_database_engine() -> None:
    """Release an existing pool at shutdown without requiring configuration."""
    global _engine
    with _engine_lock:
        if _engine is not None:
            _engine.dispose()
            _engine = None
