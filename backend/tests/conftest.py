"""Shared fixtures.

Tests run against a real PostgreSQL + PostGIS database (a dedicated `<db>_test`
database created by `tests/__init__.py`), never SQLite: PostGIS geometry handling,
GiST indexes and `ST_Area(geography)` are the substance of this project and cannot
be faithfully emulated.

Each test runs inside a transaction that is rolled back, so tests are isolated and
nothing persists between them.
"""

from __future__ import annotations

import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security import create_access_token, hash_password
from app.db.base import Base
from app.db.session import get_db
from app.main import app
from app.models.project import Project, ProjectStatus, ProjectType
from app.models.site import SITE_SRID, Site
from app.models.user import User, UserRole
from app.services.geo import compute_site_metrics

# Imported first: this is what points the app at the test database.
from tests import ensure_postgis, test_engine

# A ~0.05 x 0.05 degree square near Delhi (about 2,400 ha).
SQUARE_WKT = "POLYGON((77.20 28.60, 77.25 28.60, 77.25 28.65, 77.20 28.65, 77.20 28.60))"
SQUARE_RING = [
    [77.20, 28.60],
    [77.25, 28.60],
    [77.25, 28.65],
    [77.20, 28.65],
    [77.20, 28.60],  # closed ring
]
SQUARE_GEOJSON = {"type": "Polygon", "coordinates": [SQUARE_RING]}


@pytest.fixture(scope="session", autouse=True)
def _database() -> Generator[None, None, None]:
    """Create the schema in the test database once, drop it at the end."""
    ensure_postgis()
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)
    test_engine.dispose()


@pytest.fixture
def db() -> Generator[Session, None, None]:
    """A session bound to a transaction that rolls back at teardown."""
    connection = test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def admin_user(db: Session) -> User:
    user = User(
        email=f"admin-{uuid.uuid4().hex[:8]}@darukaa-test.example.com",
        full_name="Test Admin",
        hashed_password=hash_password("Admin@12345"),
        role=UserRole.admin,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def viewer_user(db: Session) -> User:
    user = User(
        email=f"viewer-{uuid.uuid4().hex[:8]}@darukaa-test.example.com",
        full_name="Test Viewer",
        hashed_password=hash_password("Viewer@12345"),
        role=UserRole.viewer,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def project(db: Session, admin_user: User) -> Project:
    project = Project(
        name=f"Test Project {uuid.uuid4().hex[:8]}",
        description="Fixture project",
        project_type=ProjectType.reforestation,
        status=ProjectStatus.active,
        country="India",
        owner_id=admin_user.id,
        baseline_year=2021,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@pytest.fixture
def site(db: Session, project: Project) -> Site:
    from geoalchemy2.functions import ST_GeomFromText

    area, lat, lng = compute_site_metrics(db, SQUARE_WKT)
    site = Site(
        name=f"Test Site {uuid.uuid4().hex[:8]}",
        geometry=ST_GeomFromText(SQUARE_WKT, SITE_SRID),
        area_hectares=area,
        centroid_lat=lat,
        centroid_lng=lng,
        land_cover="Test cover",
        planting_year=2022,
        project_id=project.id,
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


@pytest.fixture
def client(db: Session) -> Generator[TestClient, None, None]:
    """TestClient whose get_db dependency reuses the rollback-bound session."""

    def _override() -> Generator[Session, None, None]:
        yield db

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def admin_client(client: TestClient, admin_user: User) -> TestClient:
    client.headers.update({"Authorization": f"Bearer {create_access_token(str(admin_user.id))}"})
    return client


@pytest.fixture
def viewer_client(client: TestClient, viewer_user: User) -> TestClient:
    client.headers.update({"Authorization": f"Bearer {create_access_token(str(viewer_user.id))}"})
    return client


@pytest.fixture
def postgis_version() -> str:
    with test_engine.connect() as connection:
        return str(connection.execute(text("SELECT PostGIS_Version()")).scalar_one())
