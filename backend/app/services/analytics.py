"""Analytics engine: aggregation over the observations time series.

Heavy aggregation is pushed into SQL so the API stays cheap as observation volume
grows; the Python layer only reshapes rows into chart-ready series.
"""

from __future__ import annotations

import math
from datetime import date
from statistics import mean
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.observation import Observation
from app.models.project import Project
from app.models.site import Site
from app.schemas.analytics import (
    DashboardSummary,
    MetricSummary,
    ProjectAnalytics,
    Series,
    SiteAnalytics,
    SiteContribution,
)

# metric key -> (attribute, unit, aggregation kind)
METRICS: dict[str, tuple[str, str, str]] = {
    "carbon_sequestered_tco2e": ("carbon_sequestered_tco2e", "tCO2e", "sum"),
    "biomass_tonnes": ("biomass_tonnes", "tonnes", "mean"),
    "ndvi": ("ndvi", "index", "mean"),
    "canopy_cover_pct": ("canopy_cover_pct", "%", "mean"),
    "tree_count": ("tree_count", "trees", "mean"),
    "biodiversity_index": ("biodiversity_index", "index", "mean"),
    "species_observed": ("species_observed", "species", "mean"),
}

SERIES_METRICS = (
    "carbon_sequestered_tco2e",
    "ndvi",
    "canopy_cover_pct",
    "biodiversity_index",
)

MONTHS_PER_YEAR = 12


def _round(value: float | None, digits: int = 4) -> float | None:
    return None if value is None else round(value, digits)


def _coerce(value: object, default: float = 0.0) -> float:
    """Convert a SQL scalar to float, treating NULL as `default`.

    SQLAlchemy types `func.sum(...)` as Optional even when the query wraps it in
    COALESCE, because SUM over zero rows is genuinely NULL in general SQL. This
    helper centralises that narrowing instead of scattering casts at call sites.
    """
    return default if value is None else float(value)  # type: ignore[arg-type]


def _pct_change(earliest: float | None, latest: float | None) -> float | None:
    if earliest is None or latest is None or earliest == 0:
        return None
    return round(((latest - earliest) / abs(earliest)) * 100, 2)


def _trend_per_year(dates: list[date], values: list[float | None]) -> float | None:
    """Least-squares slope of value vs time, expressed per year."""
    points = [(d, v) for d, v in zip(dates, values, strict=True) if v is not None]
    if len(points) < 3:
        return None

    origin = points[0][0]
    xs = [(d - origin).days / 365.25 for d, _ in points]
    ys = [v for _, v in points]

    mean_x = mean(xs)
    mean_y = mean(ys)
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if math.isclose(denominator, 0.0):
        return None
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys, strict=True)) / denominator
    return round(slope, 4)


def _summarise(metric: str, dates: list[date], values: list[float | None]) -> MetricSummary:
    _, unit, aggregation = METRICS[metric]
    present = [v for v in values if v is not None]

    summary = MetricSummary(
        metric=metric,
        unit=unit,
        latest=_round(values[-1]) if values else None,
        earliest=_round(values[0]) if values else None,
        min=_round(min(present)) if present else None,
        max=_round(max(present)) if present else None,
        mean=_round(mean(present)) if present else None,
        change_pct=_pct_change(values[0] if values else None, values[-1] if values else None),
        trend_per_year=_trend_per_year(dates, values),
    )
    if aggregation == "sum":
        summary.total = _round(sum(present)) if present else None
    return summary


