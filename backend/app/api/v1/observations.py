"""Observation endpoints: append measurements and read a site's history."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.api.v1.sites import get_site_or_404
from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models.observation import Observation
from app.schemas.common import Message
from app.schemas.observation import ObservationCreate, ObservationRead

router = APIRouter(prefix="/observations", tags=["observations"])


@router.get(
    "/site/{site_id}",
    response_model=list[ObservationRead],
    summary="Full measurement history for a site",
)
def list_observations(
    site_id: uuid.UUID,
    db: DbSession,
    _user: CurrentUser,
    limit: int = Query(500, ge=1, le=2000),
) -> list[ObservationRead]:
    get_site_or_404(db, site_id)
    rows = (
        db.execute(
            select(Observation)
            .where(Observation.site_id == site_id)
            .order_by(Observation.measured_on.desc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    return [ObservationRead.model_validate(row) for row in rows]


@router.post(
    "",
    response_model=ObservationRead,
    status_code=status.HTTP_201_CREATED,
    summary="Record a measurement for a site",
)
def create_observation(
    payload: ObservationCreate, db: DbSession, _admin: AdminUser
) -> ObservationRead:
    get_site_or_404(db, payload.site_id)
    existing = db.execute(
        select(Observation.id).where(
            Observation.site_id == payload.site_id,
            Observation.measured_on == payload.measured_on,
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An observation already exists for this site and date",
        )
    observation = Observation(**payload.model_dump())
    db.add(observation)
    db.commit()
    db.refresh(observation)
    return ObservationRead.model_validate(observation)


@router.delete(
    "/{observation_id}",
    response_model=Message,
    summary="Delete an observation",
)
def delete_observation(observation_id: uuid.UUID, db: DbSession, _admin: AdminUser) -> Message:
    observation = db.get(Observation, observation_id)
    if observation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Observation not found")
    db.delete(observation)
    db.commit()
    return Message(detail="Observation deleted")
