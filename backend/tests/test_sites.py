"""Site CRUD with drawn polygons, plus PostGIS geometry handling."""

from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.project import Project
from app.models.site import Site
from app.services.geo import GeometryError, compute_site_metrics, geojson_to_wkt

from .conftest import SQUARE_GEOJSON


def _payload(project: Project, name: str = "Drawn Parcel", geometry=None) -> dict:
    return {
        "name": name,
        "description": "Created from a drawn polygon",
        "land_cover": "Dry deciduous",
        "planting_year": 2023,
        "project_id": str(project.id),
        "geometry": geometry or SQUARE_GEOJSON,
    }


def test_create_site_from_drawn_polygon(admin_client: TestClient, project: Project) -> None:
    response = admin_client.post("/api/v1/sites", json=_payload(project))
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["name"] == "Drawn Parcel"
    assert body["area_hectares"] > 0
    assert body["geometry"]["type"] == "MultiPolygon"
    assert body["project_name"] == project.name


def test_polygon_is_promoted_to_multipolygon_in_db(
    db: Session, admin_client: TestClient, project: Project
) -> None:
    """The column is MULTIPOLYGON, so a drawn Polygon must be promoted before insert."""
    response = admin_client.post("/api/v1/sites", json=_payload(project))
    site_id = response.json()["id"]
    # NB: the column alias must not be `t` - SQLAlchemy's Row exposes a deprecated
    # `Row.t` accessor, so `row.t` silently returns the whole row instead of the
    # column. Accessing by position sidesteps attribute-name collisions entirely.
    stored = db.execute(
        text("SELECT GeometryType(geometry), ST_SRID(geometry) FROM sites WHERE id = :site_id"),
        {"site_id": uuid.UUID(site_id)},
    ).one()
    geom_type, srid = stored[0], stored[1]
    assert geom_type.upper() == "MULTIPOLYGON"
    assert srid == 4326


def test_area_is_geodesic_not_planar(
    db: Session, admin_client: TestClient, project: Project
) -> None:
    """Area must come from ST_Area(geography), not from degree-squared planar maths."""
    response = admin_client.post("/api/v1/sites", json=_payload(project))
    area_ha = response.json()["area_hectares"]

    # A 0.05 x 0.05 degree box at latitude 28.6 is ~4.9km x ~5.5km => roughly 2400 ha.
    # A planar degree-squared computation would give ~0.0025 "units" instead.
    assert 2000 < area_ha < 2900, f"unexpected area {area_ha} ha"


def test_centroid_is_stored_for_map_labels(admin_client: TestClient, project: Project) -> None:
    body = admin_client.post("/api/v1/sites", json=_payload(project)).json()
    assert body["centroid_lat"] == pytest.approx(28.625, abs=0.01)
    assert body["centroid_lng"] == pytest.approx(77.225, abs=0.01)


def test_duplicate_site_name_in_project_conflicts(
    admin_client: TestClient, project: Project
) -> None:
    assert admin_client.post("/api/v1/sites", json=_payload(project)).status_code == 201
    second = admin_client.post("/api/v1/sites", json=_payload(project))
    assert second.status_code == 409


def test_same_site_name_allowed_in_different_project(
    admin_client: TestClient, project: Project, db: Session
) -> None:
    from app.models.project import Project as ProjectModel
    from app.models.user import User

    owner = db.query(User).first()
    other = ProjectModel(name=f"Other {uuid.uuid4().hex[:6]}", owner_id=owner.id)
    db.add(other)
    db.commit()
    db.refresh(other)

    assert admin_client.post("/api/v1/sites", json=_payload(project)).status_code == 201
    assert admin_client.post("/api/v1/sites", json=_payload(other)).status_code == 201


def test_point_geometry_rejected_with_guidance(admin_client: TestClient, project: Project) -> None:
    payload = _payload(project, geometry={"type": "Point", "coordinates": [77.2, 28.6]})
    response = admin_client.post("/api/v1/sites", json=payload)
    assert response.status_code == 422
    assert "polygon" in response.json()["detail"].lower()