def build_site_analytics(db: Session, site: Site) -> SiteAnalytics:
    """Assemble the full analytics payload for one site."""
    observations = (
        db.execute(
            select(Observation)
            .where(Observation.site_id == site.id)
            .order_by(Observation.measured_on.asc())
        )
        .scalars()
        .all()
    )

    dates = [o.measured_on for o in observations]
    series: list[Series] = []
    summaries: list[MetricSummary] = []

    for metric in METRICS:
        values = [getattr(o, metric) for o in observations]
        if all(v is None for v in values):
            continue
        summaries.append(_summarise(metric, dates, values))
        if metric in SERIES_METRICS:
            series.append(
                Series(
                    label=metric,
                    dates=[d.isoformat() for d in dates],
                    values=[_round(v) for v in values],
                )
            )

    carbon_by_year: dict[str, float] = {}
    for observation in observations:
        if observation.carbon_sequestered_tco2e is None:
            continue
        key = str(observation.measured_on.year)
        carbon_by_year[key] = round(
            carbon_by_year.get(key, 0.0) + observation.carbon_sequestered_tco2e, 4
        )

    return SiteAnalytics(
        site_id=site.id,
        site_name=site.name,
        project_name=site.project.name if site.project else "",
        area_hectares=_coerce(site.area_hectares),
        observation_count=len(observations),
        date_range=(dates[0].isoformat(), dates[-1].isoformat()) if dates else None,
        summaries=summaries,
        series=series,
        carbon_by_year=dict(sorted(carbon_by_year.items())),
    )


def _latest_metric_rows(db: Session, site_ids: list[Any]) -> dict[Any, Observation]:
    """Latest observation per site, via a DISTINCT ON (Postgres-specific, index-friendly)."""
    if not site_ids:
        return {}
    rows = db.execute(
        select(Observation)
        .where(Observation.site_id.in_(site_ids))
        .distinct(Observation.site_id)
        .order_by(Observation.site_id, Observation.measured_on.desc())
    ).scalars()
    return {row.site_id: row for row in rows}


def build_project_analytics(db: Session, project: Project) -> ProjectAnalytics:
    """Aggregate every site in a project into one dashboard payload."""
    sites = list(project.sites)
    site_ids = [s.id for s in sites]

    rows = db.execute(
        select(
            func.coalesce(func.sum(Observation.carbon_sequestered_tco2e), 0.0).label("carbon"),
            func.to_char(func.date_trunc("year", Observation.measured_on), "YYYY").label("year"),
        )
        .join(Site, Site.id == Observation.site_id)
        .where(Site.project_id == project.id)
        .group_by("year")
        .order_by("year")
    ).all()
    carbon_by_year = {row.year: round(_coerce(row.carbon), 4) for row in rows if row.year}

    total_carbon = round(sum(carbon_by_year.values()), 4)
    latest = _latest_metric_rows(db, site_ids)

    contributions: list[SiteContribution] = []
    ndvi_values: list[float] = []
    canopy_values: list[float] = []
    biodiv_values: list[float] = []
    for site in sites:
        observation = latest.get(site.id)
        if observation is not None:
            if observation.ndvi is not None:
                ndvi_values.append(observation.ndvi)
            if observation.canopy_cover_pct is not None:
                canopy_values.append(observation.canopy_cover_pct)
            if observation.biodiversity_index is not None:
                biodiv_values.append(observation.biodiversity_index)

        site_carbon = db.execute(
            select(func.coalesce(func.sum(Observation.carbon_sequestered_tco2e), 0.0)).where(
                Observation.site_id == site.id
            )
        ).scalar_one()
        contributions.append(
            SiteContribution(
                site_id=site.id,
                site_name=site.name,
                area_hectares=_coerce(site.area_hectares),
                carbon_tco2e=round(_coerce(site_carbon), 4),
                canopy_cover_pct=_round(observation.canopy_cover_pct) if observation else None,
                ndvi=_round(observation.ndvi) if observation else None,
                biodiversity_index=_round(observation.biodiversity_index) if observation else None,
                centroid_lat=site.centroid_lat,
                centroid_lng=site.centroid_lng,
            )
        )

    contributions.sort(key=lambda c: c.carbon_tco2e, reverse=True)

    # Project-level time series: sum carbon and average the health metrics per date.
    series_rows = db.execute(
        select(
            Observation.measured_on,
            func.sum(Observation.carbon_sequestered_tco2e).label("carbon"),
            func.avg(Observation.ndvi).label("ndvi"),
            func.avg(Observation.canopy_cover_pct).label("canopy"),
            func.avg(Observation.biodiversity_index).label("biodiv"),
        )
        .join(Site, Site.id == Observation.site_id)
        .where(Site.project_id == project.id)
        .group_by(Observation.measured_on)
        .order_by(Observation.measured_on)
    ).all()

    labels = [row.measured_on.isoformat() for row in series_rows]
    series = [
        Series(
            label="carbon_sequestered_tco2e",
            dates=labels,
            values=[
                _round(float(row.carbon)) if row.carbon is not None else None for row in series_rows
            ],
        ),
        Series(
            label="ndvi",
            dates=labels,
            values=[
                _round(float(row.ndvi)) if row.ndvi is not None else None for row in series_rows
            ],
        ),
        Series(
            label="canopy_cover_pct",
            dates=labels,
            values=[
                _round(float(row.canopy)) if row.canopy is not None else None for row in series_rows
            ],
        ),
        Series(
            label="biodiversity_index",
            dates=labels,
            values=[
                _round(float(row.biodiv)) if row.biodiv is not None else None for row in series_rows
            ],
        ),
    ]

    return ProjectAnalytics(
        project_id=project.id,
        project_name=project.name,
        project_type=project.project_type.value,
        status=project.status.value,
        site_count=len(sites),
        total_area_hectares=round(sum(_coerce(s.area_hectares) for s in sites), 4),
        total_carbon_tco2e=total_carbon,
        average_ndvi=_round(mean(ndvi_values)) if ndvi_values else None,
        average_canopy_cover_pct=_round(mean(canopy_values)) if canopy_values else None,
        average_biodiversity_index=_round(mean(biodiv_values)) if biodiv_values else None,
        contributions=contributions,
        carbon_by_year=carbon_by_year,
        series=series,
    )


