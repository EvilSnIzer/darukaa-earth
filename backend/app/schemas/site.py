"""Site schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.geojson import GeoJSONGeometry


class SiteBase(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    description: str | None = None
    land_cover: str | None = Field(default=None, max_length=120)
    planting_year: int | None = Field(default=None, ge=1900, le=2100)


class SiteCreate(SiteBase):
    geometry: GeoJSONGeometry
    project_id: uuid.UUID


class SiteUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    land_cover: str | None = Field(default=None, max_length=120)
    planting_year: int | None = Field(default=None, ge=1900, le=2100)
    geometry: GeoJSONGeometry | None = None


class SiteRead(SiteBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    area_hectares: float
    centroid_lat: float | None = None
    centroid_lng: float | None = None
    observation_count: int = 0
    created_at: datetime
    updated_at: datetime


class SiteDetail(SiteRead):
    """Site plus its GeoJSON geometry, for detail views and map editing."""

    geometry: dict[str, Any]
    project_name: str | None = None