def test_self_intersecting_polygon_is_repaired(admin_client: TestClient, project: Project) -> None:
    """A bowtie is invalid but recoverable via ST_MakeValid - no 500 to the client."""
    bowtie = {
        "type": "Polygon",
        "coordinates": [[[77.0, 28.0], [77.1, 28.1], [77.1, 28.0], [77.0, 28.1], [77.0, 28.0]]],
    }
    response = admin_client.post("/api/v1/sites", json=_payload(project, geometry=bowtie))
    assert response.status_code == 201, response.text
    assert response.json()["geometry"]["type"] == "MultiPolygon"


def test_degenerate_zero_area_polygon_rejected(admin_client: TestClient, project: Project) -> None:
    sliver = {
        "type": "Polygon",
        "coordinates": [[[77.0, 28.0], [77.00001, 28.0], [77.00002, 28.00001], [77.0, 28.0]]],
    }
    response = admin_client.post("/api/v1/sites", json=_payload(project, geometry=sliver))
    assert response.status_code == 422
    assert "too small" in response.json()["detail"].lower()


def test_malformed_coordinates_rejected(admin_client: TestClient, project: Project) -> None:
    payload = _payload(project, geometry={"type": "Polygon", "coordinates": "nonsense"})
    assert admin_client.post("/api/v1/sites", json=payload).status_code == 422


def test_site_on_missing_project_is_404(admin_client: TestClient) -> None:
    payload = _payload(project=type("P", (), {"id": uuid.uuid4()})())
    response = admin_client.post("/api/v1/sites", json=payload)
    assert response.status_code == 404


def test_list_sites_filters_by_project(
    admin_client: TestClient, project: Project, site: Site
) -> None:
    response = admin_client.get(f"/api/v1/sites?project_id={project.id}")
    assert response.status_code == 200
    assert all(row["project_id"] == str(project.id) for row in response.json())


def test_map_geojson_is_a_feature_collection(
    admin_client: TestClient, project: Project, site: Site
) -> None:
    response = admin_client.get("/api/v1/sites/map/geojson")
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert isinstance(body["features"], list)
    feature = next(f for f in body["features"] if f["id"] == str(site.id))
    assert feature["geometry"]["type"] == "MultiPolygon"
    assert feature["properties"]["project_name"] == project.name


def test_update_site_redraws_boundary_and_recomputes_area(
    admin_client: TestClient, site: Site
) -> None:
    bigger = {
        "type": "Polygon",
        "coordinates": [[[77.0, 28.0], [77.3, 28.0], [77.3, 28.3], [77.0, 28.3], [77.0, 28.0]]],
    }
    original_area = site.area_hectares
    response = admin_client.patch(
        f"/api/v1/sites/{site.id}", json={"name": "Redrawn Site", "geometry": bigger}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["name"] == "Redrawn Site"
    assert body["area_hectares"] > float(original_area)


def test_delete_site_cascades(admin_client: TestClient, site: Site, db: Session) -> None:
    assert admin_client.delete(f"/api/v1/sites/{site.id}").status_code == 200
    assert db.get(Site, site.id) is None


def test_get_missing_site_is_404(admin_client: TestClient) -> None:
    assert admin_client.get(f"/api/v1/sites/{uuid.uuid4()}").status_code == 404


def test_unauthenticated_site_access_blocked(client: TestClient) -> None:
    assert client.get("/api/v1/sites").status_code == 401


# --- service layer -----------------------------------------------------------


def test_geojson_to_wkt_validates_and_closes_ring() -> None:
    wkt = geojson_to_wkt(SQUARE_GEOJSON)
    assert wkt.startswith("MULTIPOLYGON")


def test_geometry_error_raised_for_line() -> None:
    with pytest.raises(GeometryError):
        geojson_to_wkt({"type": "LineString", "coordinates": [[0, 0], [1, 1]]})


def test_compute_site_metrics_returns_positive_area(db: Session) -> None:
    area, lat, lng = compute_site_metrics(
        db, "POLYGON((77.2 28.6, 77.25 28.6, 77.25 28.65, 77.2 28.65, 77.2 28.6))"
    )
    assert area > 2000
    assert 28.6 < lat < 28.65
    assert 77.2 < lng < 77.25
