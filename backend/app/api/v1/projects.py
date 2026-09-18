"""Project CRUD endpoints."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from geoalchemy2.functions import ST_AsGeoJSON
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models.observation import Observation
from app.models.project import Project
from app.models.site import Site
from app.schemas.common import Message, Paginated
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.services.analytics import _coerce
from app.services.geo import site_to_feature

router = APIRouter(prefix="/projects", tags=["projects"])


def get_project_or_404(db: Session, project_id: uuid.UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    return project


def _to_read(db: Session, project: Project) -> ProjectRead:
    """Attach computed rollups that are not stored on the row."""
    aggregates = db.execute(
        select(
            func.count(Site.id).label("site_count"),
            func.coalesce(func.sum(Site.area_hectares), 0.0).label("area"),
        ).where(Site.project_id == project.id)
    ).one()

    carbon = db.execute(
        select(func.coalesce(func.sum(Observation.carbon_sequestered_tco2e), 0.0))
        .join(Site, Site.id == Observation.site_id)
        .where(Site.project_id == project.id)
    ).scalar_one()

    data = ProjectRead.model_validate(project)
    data.site_count = int(aggregates.site_count)
    data.total_area_hectares = round(_coerce(aggregates.area), 4)
    data.total_carbon_tco2e = round(_coerce(carbon), 4)
    return data


@router.get("", response_model=Paginated[ProjectRead], summary="List projects")
def list_projects(
    db: DbSession,
    _user: CurrentUser,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    search: str | None = Query(None, max_length=120),
) -> Paginated[ProjectRead]:
    query = select(Project)
    count_query = select(func.count(Project.id))
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(Project.name.ilike(pattern))
        count_query = count_query.where(Project.name.ilike(pattern))

    total = db.execute(count_query).scalar_one()
    projects = (
        db.execute(query.order_by(Project.created_at.desc()).offset(skip).limit(limit))
        .scalars()
        .all()
    )
    return Paginated[ProjectRead](
        items=[_to_read(db, p) for p in projects],
        total=int(total),
    )


@router.post(
    "",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a project",
)
def create_project(payload: ProjectCreate, db: DbSession, admin: AdminUser) -> ProjectRead:
    duplicate = db.execute(select(Project).where(Project.name == payload.name)).scalar_one_or_none()
    if duplicate is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A project with this name already exists"
        )
    project = Project(**payload.model_dump(), owner_id=admin.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return _to_read(db, project)


@router.get("/{project_id}", response_model=ProjectRead, summary="Get one project")
def get_project(project_id: uuid.UUID, db: DbSession, _user: CurrentUser) -> ProjectRead:
    return _to_read(db, get_project_or_404(db, project_id))


@router.patch("/{project_id}", response_model=ProjectRead, summary="Update a project")
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    db: DbSession,
    _admin: AdminUser,
) -> ProjectRead:
    project = get_project_or_404(db, project_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return _to_read(db, project)


@router.delete(
    "/{project_id}",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Delete a project and cascade its sites",
)
def delete_project(project_id: uuid.UUID, db: DbSession, _admin: AdminUser) -> Message:
    project = get_project_or_404(db, project_id)
    db.delete(project)
    db.commit()
    return Message(detail=f"Project '{project.name}' deleted")


@router.get(
    "/{project_id}/sites/geojson", summary="Sites of a project as a GeoJSON FeatureCollection"
)
def project_sites_geojson(project_id: uuid.UUID, db: DbSession, _user: CurrentUser) -> dict:
    """Returns GeoJSON directly so Mapbox GL JS can consume it without mapping code."""
    project = get_project_or_404(db, project_id)
    rows = db.execute(
        select(
            Site.id,
            Site.name,
            Site.area_hectares,
            ST_AsGeoJSON(Site.geometry).label("geojson"),
        )
        .where(Site.project_id == project.id)
        .order_by(Site.name)
    ).all()

    features = [
        site_to_feature(
            site_id=str(row.id),
            name=row.name,
            # ST_AsGeoJSON already emits GeoJSON text; parse rather than round-trip WKT.
            geometry=json.loads(row.geojson),
            properties={
                "area_hectares": float(row.area_hectares),
                "project_id": str(project.id),
                "project_name": project.name,
            },
        )
        for row in rows
    ]
    return {"type": "FeatureCollection", "features": features}
