/**
 * Pure transforms from API payloads to chart-ready datasets.
 *
 * Kept free of React and Chart.js imports so the logic is directly unit-testable:
 * these functions encode the product decisions (which metrics to chart, how to
 * downsample, how to label axes) and deserve their own tests.
 */

import type { ChartDataset } from 'chart.js';
import type { ProjectAnalytics, Series, SiteAnalytics } from '../types';
import { formatMonthLabel, humaniseKey } from './format';

export const CHART_COLOURS = [
  '#2d8659',
  '#0f8b8d',
  '#e08a1e',
  '#8e44ad',
  '#2980b9',
  '#c0392b',
  '#7cb342',
];

export const CHART_BORDER = 'rgba(226, 232, 240, 1)';
export const CHART_GRID = 'rgba(226, 232, 240, 0.6)';

/** Metrics worth charting over time; KPI-only metrics are shown as cards instead. */
export const CHARTABLE_METRICS = [
  'carbon_sequestered_tco2e',
  'ndvi',
  'canopy_cover_pct',
  'biodiversity_index',
] as const;

export type ChartableMetric = (typeof CHARTABLE_METRICS)[number];

export function isChartable(metric: string): metric is ChartableMetric {
  return (CHARTABLE_METRICS as readonly string[]).includes(metric);
}

export function findSeries(series: Series[], metric: string): Series | undefined {
  return series.find((entry) => entry.label === metric);
}

export interface TimeSeriesData {
  labels: string[];
  datasets: ChartDataset<'line'>[];
}

/**
 * Build a Chart.js line dataset from one or more series.
 *
 * Nulls are preserved (not zero-filled): a gap in satellite coverage must render as
 * a gap, not as a fake zero measurement.
 */
export function buildTimeSeriesData(
  series: Series[],
  metrics: readonly string[] = CHARTABLE_METRICS,
): TimeSeriesData {
  const selected = series.filter((entry) => metrics.includes(entry.label));
  if (selected.length === 0) return { labels: [], datasets: [] };

  // Longest series wins for the x-axis; shorter ones align by index.
  const longest = selected.reduce((best, entry) =>
    entry.dates.length > best.dates.length ? entry : best,
  );

  const datasets = selected.map((entry, index) => {
    const colour = CHART_COLOURS[index % CHART_COLOURS.length];
    return {
      label: humaniseKey(entry.label),
      data: entry.values as (number | null)[],
      borderColor: colour,
      backgroundColor: `${colour}22`,
      borderWidth: 2,
      pointRadius: entry.values.length > 60 ? 0 : 2.5,
      pointHoverRadius: 5,
      tension: 0.3,
      spanGaps: true,
      fill: index === 0,
    } satisfies ChartDataset<'line'>;
  });

  return {
    labels: longest.dates.map(formatMonthLabel),
    datasets,
  };
}

export interface BarData {
  labels: string[];
  datasets: ChartDataset<'bar'>[];
}

/** Year-over-year carbon accumulation, from the API's carbon_by_year map. */
export function buildCarbonByYearData(carbonByYear: Record<string, number>): BarData {
  const years = Object.keys(carbonByYear).sort();
  return {
    labels: years,
    datasets: [
      {
        label: 'Carbon sequestered (tCO2e)',
        data: years.map((year) => carbonByYear[year]),
        backgroundColor: '#2d8659',
        hoverBackgroundColor: '#236b47',
        borderRadius: 6,
        maxBarThickness: 64,
      },
    ],
  };
}

/** Horizontal bar of per-site contribution, sorted by the API (largest first). */
export function buildContributionData(analytics: ProjectAnalytics): BarData {
  return {
    labels: analytics.contributions.map((entry) => entry.site_name),
    datasets: [
      {
        label: 'tCO2e',
        data: analytics.contributions.map((entry) => entry.carbon_tco2e),
        backgroundColor: CHART_COLOURS.map((colour) => `${colour}cc`),
        borderRadius: 6,
        maxBarThickness: 40,
      },
    ],
  };
}

/** Area share by project type, from the dashboard summary. */
export function buildAreaByTypeData(areaByType: Record<string, number>): {
  labels: string[];
  datasets: ChartDataset<'doughnut'>[];
} {
  const labels = Object.keys(areaByType);
  return {
    labels: labels.map(humaniseKey),
    datasets: [
      {
        data: labels.map((label) => areaByType[label]),
        backgroundColor: labels.map((_, index) => CHART_COLOURS[index % CHART_COLOURS.length]),
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverOffset: 8,
      },
    ],
  };
}

/** Cumulative sequestration: running total across the observation window. */
export function buildCumulativeSeries(series: Series | undefined): Series | undefined {
  if (!series) return undefined;
  let running = 0;
  return {
    label: series.label,
    dates: series.dates,
    values: series.values.map((value) => {
      if (value === null) return null;
      running += value;
      return Number(running.toFixed(4));
    }),
  };
}

/** Percentage of the observation window that has data, for a coverage indicator. */
export function coveragePercent(analytics: SiteAnalytics): number {
  if (analytics.observation_count === 0) return 0;
  const carbon = findSeries(analytics.series, 'carbon_sequestered_tco2e');
  const expected = carbon?.values.length ?? analytics.observation_count;
  if (expected === 0) return 0;
  const present = (carbon?.values ?? []).filter((value) => value !== null).length;
  return Math.round((present / expected) * 100);
}

/**
 * Pick the headline metric for a project type.
 *
 * Biodiversity projects lead with the biodiversity index; carbon projects lead with
 * sequestration. This is a product decision, not a data one.
 */
export function headlineMetricFor(projectType: string): string {
  return projectType === 'biodiversity_conservation'
    ? 'biodiversity_index'
    : 'carbon_sequestered_tco2e';
}
