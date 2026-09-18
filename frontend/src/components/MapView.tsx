import type { Polygon } from 'geojson';
import type { SiteFeature } from '../types';
import { MAPBOX_TOKEN, hasMapboxToken } from '../lib/mapConfig';
import { MapboxMap } from './MapboxMap';
import { SvgMap } from './SvgMap';

interface Props {
  features: SiteFeature[];
  selectedId?: string | null;
  onSelect?: (siteId: string) => void;
  drawing?: boolean;
  onDrawComplete?: (geometry: Polygon) => void;
  onDrawCancel?: () => void;
}

/**
 * Renders Mapbox when a token is configured, otherwise the built-in SVG projection.
 * Both accept identical props and emit identical geometry, so the create-site flow
 * is unaffected by which renderer is active.
 */
export function MapView(props: Props) {
  if (hasMapboxToken()) {
    return <MapboxMap token={MAPBOX_TOKEN} {...props} />;
  }
  return <SvgMap {...props} />;
}
