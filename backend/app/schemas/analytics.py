"""Analytics response shapes consumed by the Chart.js visualisations."""

from __future__ import annotations

import uuid

from pydantic import BaseModel, Field


class MetricSummary(BaseModel):
    """Descriptive stats for one metric across the selected window."""

    metric: str
    unit: str
    latest: float | None = None
    earliest: float | None = None
    min: float | None = None
    max: float | None = None
    mean: float | None = None
    total: float | None = None
    change_pct: float | None = Field(
        default=None,
        description="Percent change from the first to the last measurement in the window.",
    )
    trend_per_year: float | None = Field(
        default=None,
        description="Least-squares slope, expressed per year.",
    )


class Series(BaseModel):
    """One chart series: parallel label/value arrays keyed by measurement date."""

    label: str
    dates: list[str] = Field(default_factory=list)
    values: list[float | None] = Field(default_factory=list)


class SiteAnalytics(BaseModel):
    site_id: uuid.UUID
    site_name: str
    project_name: str
    area_hectares: float
    observation_count: int
    date_range: tuple[str, str] | None = None
    summaries: list[MetricSummary] = Field(default_factory=list)
    series: list[Series] = Field(default_factory=list)
    carbon_by_year: dict[str, float] = Field(default_factory=dict)


class SiteContribution(BaseModel):
    """Per-site rollup used by project-level charts and the map popups."""

    site_id: uuid.UUID
    site_name: str
    area_hectares: float
    carbon_tco2e: float
    canopy_cover_pct: float | None = None
    ndvi: float | None = None
    biodiversity_index: float | None = None
    centroid_lat: float | None = None
    centroid_lng: float | None = None


class ProjectAnalytics(BaseModel):
    project_id: uuid.UUID
    project_name: str
    project_type: str
    status: str
    site_count: int
    total_area_hectares: float
    total_carbon_tco2e: float
    average_ndvi: float | None = None
    average_canopy_cover_pct: float | None = None
    average_biodiversity_index: float | None = None
    contributions: list[SiteContribution] = Field(default_factory=list)
    carbon_by_year: dict[str, float] = Field(default_factory=dict)
    series: list[Series] = Field(default_factory=list)


class DashboardSummary(BaseModel):
    project_count: int
    site_count: int
    observation_count: int
    total_area_hectares: float
    total_carbon_tco2e: float
    average_ndvi: float | None = None
    area_by_project_type: dict[str, float] = Field(default_factory=dict)
    carbon_by_month: dict[str, float] = Field(default_factory=dict)
