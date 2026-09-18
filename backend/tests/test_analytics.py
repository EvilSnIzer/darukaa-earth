"""Analytics aggregation and the observation time series."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.observation import DataSource, Observation
from app.models.project import Project
from app.models.site import Site
from app.services.analytics import _pct_change, _trend_per_year


def _add_observations(db: Session, site: Site, months: int = 12, start: float = 10.0) -> None:
    today = date(2026, 1, 1)
    for index in range(months):
        db.add(
            Observation(
                site_id=site.id,
                measured_on=today + timedelta(days=30 * index),
                carbon_sequestered_tco2e=start + index * 2,
                ndvi=min(0.95, 0.30 + index * 0.02),
                canopy_cover_pct=min(98.0, 20.0 + index * 3),
                biodiversity_index=min(0.98, 0.30 + index * 0.01),
                tree_count=1000 + index * 100,
                species_observed=20 + index,
                biomass_tonnes=100.0 + index * 5,
                data_source=DataSource.satellite,
            )
        )
    db.commit()


def test_site_analytics_returns_full_series(
    admin_client: TestClient, site: Site, db: Session
) -> None:
    _add_observations(db, site, months=12)
    response = admin_client.get(f"/api/v1/analytics/sites/{site.id}")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["observation_count"] == 12
    labels = {s["label"] for s in body["series"]}
    assert {"carbon_sequestered_tco2e", "ndvi", "canopy_cover_pct"} <= labels
    carbon = next(s for s in body["series"] if s["label"] == "carbon_sequestered_tco2e")
    assert len(carbon["values"]) == 12
    assert carbon["values"][0] == 10.0
    assert carbon["values"][-1] == 32.0


def test_site_analytics_summaries_are_consistent(
    admin_client: TestClient, site: Site, db: Session
) -> None:
    _add_observations(db, site, months=12, start=10.0)
    body = admin_client.get(f"/api/v1/analytics/sites/{site.id}").json()
    carbon = next(s for s in body["summaries"] if s["metric"] == "carbon_sequestered_tco2e")
    assert carbon["earliest"] == 10.0
    assert carbon["latest"] == 32.0
    assert carbon["min"] == 10.0
    assert carbon["max"] == 32.0
    # sum(10,12,...,32) = 12 terms averaging 21 => 252
    assert carbon["total"] == 252.0
    assert carbon["trend_per_year"] is not None and carbon["trend_per_year"] > 0


def test_site_analytics_handles_site_without_observations(
    admin_client: TestClient, site: Site
) -> None:
    body = admin_client.get(f"/api/v1/analytics/sites/{site.id}").json()
    assert body["observation_count"] == 0
    assert body["series"] == []
    assert body["date_range"] is None


def test_site_analytics_missing_site_is_404(admin_client: TestClient) -> None:
    assert admin_client.get(f"/api/v1/analytics/sites/{uuid.uuid4()}").status_code == 404


def test_project_analytics_aggregates_sites(
    admin_client: TestClient, project: Project, site: Site, db: Session
) -> None:
    _add_observations(db, site, months=12)
    body = admin_client.get(f"/api/v1/analytics/projects/{project.id}").json()
    assert body["site_count"] == 1
    assert body["total_carbon_tco2e"] == 252.0
    assert body["total_area_hectares"] == float(site.area_hectares)
    assert len(body["contributions"]) == 1
    assert body["contributions"][0]["site_id"] == str(site.id)
    assert body["average_ndvi"] is not None


def test_project_analytics_carbon_by_year(
    admin_client: TestClient, project: Project, site: Site, db: Session
) -> None:
    _add_observations(db, site, months=12)
    body = admin_client.get(f"/api/v1/analytics/projects/{project.id}").json()
    assert "2026" in body["carbon_by_year"]


def test_dashboard_summary(admin_client: TestClient, site: Site, db: Session) -> None:
    _add_observations(db, site, months=6)
    body = admin_client.get("/api/v1/analytics/dashboard").json()
    assert body["site_count"] >= 1
    assert body["observation_count"] >= 6
    assert body["total_area_hectares"] > 0
    assert body["total_carbon_tco2e"] > 0
    assert isinstance(body["area_by_project_type"], dict)
    assert isinstance(body["carbon_by_month"], dict)


def test_analytics_requires_authentication(client: TestClient, site: Site) -> None:
    assert client.get(f"/api/v1/analytics/sites/{site.id}").status_code == 401
    assert client.get("/api/v1/analytics/dashboard").status_code == 401


# --- pure functions ----------------------------------------------------------


def test_pct_change_handles_zero_baseline() -> None:
    assert _pct_change(0.0, 10.0) is None
    assert _pct_change(None, 10.0) is None
    assert _pct_change(10.0, 15.0) == 50.0


def test_pct_change_negative_direction() -> None:
    assert _pct_change(10.0, 5.0) == -50.0


def test_trend_per_year_needs_three_points() -> None:
    dates = [date(2025, 1, 1), date(2025, 7, 1)]
    assert _trend_per_year(dates, [1.0, 2.0]) is None


def test_trend_per_year_positive_slope() -> None:
    """One unit added per calendar year should read back as ~1.0 per year.

    The slope is computed against elapsed days / 365.25, so a 365-day gap yields
    0.99932 rather than exactly 1.0 - hence approx, not equality.
    """
    dates = [date(2025, 1, 1), date(2026, 1, 1), date(2027, 1, 1)]
    slope = _trend_per_year(dates, [0.0, 1.0, 2.0])
    assert slope is not None
    assert slope == pytest.approx(1.0, abs=0.01)


def test_trend_per_year_requires_three_usable_points() -> None:
    """None values are dropped before the regression, so 2 usable points => no slope."""
    dates = [date(2025, 1, 1), date(2026, 1, 1), date(2027, 1, 1)]
    assert _trend_per_year(dates, [0.0, None, 2.0]) is None


def test_trend_per_year_ignores_none_values() -> None:
    """With a gap in the middle, the remaining three points still yield a slope."""
    dates = [
        date(2025, 1, 1),
        date(2026, 1, 1),
        date(2027, 1, 1),
        date(2028, 1, 1),
    ]
    slope = _trend_per_year(dates, [0.0, None, 2.0, 3.0])
    assert slope is not None
    assert slope == pytest.approx(1.0, abs=0.01)


# --- observation endpoints ---------------------------------------------------


def test_create_observation(admin_client: TestClient, site: Site) -> None:
    response = admin_client.post(
        "/api/v1/observations",
        json={
            "site_id": str(site.id),
            "measured_on": "2026-05-01",
            "carbon_sequestered_tco2e": 42.5,
            "ndvi": 0.61,
            "canopy_cover_pct": 38.0,
            "data_source": "field_survey",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["carbon_sequestered_tco2e"] == 42.5


def test_duplicate_observation_date_conflicts(admin_client: TestClient, site: Site) -> None:
    payload = {
        "site_id": str(site.id),
        "measured_on": "2026-05-01",
        "carbon_sequestered_tco2e": 10.0,
    }
    assert admin_client.post("/api/v1/observations", json=payload).status_code == 201
    assert admin_client.post("/api/v1/observations", json=payload).status_code == 409


def test_ndvi_out_of_range_rejected(admin_client: TestClient, site: Site) -> None:
    response = admin_client.post(
        "/api/v1/observations",
        json={"site_id": str(site.id), "measured_on": "2026-06-01", "ndvi": 5.0},
    )
    assert response.status_code == 422


def test_list_observations_ordered_desc(admin_client: TestClient, site: Site, db: Session) -> None:
    _add_observations(db, site, months=5)
    body = admin_client.get(f"/api/v1/observations/site/{site.id}").json()
    dates = [row["measured_on"] for row in body]
    assert dates == sorted(dates, reverse=True)


def test_delete_observation(admin_client: TestClient, site: Site, db: Session) -> None:
    _add_observations(db, site, months=1)
    observation_id = db.query(Observation).first().id
    assert admin_client.delete(f"/api/v1/observations/{observation_id}").status_code == 200
