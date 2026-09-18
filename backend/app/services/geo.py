"""Geospatial helpers: GeoJSON <-> PostGIS conversion, validation and metrics.

All area/centroid maths is delegated to PostGIS rather than Shapely so that the
numbers the API returns are computed by the same engine that stores the geometry
(and therefore match any SQL aggregation done in analytics.py).
"""

from __future__ import annotations

import json
from typing import Any

from shapely import wkt
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.validation import explain_validity
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.site import SITE_GEOMETRY_TYPE, SITE_SRID

# A site must be at least ~100 m across; this rejects accidental single-click polygons.
MIN_AREA_HECTARES = 0.001
MAX_VERTICES = 5000


class GeometryError(ValueError):
    """Raised when an incoming GeoJSON geometry cannot be stored as a site."""


def _to_shapely(geometry: dict[str, Any]):
    """Parse a GeoJSON geometry dict into a Shapely geometry."""
    try:
        geom = shape(geometry)
    except Exception as exc:
        raise GeometryError(f"Malformed GeoJSON geometry: {exc}") from exc
    return geom


def normalise_to_multipolygon(geometry: dict[str, Any]):
    """Validate a GeoJSON geometry and promote Polygons to MultiPolygons.

    Accepts Polygon and MultiPolygon (what Mapbox GL Draw emits for the polygon
    tool). Points and lines are rejected with an actionable message.
    """
    geom_type = geometry.get("type")
    if geom_type not in {"Polygon", "MultiPolygon"}:
        raise GeometryError(
            f"Sites must be polygons, received '{geom_type}'. "
            "Use the polygon draw tool to outline the site boundary."
        )

    geom = _to_shapely(geometry)

    if not geom.is_valid:
        # Attempt a repair (self-intersections from hand-drawn polygons are common).
        from shapely.validation import make_valid

        geom = make_valid(geom)
        if geom.is_empty:
            raise GeometryError(f"Geometry could not be repaired: {explain_validity(geom)}")

    if geom.geom_type == "Polygon":
        geom = MultiPolygon([geom])
    elif geom.geom_type in {"GeometryCollection", "MultiPolygon"}:
        polygons = [
            g for g in getattr(geom, "geoms", [geom]) if isinstance(g, (Polygon, MultiPolygon))
        ]
        if not polygons:
            raise GeometryError("Geometry contains no polygon parts.")
        geom = MultiPolygon(
            [
                p
                for part in polygons
                for p in (part.geoms if isinstance(part, MultiPolygon) else [part])
            ]
        )
    else:
        raise GeometryError(f"Unsupported geometry type after repair: '{geom.geom_type}'.")

    if geom.is_empty:
        raise GeometryError("Geometry is empty.")

    vertex_count = sum(len(part.exterior.coords) for part in geom.geoms)
    if vertex_count > MAX_VERTICES:
        raise GeometryError(
            f"Geometry has {vertex_count} vertices; simplify it to under {MAX_VERTICES}."
        )

    return geom


def geojson_to_wkt(geometry: dict[str, Any]) -> str:
    """Convert and validate an incoming GeoJSON geometry, returning WKT for PostGIS."""
    geom = normalise_to_multipolygon(geometry)
    return geom.wkt


def wkt_to_geojson(wkt_text: str) -> dict[str, Any]:
    """Convert a WKT string returned by PostGIS into a GeoJSON geometry dict."""
    return mapping(wkt.loads(wkt_text))


def geometry_to_geojson(geometry: Any) -> dict[str, Any]:
    """Convert a GeoAlchemy2 element (WKB/WKBELEMENT) into a GeoJSON dict."""
    if geometry is None:
        raise GeometryError("Site has no geometry.")
    # GeoAlchemy2 elements are bytes-like WKB; ST_AsGeoJSON in SQL avoids this path
    # for bulk reads, but we still support it for single-object fetches.
    if isinstance(geometry, (bytes, bytearray, memoryview)):
        from shapely import wkb as shapely_wkb

        return mapping(shapely_wkb.loads(bytes(geometry)))
    return mapping(shape_from_element(geometry))


def shape_from_element(element: Any):
    """Load a GeoAlchemy2 WKBELEMENT via PostGIS-free Shapely decoding."""
    from geoalchemy2.shape import to_shape

    return to_shape(element)


def compute_site_metrics(db: Session, wkt_text: str) -> tuple[float, float, float]:
    """Return (area_hectares, centroid_lat, centroid_lng) computed by PostGIS.

    Uses the `geography` type so area is a true geodesic measurement in square
    metres (converted to hectares) instead of a planar degree-squared value.

    The SRID is interpolated from the SITE_SRID module constant rather than bound:
    PostgreSQL requires type modifiers such as `geometry(Point, 4326)` to be literal
    constants, so they cannot be supplied as query parameters.
    """
    sql = f"""
        SELECT
            -- ST_Area(geography) returns double precision, and PostgreSQL has no
            -- round(double precision, int) overload - the numeric cast is required.
            ROUND((ST_Area(geog) / 10000.0)::numeric, 4)          AS area_ha,
            ST_Y(ST_Centroid(geom)::geometry(Point, {SITE_SRID})) AS lat,
            ST_X(ST_Centroid(geom)::geometry(Point, {SITE_SRID})) AS lng
        FROM (
            SELECT
                ST_GeomFromText(:wkt, {SITE_SRID}) AS geom,
                ST_GeographyFromText(:wkt)         AS geog
        ) AS src
    """
    row = db.execute(text(sql), {"wkt": wkt_text}).one()
    return float(row.area_ha), float(row.lat), float(row.lng)


def site_to_feature(
    *,
    site_id: str,
    name: str,
    geometry: dict[str, Any],
    properties: dict[str, Any],
) -> dict[str, Any]:
    """Build a GeoJSON Feature ready for the map layer."""
    return {
        "type": "Feature",
        "id": site_id,
        "geometry": geometry,
        "properties": {"site_id": site_id, "name": name, **properties},
    }


def geometry_wkb_is_empty(geometry: Any) -> bool:
    """True when a stored geometry is missing (defensive, used by seed repairs)."""
    return geometry is None


def dump_geometry(geometry: dict[str, Any]) -> str:
    """Serialise a geometry dict compactly for logging."""
    return json.dumps(geometry, separators=(",", ":"), default=str)


def declared_geometry_type() -> str:
    """Expose the DB column's geometry type for API docs / health checks."""
    return f"{SITE_GEOMETRY_TYPE}, SRID {SITE_SRID}"
