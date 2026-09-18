/** API contracts. These mirror the Pydantic response models in backend/app/schemas. */

import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export type UserRole = 'admin' | 'viewer';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export type ProjectType =
  | 'reforestation'
  | 'afforestation'
  | 'mangrove_restoration'
  | 'agroforestry'
  | 'avoided_deforestation'
  | 'biodiversity_conservation'
  | 'wetland_restoration';

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed';

export interface Project {
  id: string;
  name: string;
  description: string | null;
  project_type: ProjectType;
  status: ProjectStatus;
  country: string;
  methodology: string | null;
  baseline_year: number | null;
  owner_id: string;
  site_count: number;
  total_area_hectares: number;
  total_carbon_tco2e: number;
  created_at: string;
  updated_at: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
}

/**
 * Site geometries are always polygonal: the API stores them as PostGIS MULTIPOLYGON
 * and promotes drawn Polygons on write. Using the canonical `geojson` package types
 * (rather than a hand-rolled shape) is what lets these values be handed straight to
 * Mapbox GL JS and to `geojson` utility functions without casts.
 */
export type SiteGeometry = Polygon | MultiPolygon;

/** Backwards-compatible alias used by the create-site payload. */
export type GeoJSONGeometry = SiteGeometry;

export interface Site {
  id: string;
  name: string;
  description: string | null;
  land_cover: string | null;
  planting_year: number | null;
  project_id: string;
  area_hectares: number;
  centroid_lat: number | null;
  centroid_lng: number | null;
  observation_count: number;
  created_at: string;
  updated_at: string;
}

export interface SiteDetail extends Site {
  geometry: GeoJSONGeometry;
  project_name: string | null;
}

export interface SiteFeatureProperties {
  site_id: string;
  name: string;
  area_hectares: number;
  centroid_lat?: number | null;
  centroid_lng?: number | null;
  land_cover?: string | null;
  project_id: string;
  project_name: string;
  project_type?: string;
}

export type SiteFeature = Feature<SiteGeometry, SiteFeatureProperties> & { id: string };

/**
 * A FeatureCollection whose features are guaranteed to carry a string `id`.
 * Declared explicitly rather than as `FeatureCollection<...>` because the GeoJSON
 * spec types `id` as optional; our API always sets it, and the map relies on it.
 */
export interface SiteFeatureCollection extends Omit<
  FeatureCollection<SiteGeometry, SiteFeatureProperties>,
  'features'
> {
  features: SiteFeature[];
}

export interface MetricSummary {
  metric: string;
  unit: string;
  latest: number | null;
  earliest: number | null;
  min: number | null;
  max: number | null;
  mean: number | null;
  total: number | null;
  change_pct: number | null;
  trend_per_year: number | null;
}

export interface Series {
  label: string;
  dates: string[];
  values: (number | null)[];
}

export interface SiteAnalytics {
  site_id: string;
  site_name: string;
  project_name: string;
  area_hectares: number;
  observation_count: number;
  date_range: [string, string] | null;
  summaries: MetricSummary[];
  series: Series[];
  carbon_by_year: Record<string, number>;
}

export interface SiteContribution {
  site_id: string;
  site_name: string;
  area_hectares: number;
  carbon_tco2e: number;
  canopy_cover_pct: number | null;
  ndvi: number | null;
  biodiversity_index: number | null;
  centroid_lat: number | null;
  centroid_lng: number | null;
}

export interface ProjectAnalytics {
  project_id: string;
  project_name: string;
  project_type: string;
  status: string;
  site_count: number;
  total_area_hectares: number;
  total_carbon_tco2e: number;
  average_ndvi: number | null;
  average_canopy_cover_pct: number | null;
  average_biodiversity_index: number | null;
  contributions: SiteContribution[];
  carbon_by_year: Record<string, number>;
  series: Series[];
}

export interface DashboardSummary {
  project_count: number;
  site_count: number;
  observation_count: number;
  total_area_hectares: number;
  total_carbon_tco2e: number;
  average_ndvi: number | null;
  area_by_project_type: Record<string, number>;
  carbon_by_month: Record<string, number>;
}

export interface ApiError {
  detail: string;
}
