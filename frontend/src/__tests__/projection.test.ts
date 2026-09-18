import { describe, expect, it } from 'vitest';
import type { MultiPolygon, Polygon } from 'geojson';
import {
  DEFAULT_BBOX,
  bboxOf,
  extractRings,
  mergeBBox,
  padBBox,
  pointsToPolygonRing,
  projectPoint,
  ringToSvgPoints,
  unprojectPoint,
} from '../lib/projection';

const SQUARE: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [77.2, 28.6],
      [77.3, 28.6],
      [77.3, 28.7],
      [77.2, 28.7],
      [77.2, 28.6],
    ],
  ],
};

const SQUARE_MULTI: MultiPolygon = {
  type: 'MultiPolygon',
  coordinates: [SQUARE.coordinates],
};

describe('extractRings', () => {
  it('returns the rings of a Polygon', () => {
    const rings = extractRings(SQUARE);
    expect(rings).toHaveLength(1);
    expect(rings[0]).toHaveLength(5);
  });

  it('flattens a MultiPolygon into its rings', () => {
    expect(extractRings(SQUARE_MULTI)).toHaveLength(1);
  });

  it('flattens every part of a multi-part geometry', () => {
    const multi: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [SQUARE.coordinates, SQUARE.coordinates],
    };
    expect(extractRings(multi)).toHaveLength(2);
  });
});

describe('bboxOf', () => {
  it('computes the bounding box', () => {
    expect(bboxOf(extractRings(SQUARE))).toEqual({
      minLng: 77.2,
      minLat: 28.6,
      maxLng: 77.3,
      maxLat: 28.7,
    });
  });

  it('returns null when there are no usable points', () => {
    expect(bboxOf([])).toBeNull();
  });
});

describe('mergeBBox / padBBox', () => {
  it('merges two boxes into their union', () => {
    const merged = mergeBBox(
      { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 },
      { minLng: -1, minLat: -1, maxLng: 0.5, maxLat: 0.5 },
    );
    expect(merged).toEqual({ minLng: -1, minLat: -1, maxLng: 1, maxLat: 1 });
  });

  it('treats null as identity', () => {
    const box = { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 };
    expect(mergeBBox(null, box)).toEqual(box);
    expect(mergeBBox(box, null)).toEqual(box);
  });

  it('expands the box outward when padded', () => {
    const padded = padBBox({ minLng: 10, minLat: 20, maxLng: 20, maxLat: 30 }, 0.1);
    expect(padded.minLng).toBeCloseTo(9);
    expect(padded.maxLng).toBeCloseTo(21);
    expect(padded.minLat).toBeCloseTo(19);
    expect(padded.maxLat).toBeCloseTo(31);
  });
});

describe('projectPoint / unprojectPoint', () => {
  const viewport = { width: 800, height: 600 };
  const bbox = { minLng: 77, minLat: 28, maxLng: 78, maxLat: 29 };

  it('places the north-west corner above the south-east corner', () => {
    const northWest = projectPoint(77, 29, bbox, viewport);
    const southEast = projectPoint(78, 28, bbox, viewport);
    expect(northWest.y).toBeLessThan(southEast.y);
    expect(northWest.x).toBeLessThan(southEast.x);
  });

  it('round-trips a point through the inverse projection', () => {
    const original = { lng: 77.42, lat: 28.63 };
    const pixel = projectPoint(original.lng, original.lat, bbox, viewport);
    const back = unprojectPoint(pixel.x, pixel.y, bbox, viewport);
    expect(back.lng).toBeCloseTo(original.lng, 6);
    expect(back.lat).toBeCloseTo(original.lat, 6);
  });

  it('keeps coordinates inside the viewport', () => {
    const point = projectPoint(77.5, 28.5, bbox, viewport);
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(viewport.width);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(viewport.height);
  });
});

describe('ringToSvgPoints', () => {
  it('produces an SVG points string', () => {
    const points = ringToSvgPoints(
      [
        [77.2, 28.6],
        [77.3, 28.7],
      ],
      DEFAULT_BBOX,
      { width: 900, height: 560 },
    );
    expect(points.split(' ')).toHaveLength(2);
    expect(points).toMatch(/^-?[\d.]+,-?[\d.]+ -?[\d.]+,-?[\d.]+$/);
  });
});

describe('pointsToPolygonRing', () => {
  it('rejects fewer than three points', () => {
    expect(
      pointsToPolygonRing([
        [0, 0],
        [1, 1],
      ]),
    ).toBeNull();
  });

  it('closes an open ring', () => {
    const ring = pointsToPolygonRing([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(ring).not.toBeNull();
    expect(ring).toHaveLength(4);
    expect(ring?.[0]).toEqual(ring?.[3]);
  });

  it('does not duplicate an already-closed ring', () => {
    const ring = pointsToPolygonRing([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ]);
    expect(ring).toHaveLength(4);
  });
});
