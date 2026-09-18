"""Liveness/readiness probes. Render and Railway both poll these."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from app.services.geo import declared_geometry_type

router = APIRouter(tags=["health"])


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str
    database: str | None = None
    postgis: str | None = None
    geometry_column: str


@router.get("/health", response_model=HealthResponse, summary="Liveness + dependency check")
def health() -> HealthResponse:
    """Returns 200 always, but reports database reachability in the body.

    Kept non-failing on DB errors so the platform's uptime monitor reflects API
    process health, while the `database` field exposes the dependency state.
    """
    database: str | None = "unavailable"
    postgis: str | None = None
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            postgis = connection.execute(text("SELECT PostGIS_Version()")).scalar_one()
        database = "connected"
    except Exception:
        database = "unavailable"

    return HealthResponse(
        status="ok",
        service=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        database=database,
        postgis=postgis,
        geometry_column=declared_geometry_type(),
    )
