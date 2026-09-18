"""Alembic environment.

The database URL is taken from the application settings (i.e. the DATABASE_URL
environment variable / .env file) so migrations always target the same database
the API runs against - no second source of truth to drift.
"""

from __future__ import annotations

import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text

from app.core.config import settings
from app.db.base import Base  # noqa: F401 - imports all models for autogenerate

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata

# PostGIS manages this table itself; Alembic must never try to create or drop it.
POSTGIS_MANAGED_TABLES = {"spatial_ref_sys"}


def include_object(object, name, type_, reflected, compare_to) -> bool:
    """Keep PostGIS internal tables out of autogenerate output."""
    if type_ == "table" and name in POSTGIS_MANAGED_TABLES:
        return False
    return True


def _ensure_postgis(connection) -> None:
    """PostGIS must exist before any geometry column can be created."""
    connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live DB connection (for review/CI diffs)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        _ensure_postgis(connection)
        connection.commit()
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            include_object=include_object,
        )
        with context.begin_transaction():
            context.run_migrations()


if os.getenv("ALEMBIC_OFFLINE") == "1":
    run_migrations_offline()
else:
    run_migrations_online()
