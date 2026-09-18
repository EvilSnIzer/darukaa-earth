import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { analyticsApi, sitesApi } from '../api/endpoints';
import { PageHeader } from '../components/Layout';
import { StatCard } from '../components/StatCard';
import { ErrorState, Loading } from '../components/Loading';
import { BarChart } from '../charts/BarChart';
import { TimeSeriesChart } from '../charts/TimeSeriesChart';
import {
  buildCarbonByYearData,
  buildCumulativeSeries,
  buildTimeSeriesData,
  coveragePercent,
  findSeries,
} from '../lib/analytics';
import {
  formatCompact,
  formatDate,
  formatDecimal,
  formatNumber,
  formatPercent,
  humaniseKey,
  unitFor,
} from '../lib/format';
import type { MetricSummary } from '../types';

export function SiteDetailPage() {
  const { siteId = '' } = useParams();

  const site = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => sitesApi.get(siteId),
    enabled: Boolean(siteId),
  });

  const analytics = useQuery({
    queryKey: ['site-analytics', siteId],
    queryFn: () => analyticsApi.site(siteId),
    enabled: Boolean(siteId),
  });

  if (site.isLoading || analytics.isLoading) return <Loading label="Loading site…" />;
  if (site.isError || analytics.isError) {
    return (
      <ErrorState
        message={String(site.error ?? analytics.error)}
        onRetry={() => {
          void site.refetch();
          void analytics.refetch();
        }}
      />
    );
  }

  const data = analytics.data;
  const meta = site.data;
  if (!data || !meta) return null;

  const carbonSeries = findSeries(data.series, 'carbon_sequestered_tco2e');
  const cumulative = buildCumulativeSeries(carbonSeries);
  const carbonChart = buildTimeSeriesData(
    carbonSeries ? [{ ...carbonSeries, label: 'carbon_sequestered_tco2e' }] : [],
    ['carbon_sequestered_tco2e'],
  );
  const cumulativeChart = buildTimeSeriesData(
    cumulative ? [{ ...cumulative, label: 'carbon_sequestered_tco2e' }] : [],
    ['carbon_sequestered_tco2e'],
  );
  const healthChart = buildTimeSeriesData(data.series, [
    'ndvi',
    'canopy_cover_pct',
    'biodiversity_index',
  ]);
  const byYear = buildCarbonByYearData(data.carbon_by_year);
  const coverage = coveragePercent(data);

  return (
    <>
      <PageHeader
        title={data.site_name}
        subtitle={
          data.project_name ? (
            <>
              Part of{' '}
              <Link to={`/projects/${meta.project_id}`} style={{ fontWeight: 600 }}>
                {data.project_name}
              </Link>
              {data.date_range
                ? ` · ${formatDate(data.date_range[0])} to ${formatDate(data.date_range[1])}`
                : ''}
            </>
          ) : undefined
        }
        actions={
          <Link to="/map" className="btn btn-secondary">
            View on map
          </Link>
        }
      />

      <div className="content">
        <div className="kpi-grid">
          <StatCard
            label="Area"
            value={`${formatDecimal(meta.area_hectares)} ha`}
            foot="geodesic, computed by PostGIS"
          />
          <StatCard
            label="Observations"
            value={formatNumber(data.observation_count)}
            foot={`${coverage}% data coverage`}
          />
          <StatCard
            label="Total carbon"
            value={`${formatCompact(totalCarbon(data.summaries))} tCO2e`}
            foot="cumulative sequestration"
          />
          <StatCard
            label="Latest canopy cover"
            value={`${formatDecimal(valueFor(data.summaries, 'canopy_cover_pct')?.latest ?? null, 1)}%`}
            delta={valueFor(data.summaries, 'canopy_cover_pct')?.change_pct ?? null}
            foot="since first measurement"
          />
          <StatCard
            label="Latest NDVI"
            value={formatDecimal(valueFor(data.summaries, 'ndvi')?.latest ?? null, 3)}
            delta={valueFor(data.summaries, 'ndvi')?.change_pct ?? null}
            foot="vegetation health"
          />
          <StatCard
            label="Biodiversity index"
            value={formatDecimal(valueFor(data.summaries, 'biodiversity_index')?.latest ?? null, 3)}
            delta={valueFor(data.summaries, 'biodiversity_index')?.change_pct ?? null}
            foot="latest measurement"
          />
        </div>

        {meta.land_cover || meta.planting_year ? (
          <div className="row" style={{ marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
            {meta.land_cover ? <span className="badge">{meta.land_cover}</span> : null}
            {meta.planting_year ? (
              <span className="badge">planted {meta.planting_year}</span>
            ) : null}
            {meta.description ? <span className="muted small">{meta.description}</span> : null}
          </div>
        ) : null}

        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <h2>Monthly sequestration</h2>
              <span className="muted small">tCO2e per measurement</span>
            </div>
            <TimeSeriesChart data={carbonChart} yTitle="tCO2e" />
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Cumulative sequestration</h2>
              <span className="muted small">running total</span>
            </div>
            <TimeSeriesChart data={cumulativeChart} yTitle="cumulative tCO2e" />
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="card-header">
              <h2>Vegetation &amp; biodiversity</h2>
              <span className="muted small">monthly</span>
            </div>
            <TimeSeriesChart data={healthChart} />
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Annual accumulation</h2>
              <span className="muted small">tCO2e by year</span>
            </div>
            <BarChart data={byYear} yTitle="tCO2e" />
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h2>Metric summary</h2>
            <span className="muted small">across {data.observation_count} observations</span>
          </div>
          <div className="metric-grid">
            {data.summaries.map((summary) => (
              <div className="metric-tile" key={summary.metric}>
                <div className="metric-tile-label">{humaniseKey(summary.metric)}</div>
                <div className="metric-tile-value">
                  {formatDecimal(summary.latest, summary.metric === 'tree_count' ? 0 : 2)}
                  <span className="muted small"> {summary.unit || unitFor(summary.metric)}</span>
                </div>
                <div className="muted small" style={{ marginTop: 4 }}>
                  mean {formatDecimal(summary.mean, 2)} · range {formatDecimal(summary.min, 2)}–
                  {formatDecimal(summary.max, 2)}
                </div>
                {summary.trend_per_year !== null ? (
                  <div
                    className={`small ${summary.trend_per_year >= 0 ? 'delta-up' : 'delta-down'}`}
                  >
                    trend {formatPercent(summary.trend_per_year * 100).replace('%', '')} /yr
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function valueFor(summaries: MetricSummary[], metric: string): MetricSummary | undefined {
  return summaries.find((entry) => entry.metric === metric);
}

function totalCarbon(summaries: MetricSummary[]): number {
  return valueFor(summaries, 'carbon_sequestered_tco2e')?.total ?? 0;
}
