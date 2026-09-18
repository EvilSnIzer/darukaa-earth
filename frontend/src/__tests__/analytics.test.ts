import { describe, expect, it } from 'vitest';
import {
  buildCarbonByYearData,
  buildCumulativeSeries,
  buildTimeSeriesData,
  coveragePercent,
  findSeries,
  headlineMetricFor,
  isChartable,
} from '../lib/analytics';
import type { Series, SiteAnalytics } from '../types';

const carbon: Series = {
  label: 'carbon_sequestered_tco2e',
  dates: ['2026-01-01', '2026-02-01', '2026-03-01'],
  values: [10, 20, null],
};

const ndvi: Series = {
  label: 'ndvi',
  dates: ['2026-01-01', '2026-02-01', '2026-03-01'],
  values: [0.4, 0.45, 0.5],
};

describe('isChartable', () => {
  it('accepts the metrics we chart', () => {
    expect(isChartable('carbon_sequestered_tco2e')).toBe(true);
    expect(isChartable('ndvi')).toBe(true);
  });

  it('rejects KPI-only metrics', () => {
    expect(isChartable('species_observed')).toBe(false);
    expect(isChartable('tree_count')).toBe(false);
  });
});

describe('findSeries', () => {
  it('finds by label', () => {
    expect(findSeries([carbon, ndvi], 'ndvi')).toBe(ndvi);
    expect(findSeries([carbon, ndvi], 'biomass_tonnes')).toBeUndefined();
  });
});

describe('buildTimeSeriesData', () => {
  it('builds labels and one dataset per selected series', () => {
    const result = buildTimeSeriesData([carbon, ndvi], ['carbon_sequestered_tco2e', 'ndvi']);
    expect(result.labels).toEqual(['Jan 2026', 'Feb 2026', 'Mar 2026']);
    expect(result.datasets).toHaveLength(2);
  });

  it('preserves nulls instead of zero-filling gaps', () => {
    const result = buildTimeSeriesData([carbon], ['carbon_sequestered_tco2e']);
    expect(result.datasets[0].data).toEqual([10, 20, null]);
  });

  it('returns empty data when nothing matches', () => {
    const result = buildTimeSeriesData([ndvi], ['tree_count']);
    expect(result.labels).toEqual([]);
    expect(result.datasets).toEqual([]);
  });

  it('hides points on dense series to keep the chart readable', () => {
    const dense: Series = {
      label: 'ndvi',
      dates: Array.from(
        { length: 80 },
        (_, index) => `2026-01-${String(index + 1).padStart(2, '0')}`,
      ),
      values: Array.from({ length: 80 }, () => 0.5),
    };
    const result = buildTimeSeriesData([dense], ['ndvi']);
    expect(result.datasets[0].pointRadius).toBe(0);
  });
});

describe('buildCarbonByYearData', () => {
  it('sorts years ascending', () => {
    const result = buildCarbonByYearData({ '2025': 100, '2023': 50, '2024': 75 });
    expect(result.labels).toEqual(['2023', '2024', '2025']);
    expect(result.datasets[0].data).toEqual([50, 75, 100]);
  });

  it('handles an empty map', () => {
    expect(buildCarbonByYearData({}).labels).toEqual([]);
  });
});

describe('buildCumulativeSeries', () => {
  it('accumulates values across the window', () => {
    const cumulative = buildCumulativeSeries(carbon);
    expect(cumulative?.values).toEqual([10, 30, null]);
  });

  it('returns undefined for a missing series', () => {
    expect(buildCumulativeSeries(undefined)).toBeUndefined();
  });
});

describe('coveragePercent', () => {
  const analytics = {
    observation_count: 3,
    series: [carbon],
  } as unknown as SiteAnalytics;

  it('counts only non-null values', () => {
    // 2 of 3 carbon values present => 67%
    expect(coveragePercent(analytics)).toBe(67);
  });

  it('returns 0 when there are no observations', () => {
    expect(coveragePercent({ observation_count: 0, series: [] } as unknown as SiteAnalytics)).toBe(
      0,
    );
  });
});

describe('headlineMetricFor', () => {
  it('leads with biodiversity for conservation projects', () => {
    expect(headlineMetricFor('biodiversity_conservation')).toBe('biodiversity_index');
  });

  it('leads with carbon otherwise', () => {
    expect(headlineMetricFor('reforestation')).toBe('carbon_sequestered_tco2e');
    expect(headlineMetricFor('mangrove_restoration')).toBe('carbon_sequestered_tco2e');
  });
});
