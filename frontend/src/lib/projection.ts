/**
 * Minimal equirectangular projection for the no-token SVG map fallback.
 *
 * Pure functions so they are unit-testable and free of DOM/SVG coupling.
 */

import type { MultiPolygon, Polygon } from 'geojson';

export type ProjectedGeometry = Polygon | MultiPolygon;

export interface BBox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

export const DEFAULT_BBOX: BBox = { minLng: 68, minLat: 6, maxLng: 97, maxLat: 36 }; // India

/** Extract every ring from a Polygon or MultiPolygon GeoJSON geometry. */
export function extractRings(geometry: ProjectedGeometry): [number, number][][] {
  if (geometry.type === 'Polygon') return geometry.coordinates as [number, number][][];
  return (geometry.coordinates as [number, number][][][]).flat();
}

export function bboxOf(rings: [number, number][][]): BBox | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  let seen = 0;

  for (const ring of rings) {
    for (const point of ring) {
      if (!Array.isArray(point) || point.length < 2) continue;
      const [lng, lat] = point;
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      seen += 1;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }

  return seen === 0 ? null : { minLng, minLat, maxLng, maxLat };
}

export function mergeBBox(a: BBox | null, b: BBox | null): BBox | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minLng: Math.min(a.minLng, b.minLng),
    minLat: Math.min(a.minLat, b.minLat),
    maxLng: Math.max(a.maxLng, b.maxLng),
    maxLat: Math.max(a.maxLat, b.maxLat),
  };
}

/** Pad a bbox by a fraction of its span so polygons are not flush to the edges. */
export function padBBox(bbox: BBox, fraction = 0.15): BBox {
  const lngSpan = Math.max(bbox.maxLng - bbox.minLng, 1e-6);
  const latSpan = Math.max(bbox.maxLat - bbox.minLat, 1e-6);
  return {
    minLng: bbox.minLng - lngSpan * fraction,
    minLat: bbox.minLat - latSpan * fraction,
    maxLng: bbox.maxLng + lngSpan * fraction,
    maxLat: bbox.maxLat + latSpan * fraction,
  };
}

export interface Viewport {
  width: number;
  height: number;
}

/**
 * Project a lon/lat point into SVG pixel space.
 *
 * Latitude is flipped because SVG y grows downwards while latitude grows upwards.
 * Longitude span is scaled by cos(mid-latitude) so shapes keep plausible proportions
 * away from the equator - a plain linear mapping stretches India noticeably.
 */
export function projectPoint(
  lng: number,
  lat: number,
  bbox: BBox,
  viewport: Viewport,
): { x: number; y: number } {
  const midLat = ((bbox.minLat + bbox.maxLat) / 2) * (Math.PI / 180);
  const cosLat = Math.max(Math.cos(midLat), 0.1);

  const lngSpan = Math.max(bbox.maxLng - bbox.minLng, 1e-9);
  const latSpan = Math.max(bbox.maxLat - bbox.minLat, 1e-9);

  // Available world units, with longitude compressed by cos(lat).
  const worldWidth = lngSpan * cosLat;
  const worldHeight = latSpan;
  const scale = Math.min(viewport.width / worldWidth, viewport.height / worldHeight);

  const originX = (viewport.width - worldWidth * scale) / 2;
  const originY = (viewport.height - worldHeight * scale) / 2;

  return {
    x: originX + (lng - bbox.minLng) * cosLat * scale,
    y: originY + (bbox.maxLat - lat) * scale,
  };
}

/** Inverse of projectPoint, used to convert SVG clicks back into lon/lat. */
export function unprojectPoint(
  x: number,
  y: number,
  bbox: BBox,
  viewport: Viewport,
): { lng: number; lat: number } {
  const midLat = ((bbox.minLat + bbox.maxLat) / 2) * (Math.PI / 180);
  const cosLat = Math.max(Math.cos(midLat), 0.1);

  const lngSpan = Math.max(bbox.maxLng - bbox.minLng, 1e-9);
  const latSpan = Math.max(bbox.maxLat - bbox.minLat, 1e-9);

  const worldWidth = lngSpan * cosLat;
  const worldHeight = latSpan;
  const scale = Math.min(viewport.width / worldWidth, viewport.height / worldHeight);

  const originX = (viewport.width - worldWidth * scale) / 2;
  const originY = (viewport.height - worldHeight * scale) / 2;

  return {
    lng: bbox.minLng + (x - originX) / (cosLat * scale),
    lat: bbox.maxLat - (y - originY) / scale,
  };
}

export function ringToSvgPoints(ring: [number, number][], bbox: BBox, viewport: Viewport): string {
  return ring
    .map(([lng, lat]) => {
      const { x, y } = projectPoint(lng, lat, bbox, viewport);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

/** Build a closed, valid GeoJSON Polygon ring from raw click points. */
export function pointsToPolygonRing(points: [number, number][]): [number, number][] | null {
  if (points.length < 3) return null;
  const first = points[0];
  const last = points[points.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1] ? points : [...points, first];
  return closed as [number, number][];
}
