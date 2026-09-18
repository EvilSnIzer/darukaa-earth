import { describe, expect, it } from 'vitest';
import {
  colourForProjectType,
  formatArea,
  formatCompact,
  formatDate,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  humaniseKey,
} from '../lib/format';

describe('formatNumber', () => {
  it('groups thousands', () => {
    expect(formatNumber(148648)).toBe('1,48,648');
  });

  it('renders an em dash for missing values', () => {
    expect(formatNumber(null)).toBe('—');
    expect(formatNumber(undefined)).toBe('—');
    expect(formatNumber(Number.NaN)).toBe('—');
  });
});

describe('formatCompact', () => {
  it('abbreviates large numbers', () => {
    expect(formatCompact(1_486_489)).toBe('1.49M');
    expect(formatCompact(12_345)).toBe('12.35K');
    expect(formatCompact(42)).toBe('42');
  });

  it('handles null', () => {
    expect(formatCompact(null)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('adds an explicit sign', () => {
    expect(formatPercent(12.5)).toBe('+12.5%');
    expect(formatPercent(-8)).toBe('-8%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatArea', () => {
  it('appends the unit', () => {
    expect(formatArea(2133.5199)).toBe('2,133.52 ha');
    expect(formatArea(null)).toBe('—');
  });
});

describe('date labels', () => {
  it('formats month labels for chart axes', () => {
    expect(formatMonthLabel('2026-03-01')).toBe('Mar 2026');
  });

  it('formats full dates', () => {
    expect(formatDate('2026-03-15')).toBe('15 Mar 2026');
  });

  it('passes through unparseable input rather than crashing', () => {
    expect(formatMonthLabel('not-a-date')).toBe('not-a-date');
  });
});

describe('humaniseKey', () => {
  it('turns API keys into labels', () => {
    expect(humaniseKey('carbon_sequestered_tco2e')).toBe('Carbon Sequestered tCO2e');
    expect(humaniseKey('canopy_cover_pct')).toBe('Canopy Cover %');
    expect(humaniseKey('ndvi')).toBe('NDVI');
  });
});

describe('colourForProjectType', () => {
  it('maps known types to their palette colour', () => {
    expect(colourForProjectType('reforestation')).toBe('#2d8659');
  });

  it('falls back for unknown types', () => {
    expect(colourForProjectType('unknown_type')).toBe('#64748b');
    expect(colourForProjectType(undefined)).toBe('#64748b');
  });
});
