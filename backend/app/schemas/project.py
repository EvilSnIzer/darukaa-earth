"""Project schemas."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.project import ProjectStatus, ProjectType


class ProjectBase(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    description: str | None = None
    project_type: ProjectType = ProjectType.reforestation
    status: ProjectStatus = ProjectStatus.planning
    country: str = Field(default="India", min_length=2, max_length=120)
    methodology: str | None = None
    baseline_year: int | None = Field(default=None, ge=1900, le=2100)


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=255)
    description: str | None = None
    project_type: ProjectType | None = None
    status: ProjectStatus | None = None
    country: str | None = Field(default=None, min_length=2, max_length=120)
    methodology: str | None = None
    baseline_year: int | None = Field(default=None, ge=1900, le=2100)


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID
    site_count: int = 0
    total_area_hectares: float = 0.0
    total_carbon_tco2e: float = 0.0
    created_at: datetime
    updated_at: datetime
