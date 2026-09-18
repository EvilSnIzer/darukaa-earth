"""Analytics endpoints powering the charts and KPI cards."""

from __future__ import annotations

import uuid

from fastapi import APIRouter

from app.api.v1.projects import get_project_or_404
from app.api.v1.sites import get_site_or_404
from app.core.deps import CurrentUser, DbSession
from app.schemas.analytics import DashboardSummary, ProjectAnalytics, SiteAnalytics
from app.services.analytics import (
    build_dashboard_summary,
    build_project_analytics,
    build_site_analytics,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard", response_model=DashboardSummary, summary="Portfolio-wide KPIs")
def dashboard(db: DbSession, _user: CurrentUser) -> DashboardSummary:
    return build_dashboard_summary(db)


@router.get(
    "/projects/{project_id}",
    response_model=ProjectAnalytics,
    summary="Aggregated analytics for a project",
)
def project_analytics(project_id: uuid.UUID, db: DbSession, _user: CurrentUser) -> ProjectAnalytics:
    return build_project_analytics(db, get_project_or_404(db, project_id))


@router.get(
    "/sites/{site_id}",
    response_model=SiteAnalytics,
    summary="Time-series analytics for one site",
)
def site_analytics(site_id: uuid.UUID, db: DbSession, _user: CurrentUser) -> SiteAnalytics:
    """The payload behind the site detail page: KPI summaries plus chart series."""
    return build_site_analytics(db, get_site_or_404(db, site_id))
