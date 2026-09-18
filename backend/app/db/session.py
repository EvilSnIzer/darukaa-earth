"""SQLAlchemy engine/session wiring, with PostGIS bootstrapping."""

from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    echo=settings.DB_ECHO,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, expire_on_commit=False)


def ensure_postgis() -> str:
    """Create the PostGIS extension if missing and return its version.

    Called once at startup and once per test session so a fresh database (CI,
    Neon, Railway) self-heals without a manual `CREATE EXTENSION`.
    """
    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
        version: str = connection.execute(text("SELECT PostGIS_Full_Version()")).scalar_one()
    return version


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@event.listens_for(Session, "do_orm_execute")
def _add_readonly_guard(orm_execute_state: object) -> None:  # pragma: no cover - hook placeholder
    """Reserved hook: lets us tag read-only replicas later without touching call sites."""
    return None
