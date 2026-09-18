"""Health endpoint: proves the PostGIS dependency is wired."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_reports_postgis(client: TestClient, postgis_version: str) -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert body["postgis"].startswith("3.")
    assert body["geometry_column"] == "MULTIPOLYGON, SRID 4326"


def test_root_points_to_docs(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["docs"] == "/docs"
