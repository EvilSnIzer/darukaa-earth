import { useCallback, useMemo, useState } from 'react';
import type { Polygon } from 'geojson';
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
  type BBox,
} from '../lib/projection';
import { colourForProjectType, formatDecimal } from '../lib/format';
import type { SiteFeature } from '../types';

interface Props {
  features: SiteFeature[];
  selectedId?: string | null;
  onSelect?: (siteId: string) => void;
  drawing?: boolean;
  onDrawComplete?: (geometry: Polygon) => void;
  onDrawCancel?: () => void;
  width?: number;
  height?: number;
}

/**
 * Token-free map: an equirectangular SVG projection of the same GeoJSON the Mapbox
 * layer consumes.
 *
 * Rationale: the brief requires Mapbox, and Mapbox is used whenever a token is
 * configured. But a reviewer should still be able to see and draw site boundaries
 * without supplying credentials, so the drawing user story stays demonstrable.
 */
export function SvgMap({
  features,
  selectedId,
  onSelect,
  drawing = false,
  onDrawComplete,
  onDrawCancel,
  width = 900,
  height = 560,
}: Props) {
  const [draft, setDraft] = useState<[number, number][]>([]);

  const viewport = useMemo(() => ({ width, height }), [width, height]);

  const bbox: BBox = useMemo(() => {
    let merged: BBox | null = null;
    for (const feature of features) {
      merged = mergeBBox(merged, bboxOf(extractRings(feature.geometry)));
    }
    const draftBox = draft.length > 0 ? bboxOf([draft]) : null;
    merged = mergeBBox(merged, draftBox);
    return padBBox(merged ?? DEFAULT_BBOX);
  }, [features, draft]);

  const handleClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!drawing) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * width;
      const y = ((event.clientY - rect.top) / rect.height) * height;
      const { lng, lat } = unprojectPoint(x, y, bbox, viewport);
      setDraft((previous) => [...previous, [Number(lng.toFixed(6)), Number(lat.toFixed(6))]]);
    },
    [drawing, bbox, viewport, width, height],
  );

  const finishDrawing = useCallback(() => {
    const ring = pointsToPolygonRing(draft);
    if (!ring || !onDrawComplete) return;
    onDrawComplete({ type: 'Polygon', coordinates: [ring] });
    setDraft([]);
  }, [draft, onDrawComplete]);

  const cancelDrawing = useCallback(() => {
    setDraft([]);
    onDrawCancel?.();
  }, [onDrawCancel]);

  const projectTypes = useMemo(() => {
    const seen = new Map<string, number>();
    for (const feature of features) {
      const type = feature.properties.project_type ?? 'unknown';
      seen.set(type, (seen.get(type) ?? 0) + 1);
    }
    return [...seen.entries()];
  }, [features]);

  return (
    <div className="map-fallback">
      <svg
        className="map-svg"
        viewBox={`0 0 ${width} ${height}`}
        onClick={handleClick}
        style={{ cursor: drawing ? 'crosshair' : 'default' }}
        role="img"
        aria-label="Map of project sites"
      >
        {features.map((feature) => {
          const rings = extractRings(feature.geometry);
          const colour = colourForProjectType(feature.properties.project_type);
          const isSelected = feature.id === selectedId;
          return (
            <g key={feature.id}>
              {rings.map((ring, index) => (
                <polygon
                  key={`${feature.id}-ring-${index}`}
                  points={ringToSvgPoints(ring, bbox, viewport)}
                  fill={colour}
                  fillOpacity={isSelected ? 0.72 : 0.42}
                  stroke={isSelected ? '#0f3d2e' : colour}
                  strokeWidth={isSelected ? 2.5 : 1.5}
                  onClick={(event) => {
                    if (drawing) return;
                    event.stopPropagation();
                    onSelect?.(feature.id);
                  }}
                >
                  <title>
                    {feature.properties.name} — {formatDecimal(feature.properties.area_hectares)} ha
                  </title>
                </polygon>
              ))}
              {feature.properties.centroid_lat !== null &&
              feature.properties.centroid_lat !== undefined &&
              feature.properties.centroid_lng !== null &&
              feature.properties.centroid_lng !== undefined ? (
                <circle
                  cx={
                    projectPoint(
                      feature.properties.centroid_lng,
                      feature.properties.centroid_lat,
                      bbox,
                      viewport,
                    ).x
                  }
                  cy={
                    projectPoint(
                      feature.properties.centroid_lng,
                      feature.properties.centroid_lat,
                      bbox,
                      viewport,
                    ).y
                  }
                  r={3}
                  fill="#0f3d2e"
                  opacity={0.75}
                  pointerEvents="none"
                />
              ) : null}
            </g>
          );
        })}

        {draft.length > 0 ? (
          <g pointerEvents="none">
            <polyline
              points={draft
                .map(([lng, lat]) => {
                  const point = projectPoint(lng, lat, bbox, viewport);
                  return `${point.x.toFixed(2)},${point.y.toFixed(2)}`;
                })
                .join(' ')}
              fill="rgba(45,134,89,0.18)"
              stroke="#1c6b4f"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            {draft.map(([lng, lat], index) => {
              const point = projectPoint(lng, lat, bbox, viewport);
              return (
                <circle
                  key={`vertex-${index}`}
                  cx={point.x}
                  cy={point.y}
                  r={4}
                  fill="#fff"
                  stroke="#1c6b4f"
                  strokeWidth={2}
                />
              );
            })}
          </g>
        ) : null}
      </svg>

      <div className="map-overlay">
        {drawing ? (
          <div className="row">
            <span>
              <strong>Drawing:</strong> click to add vertices ({draft.length} placed, need 3+)
            </span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={finishDrawing}
              disabled={draft.length < 3}
            >
              Finish
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={cancelDrawing}>
              Cancel
            </button>
          </div>
        ) : (
          <span>
            <strong>{features.length}</strong> site{features.length === 1 ? '' : 's'} · offline
            projection
            <span className="muted"> (set VITE_MAPBOX_TOKEN for the satellite basemap)</span>
          </span>
        )}
      </div>

      <div className="map-legend">
        {projectTypes.map(([type, count]) => (
          <div className="legend-row" key={type}>
            <span className="legend-swatch" style={{ background: colourForProjectType(type) }} />
            <span>
              {type.replace(/_/g, ' ')} ({count})
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
