"""Minimal GeoJSON typing for request/response bodies."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class GeoJSONGeometry(BaseModel):
    """A GeoJSON geometry object as produced by Mapbox GL Draw / mapbox-gl-draw."""

    type: Literal["Point", "LineString", "Polygon", "MultiPolygon"]
    coordinates: Any


class Feature(BaseModel):
    type: Literal["Feature"] = "Feature"
    id: str | None = None
    geometry: GeoJSONGeometry
    properties: dict[str, Any] = Field(default_factory=dict)


class FeatureCollection(BaseModel):
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[Feature] = Field(default_factory=list)
