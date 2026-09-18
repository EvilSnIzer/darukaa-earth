"""Project CRUD and role-based access."""

from __future__ import annotations

import uuid

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.project import Project, ProjectStatus
from app.models.site import Site
from app.models.user import User


def test_create_project(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/api/v1/projects",
        json={
            "name": f"Mangrove Restoration {uuid.uuid4().hex[:6]}",
            "description": "Coastal blue carbon",
            "project_type": "mangrove_restoration",
            "status": "planning",
            "country": "India",
            "methodology": "VCS VM0033",
            "baseline_year": 2023,
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["project_type"] == "mangrove_restoration"
    assert body["site_count"] == 0
    assert body["total_area_hectares"] == 0


def test_create_project_duplicate_name_conflicts(
    admin_client: TestClient, project: Project
) -> None:
    response = admin_client.post("/api/v1/projects", json={"name": project.name})
    assert response.status_code == 409


def test_invalid_project_type_rejected(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/api/v1/projects", json={"name": "Bad Type", "project_type": "not-a-type"}
    )
    assert response.status_code == 422


def test_baseline_year_out_of_range_rejected(admin_client: TestClient) -> None:
    response = admin_client.post(
        "/api/v1/projects", json={"name": "Bad Year", "baseline_year": 1500}
    )
    assert response.status_code == 422


def test_list_projects_reports_rollups(
    admin_client: TestClient, project: Project, site: Site
) -> None:
    response = admin_client.get("/api/v1/projects")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    row = next(p for p in body["items"] if p["id"] == str(project.id))
    assert row["site_count"] == 1
    assert row["total_area_hectares"] > 0


def test_list_projects_search_filter(admin_client: TestClient, project: Project) -> None:
    response = admin_client.get(f"/api/v1/projects?search={project.name[:8]}")
    assert response.status_code == 200
    assert any(p["id"] == str(project.id) for p in response.json()["items"])


def test_get_project(admin_client: TestClient, project: Project) -> None:
    response = admin_client.get(f"/api/v1/projects/{project.id}")
    assert response.status_code == 200
    assert response.json()["name"] == project.name


def test_get_missing_project_is_404(admin_client: TestClient) -> None:
    assert admin_client.get(f"/api/v1/projects/{uuid.uuid4()}").status_code == 404


def test_update_project_status(admin_client: TestClient, project: Project, db: Session) -> None:
    response = admin_client.patch(f"/api/v1/projects/{project.id}", json={"status": "completed"})
    assert response.status_code == 200
    assert response.json()["status"] == "completed"
    db.expire_all()
    assert db.get(Project, project.id).status == ProjectStatus.completed


def test_delete_project_cascades_sites(
    admin_client: TestClient, project: Project, site: Site, db: Session
) -> None:
    site_id = site.id
    assert admin_client.delete(f"/api/v1/projects/{project.id}").status_code == 200
    assert db.get(Site, site_id) is None


def test_viewer_can_read_but_not_write(viewer_client: TestClient, project: Project) -> None:
    assert viewer_client.get(f"/api/v1/projects/{project.id}").status_code == 200
    assert (
        viewer_client.patch(f"/api/v1/projects/{project.id}", json={"status": "paused"}).status_code
        == 403
    )
    assert viewer_client.delete(f"/api/v1/projects/{project.id}").status_code == 403


def test_project_sites_geojson(admin_client: TestClient, project: Project, site: Site) -> None:
    response = admin_client.get(f"/api/v1/projects/{project.id}/sites/geojson")
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) == 1
    assert body["features"][0]["properties"]["area_hectares"] > 0


def test_owner_id_is_set_from_authenticated_user(
    admin_client: TestClient, admin_user: User
) -> None:
    name = f"Owned Project {uuid.uuid4().hex[:6]}"
    body = admin_client.post("/api/v1/projects", json={"name": name}).json()
    assert body["owner_id"] == str(admin_user.id)