def build_dashboard_summary(db: Session) -> DashboardSummary:
    """Top-line KPIs for the landing dashboard."""
    project_count = db.execute(select(func.count(Project.id))).scalar_one()
    site_count = db.execute(select(func.count(Site.id))).scalar_one()
    observation_count = db.execute(select(func.count(Observation.id))).scalar_one()

    totals = db.execute(
        select(
            func.coalesce(func.sum(Site.area_hectares), 0.0).label("area"),
        )
    ).one()

    carbon_total = db.execute(
        select(func.coalesce(func.sum(Observation.carbon_sequestered_tco2e), 0.0))
    ).scalar_one()

    ndvi_avg = db.execute(select(func.avg(Observation.ndvi))).scalar_one()

    area_by_type_rows = db.execute(
        select(Project.project_type, func.coalesce(func.sum(Site.area_hectares), 0.0))
        .join(Site, Site.project_id == Project.id, isouter=True)
        .group_by(Project.project_type)
    ).all()
    area_by_project_type = {
        row.project_type.value
        if hasattr(row.project_type, "value")
        else str(row.project_type): round(float(row[1]), 4)
        for row in area_by_type_rows
    }

    carbon_by_month_rows = db.execute(
        select(
            func.to_char(func.date_trunc("month", Observation.measured_on), "YYYY-MM").label(
                "month"
            ),
            func.sum(Observation.carbon_sequestered_tco2e).label("carbon"),
        )
        .group_by("month")
        .order_by("month")
    ).all()
    carbon_by_month = {
        row.month: round(_coerce(row.carbon), 4)
        for row in carbon_by_month_rows
        if row.month and row.carbon is not None
    }

    return DashboardSummary(
        project_count=int(project_count),
        site_count=int(site_count),
        observation_count=int(observation_count),
        total_area_hectares=round(_coerce(totals.area), 4),
        total_carbon_tco2e=round(_coerce(carbon_total), 4),
        average_ndvi=_round(float(ndvi_avg)) if ndvi_avg is not None else None,
        area_by_project_type=area_by_project_type,
        carbon_by_month=carbon_by_month,
    )
