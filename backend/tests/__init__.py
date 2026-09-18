"""Test package bootstrap.

This module runs BEFORE any test module or conftest is imported, which is exactly
when the application's database engine must be redirected at the throwaway test
database. Doing it any later leaves module-level `from app.db.session import engine`
references (e.g. in the health endpoint) pointing at the developer's real database.
"""

from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


def _test_database_url() -> str:
    """Derive a dedicated `<dbname>_test` database from DATABASE_URL.

    The test suite calls `drop_all` at teardown, so pointing it at a working
    database would silently destroy seeded demo data.
    """
    url = settings.DATABASE_URL
    database = url.rsplit("/", 1)[-1]
    if database.endswith("_test"):
        return url
    return f"{url.rsplit('/', 1)[0]}/{database}_test"


TEST_DATABASE_URL = _test_database_url()


def _create_test_database() -> None:
    """Create the test database if absent (idempotent)."""
    url = make_url(TEST_DATABASE_URL)
    server_url = url.set(database="postgres").render_as_string(hide_password=False)
    admin_engine = create_engine(server_url, isolation_level="AUTOCOMMIT")
    try:
        with admin_engine.connect() as connection:
            exists = connection.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :name"), {"name": url.database}
            ).scalar_one_or_none()
            if not exists:
                connection.execute(text(f'CREATE DATABASE "{url.database}"'))
    finally:
        admin_engine.dispose()


_create_test_database()

test_engine = create_engine(TEST_DATABASE_URL, pool_pre_ping=True)

# Redirect the application's engine and session factory at the test database.
from app.db import session as _db_session  # noqa: E402

_db_session.engine = test_engine
_db_session.SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine,
    expire_on_commit=False,
)


def ensure_postgis() -> str:
    """Enable PostGIS in the test database and return its version."""
    with test_engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        return str(connection.execute(text("SELECT PostGIS_Version()")).scalar_one())


__all__ = ["TEST_DATABASE_URL", "ensure_postgis", "test_engine"]
