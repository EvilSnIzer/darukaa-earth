"""Site endpoints: create by drawn polygon, list, detail, map data, delete."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, HTTPException, Query, status
from geoalchemy2.functions import ST_AsGeoJSON, ST_GeomFromText
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models.observation import Observation
from app.models.project import Project
from app.models.site import SITE_SRID, Site
from app.schemas.common import Message
from app.schemas.site import SiteCreate, SiteDetail, SiteRead, SiteUpdate
from app.services.geo import (
    MIN_AREA_HECTARES,
    GeometryError,
    compute_site_metrics,
    geojson_to_wkt,
    site_to_feature,
)

router = APIRouter(prefix="/sites", tags=["sites"])


def get_site_or_404(db: Session, site_id: uuid.UUID) -> Site:
    site = db.get(Site, site_id)
    if site is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Site not found")
    return site


def _to_read(db: Session, site: Site) -> SiteRead:
    observation_count = db.execute(
        select(func.count(Observation.id)).where(Observation.site_id == site.id)
    ).scalar_one()
    data = SiteRead.model_validate(site)
    data.observation_count = int(observation_count)
    data.area_hectares = round(float(site.area_hectares), 4)
    return data


def _to_detail(db: Session, site: Site) -> SiteDetail:
    geometry_json = db.execute(
        select(ST_AsGeoJSON(Site.geometry)).where(Site.id == site.id)
    ).scalar_one()
    base = _to_read(db, site)
    return SiteDetail(
        **base.model_dump(),
        geometry=json.loads(geometry_json),
        project_name=site.project.name if site.project else None,
    )


def _ensure_project_exists(db: Session, project_id: uuid.UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} does not exist; create it before adding sites.",
        )
    return project


def _unique_site_name(db: Session, project_id: uuid.UUID, name: str) -> None:
    clash = db.execute(
        select(Site.id).where(Site.project_id == project_id, Site.name == name)
    ).scalar_one_or_none()
    if clash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A site with this name already exists in the project",
        )


@router.get("", response_model=list[SiteRead], summary="List sites, optionally filtered by project")
def list_sites(
    db: DbSession,
    _user: CurrentUser,
    project_id: uuid.UUID | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
) -> list[SiteRead]:
    query = select(Site)
    if project_id is not None:
        query = query.where(Site.project_id == project_id)
    sites = (
        db.execute(query.order_by(Site.created_at.desc()).offset(skip).limit(limit)).scalars().all()
    )
    return [_to_read(db, site) for site in sites]


@router.get(
    "/map/geojson", summary="Every site as one GeoJSON FeatureCollection for the global map"
)
def sites_geojson(
    db: DbSession,
    _user: CurrentUser,
    project_id: uuid.UUID | None = Query(None),
) -> dict:
    query = select(
        Site.id,
        Site.name,
        Site.area_hectares,
        Site.centroid_lat,
        Site.centroid_lng,
        Site.land_cover,
        Project.id.label("project_id"),
        Project.name.label("project_name"),
        Project.project_type.label("project_type"),
        ST_AsGeoJSON(Site.geometry).label("geojson"),
    ).join(Project, Project.id == Site.project_id)
    if project_id is not None:
        query = query.where(Site.project_id == project_id)

    rows = db.execute(query.order_by(Site.name)).all()
    features = [
        site_to_feature(
            site_id=str(row.id),
            name=row.name,
            geometry=json.loads(row.geojson),
            properties={
                "area_hectares": float(row.area_hectares),
                "centroid_lat": row.centroid_lat,
                "centroid_lng": row.centroid_lng,
                "land_cover": row.land_cover,
                "project_id": str(row.project_id),
                "project_name": row.project_name,
                "project_type": row.project_type.value
                if hasattr(row.project_type, "value")
                else str(row.project_type),
            },
        )
        for row in rows
    ]
    return {"type": "FeatureCollection", "features": features}


@router.post(
    "",
    response_model=SiteDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Add a site from a drawn polygon",
)
def create_site(payload: SiteCreate, db: DbSession, _admin: AdminUser) -> SiteDetail:
    """Persist a hand-drawn polygon.

    Area and centroid are computed by PostGIS at write time, so every later read is
    a plain column lookup and never re-runs geodesic maths.
    """
    _ensure_project_exists(db, payload.project_id)
    _unique_site_name(db, payload.project_id, payload.name)

    geometry_dict = payload.geometry.model_dump()
    try:
        wkt_text = geojson_to_wkt(geometry_dict)
        area_hectares, centroid_lat, centroid_lng = compute_site_metrics(db, wkt_text)
    except GeometryError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc

    if area_hectares < MIN_AREA_HECTARES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Site is too small ({area_hectares} ha). Draw a larger boundary.",
        )

    site = Site(
        name=payload.name,
        description=payload.description,
        land_cover=payload.land_cover,
        planting_year=payload.planting_year,
        geometry=ST_GeomFromText(wkt_text, SITE_SRID),
        area_hectares=area_hectares,
        centroid_lat=centroid_lat,
        centroid_lng=centroid_lng,
        project_id=payload.project_id,
    )
    db.add(site)
    db.commit()
    db.refresh(site)
    return _to_detail(db, site)


@router.get("/{site_id}", response_model=SiteDetail, summary="Get one site with its geometry")
def get_site(site_id: uuid.UUID, db: DbSession, _user: CurrentUser) -> SiteDetail:
    return _to_detail(db, get_site_or_404(db, site_id))


@router.patch(
    "/{site_id}", response_model=SiteDetail, summary="Update a site or redraw its boundary"
)
def update_site(
    site_id: uuid.UUID,
    payload: SiteUpdate,
    db: DbSession,
    _admin: AdminUser,
) -> SiteDetail:
    site = get_site_or_404(db, site_id)
    updates = payload.model_dump(exclude_unset=True)

    if "name" in updates and updates["name"] != site.name:
        _unique_site_name(db, site.project_id, updates["name"])

    geometry_payload = updates.pop("geometry", None)
    if geometry_payload is not None:
        try:
            wkt_text = geojson_to_wkt(geometry_payload)
            area_hectares, centroid_lat, centroid_lng = compute_site_metrics(db, wkt_text)
        except GeometryError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
            ) from exc
        if area_hectares < MIN_AREA_HECTARES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Site is too small ({area_hectares} ha). Draw a larger boundary.",
            )
        site.geometry = ST_GeomFromText(wkt_text, SITE_SRID)
        site.area_hectares = area_hectares
        site.centroid_lat = centroid_lat
        site.centroid_lng = centroid_lng

    for field, value in updates.items():
        setattr(site, field, value)

    db.commit()
    db.refresh(site)
    return _to_detail(db, site)


@router.delete("/{site_id}", response_model=Message, summary="Delete a site and its observations")
def delete_site(site_id: uuid.UUID, db: DbSession, _admin: AdminUser) -> Message:
    site = get_site_or_404(db, site_id)
    name = site.name
    db.delete(site)
    db.commit()
    return Message(detail=f"Site '{name}' deleted")
