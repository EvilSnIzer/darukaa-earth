"""Observation (time-series measurement) schemas."""

from __future__ import annotations

import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.models.observation import DataSource


class ObservationBase(BaseModel):
    measured_on: date
    carbon_sequestered_tco2e: float | None = Field(default=None, ge=0, le=1_000_000)
    biomass_tonnes: float | None = Field(default=None, ge=0)
    ndvi: float | None = Field(default=None, ge=-1, le=1)
    canopy_cover_pct: float | None = Field(default=None, ge=0, le=100)
    tree_count: int | None = Field(default=None, ge=0)
    biodiversity_index: float | None = Field(default=None, ge=0, le=1)
    species_observed: int | None = Field(default=None, ge=0)
    data_source: DataSource = DataSource.satellite
    notes: str | None = None


class ObservationCreate(ObservationBase):
    site_id: uuid.UUID


class ObservationRead(ObservationBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    site_id: uuid.UUID
