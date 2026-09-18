"""Aggregate router for API v1."""

from fastapi import APIRouter

from app.api.v1 import analytics, auth, health, observations, projects, sites

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(projects.router)
api_router.include_router(sites.router)
api_router.include_router(observations.router)
api_router.include_router(analytics.router)
