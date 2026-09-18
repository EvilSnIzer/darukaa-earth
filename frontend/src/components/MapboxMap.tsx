import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Polygon } from 'geojson';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { colourForProjectType, formatDecimal } from '../lib/format';
import { extractRings } from '../lib/projection';
import type { SiteFeature, SiteFeatureCollection, SiteGeometry } from '../types';

const DEFAULT_STYLE =
  import.meta.env.VITE_MAPBOX_STYLE ?? 'mapbox://styles/mapbox/satellite-streets-v12';
const DEFAULT_CENTER: [number, number] = [78.9, 26.5];
const DEFAULT_ZOOM = 4.4;

interface Props {
  token: string;
  features: SiteFeature[];
  selectedId?: string | null;
  onSelect?: (siteId: string) => void;
  drawing?: boolean;
  onDrawComplete?: (geometry: Polygon) => void;
  onDrawCancel?: () => void;
}

/**
 * Interactive Mapbox GL JS map.
 *
 * Sites are pushed into a single GeoJSON source and rendered with a data-driven
 * fill colour keyed on project type, so adding a site never requires adding a
 * layer. Drawing uses mapbox-gl-draw restricted to the polygon tool.
 */
export function MapboxMap({
  token,
  features,
  selectedId,
  onSelect,
  drawing = false,
  onDrawComplete,
  onDrawCancel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const [ready, setReady] = useState(false);

  const geojson = useMemo<SiteFeatureCollection>(
    () => ({ type: 'FeatureCollection', features }),
    [features],
  );

  // --- init -----------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: DEFAULT_STYLE,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      // `attributionControl` is typed as a boolean; the compact control is added
      // explicitly below so the attribution stays out of the way on small maps.
      attributionControl: false,
    });
    mapRef.current = map;

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
      defaultMode: 'simple_select',
      styles: [
        {
          id: 'draw-fill-active',
          type: 'fill',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'Polygon']],
          paint: { 'fill-color': '#2d8659', 'fill-opacity': 0.25 },
        },
        {
          id: 'draw-line-active',
          type: 'line',
          filter: ['all', ['==', 'active', 'true'], ['==', '$type', 'LineString']],
          paint: { 'line-color': '#1c6b4f', 'line-width': 2.5, 'line-dasharray': [2, 1] },
        },
        {
          id: 'draw-vertex',
          type: 'circle',
          filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
          paint: {
            'circle-radius': 5,
            'circle-color': '#ffffff',
            'circle-stroke-color': '#1c6b4f',
            'circle-stroke-width': 2,
          },
        },
      ],
    });
    map.addControl(draw, 'top-right');
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');
    drawRef.current = draw;

    map.on('load', () => {
      map.addSource('sites', { type: 'geojson', data: geojson });

      map.addLayer({
        id: 'sites-fill',
        type: 'fill',
        source: 'sites',
        paint: {
          'fill-color': [
            'match',
            ['get', 'project_type'],
            'reforestation',
            '#2d8659',
            'afforestation',
            '#3ba776',
            'mangrove_restoration',
            '#0f8b8d',
            'agroforestry',
            '#7cb342',
            'avoided_deforestation',
            '#c0392b',
            'biodiversity_conservation',
            '#8e44ad',
            'wetland_restoration',
            '#2980b9',
            '#64748b',
          ],
          'fill-opacity': ['case', ['==', ['get', 'site_id'], selectedId ?? ''], 0.75, 0.4],
        },
      });

      map.addLayer({
        id: 'sites-outline',
        type: 'line',
        source: 'sites',
        paint: {
          'line-color': '#0f3d2e',
          'line-width': ['case', ['==', ['get', 'site_id'], selectedId ?? ''], 3, 1.4],
          'line-opacity': 0.85,
        },
      });

      setReady(true);
    });

    // --- interactions -------------------------------------------------------
    map.on('click', 'sites-fill', (event) => {
      const feature = event.features?.[0];
      if (!feature?.properties) return;
      const siteId = String(feature.properties.site_id);
      onSelect?.(siteId);

      const props = feature.properties as Record<string, unknown>;
      const html = `
        <div class="popup-title">${escapeHtml(String(props.name ?? 'Site'))}</div>
        <div class="popup-meta">
          ${formatDecimal(Number(props.area_hectares ?? 0))} ha<br/>
          ${escapeHtml(String(props.project_name ?? ''))}
        </div>
        <a class="popup-link" href="/sites/${siteId}">View analytics →</a>`;

      new mapboxgl.Popup({ closeButton: true, maxWidth: '240px' })
        .setLngLat(event.lngLat)
        .setHTML(html)
        .addTo(map);
    });

    map.on('mouseenter', 'sites-fill', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'sites-fill', () => {
      map.getCanvas().style.cursor = '';
    });

    // Draw completion hands the raw GeoJSON geometry back to the parent form.
    map.on('draw.create', (event: { features: GeoJSON.Feature[] }) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const geometry = feature.geometry;
      draw.deleteAll();
      if (drawing && geometry.type === 'Polygon') {
        onDrawComplete?.({ type: 'Polygon', coordinates: geometry.coordinates } as Polygon);
      }
    });

    return () => {
      drawRef.current = null;
      mapRef.current = null;
      map.remove();
    };
    // The map is intentionally built once; data and selection flow through the
    // effects below so re-mounting (and losing the drawn state) is avoided.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // --- data updates ---------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource('sites') as mapboxgl.GeoJSONSource | undefined;
    source?.setData(geojson);
  }, [geojson, ready]);

  // --- selection highlight --------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (map.getLayer('sites-fill')) {
      map.setPaintProperty('sites-fill', 'fill-opacity', [
        'case',
        ['==', ['get', 'site_id'], selectedId ?? ''],
        0.75,
        0.4,
      ]);
    }
    if (map.getLayer('sites-outline')) {
      map.setPaintProperty('sites-outline', 'line-width', [
        'case',
        ['==', ['get', 'site_id'], selectedId ?? ''],
        3,
        1.4,
      ]);
    }
  }, [selectedId, ready]);

  // --- fit bounds when the site set changes --------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || features.length === 0) return;

    const bounds = new mapboxgl.LngLatBounds();
    let extended = false;
    for (const feature of features) {
      for (const ring of flattenCoordinates(feature.geometry)) {
        for (const point of ring) {
          if (Array.isArray(point) && point.length >= 2) {
            bounds.extend([point[0], point[1]]);
            extended = true;
          }
        }
      }
    }
    if (extended) {
      map.fitBounds(bounds, { padding: 70, maxZoom: 12, duration: 800 });
    }
  }, [features, ready]);

  // --- draw mode toggle -----------------------------------------------------
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    if (drawing) {
      draw.changeMode('draw_polygon');
    } else {
      draw.deleteAll();
      draw.changeMode('simple_select');
    }
  }, [drawing]);

  const cancelDrawing = useCallback(() => {
    drawRef.current?.deleteAll();
    onDrawCancel?.();
  }, [onDrawCancel]);

  return (
    <>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <div className="map-overlay">
        {drawing ? (
          <span>
            <strong>Drawing:</strong> click to place vertices, then click the first point to close
            the boundary.
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: 8 }}
              onClick={cancelDrawing}
            >
              Cancel
            </button>
          </span>
        ) : (
          <span>
            <strong>{features.length}</strong> site{features.length === 1 ? '' : 's'} · click a
            polygon for details
          </span>
        )}
      </div>
      <div className="map-legend">
        {uniqueProjectTypes(features).map((type) => (
          <div className="legend-row" key={type}>
            <span className="legend-swatch" style={{ background: colourForProjectType(type) }} />
            <span>{type.replace(/_/g, ' ')}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Normalise Polygon (3 levels) and MultiPolygon (4 levels) coordinate nesting. */
function flattenCoordinates(geometry: SiteGeometry): [number, number][][] {
  return extractRings(geometry);
}

function uniqueProjectTypes(features: SiteFeature[]): string[] {
  const seen = new Set<string>();
  for (const feature of features) {
    seen.add(feature.properties.project_type ?? 'other');
  }
  return [...seen].sort();
}
