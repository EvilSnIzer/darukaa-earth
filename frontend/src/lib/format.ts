/** Presentation helpers. Pure functions - covered by unit tests. */

const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return numberFormatter.format(value);
}

export function formatDecimal(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/** Compact units so KPI cards stay on one line: 148648.9 -> "148.6K". */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${decimalFormatter.format(value / 1_000_000)}M`;
  if (abs >= 1_000) return `${decimalFormatter.format(value / 1_000)}K`;
  return decimalFormatter.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${decimalFormatter.format(value)}%`;
}

export function formatArea(hectares: number | null | undefined): string {
  if (hectares === null || hectares === undefined || Number.isNaN(hectares)) return '—';
  return `${formatDecimal(hectares)} ha`;
}

/** "2024-03-01" -> "Mar 2024": the axis label granularity used across all charts. */
export function formatMonthLabel(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function formatDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * "carbon_sequestered_tco2e" -> "Carbon Sequestered tCO2e".
 *
 * The acronym substitutions must run AFTER the per-word capitalisation: that step
 * uppercases the first character of every word, which would otherwise turn the
 * intended "tCO2e" into "TCO2e".
 */
/**
 * "carbon_sequestered_tco2e" -> "Carbon Sequestered tCO2e".
 *
 * The acronym substitutions must run AFTER the per-word capitalisation: that step
 * uppercases the first character of every word, which would otherwise turn the
 * intended "tCO2e" into "TCO2e".
 */
export function humaniseKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\btco2e\b/gi, 'tCO2e')
    .replace(/\bndvi\b/gi, 'NDVI')
    .replace(/\bpct\b/gi, '%');
}

/** Colour per project type, so the map and the charts stay visually consistent. */
export const PROJECT_TYPE_COLOURS: Record<string, string> = {
  reforestation: '#2d8659',
  afforestation: '#3ba776',
  mangrove_restoration: '#0f8b8d',
  agroforestry: '#7cb342',
  avoided_deforestation: '#c0392b',
  biodiversity_conservation: '#8e44ad',
  wetland_restoration: '#2980b9',
};

export const DEFAULT_COLOUR = '#64748b';

export function colourForProjectType(projectType: string | undefined): string {
  if (!projectType) return DEFAULT_COLOUR;
  return PROJECT_TYPE_COLOURS[projectType] ?? DEFAULT_COLOUR;
}

export const METRIC_UNITS: Record<string, string> = {
  carbon_sequestered_tco2e: 'tCO2e',
  biomass_tonnes: 'tonnes',
  ndvi: 'NDVI',
  canopy_cover_pct: '%',
  tree_count: 'trees',
  biodiversity_index: 'index',
  species_observed: 'species',
};

export function unitFor(metric: string): string {
  return METRIC_UNITS[metric] ?? '';
}
