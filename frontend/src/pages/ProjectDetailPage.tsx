import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { analyticsApi, projectsApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/Layout';
import { StatCard } from '../components/StatCard';
import { StatusBadge, ProjectTypeBadge } from '../components/StatusBadge';
import { ErrorState, Loading } from '../components/Loading';
import { BarChart } from '../charts/BarChart';
import { TimeSeriesChart } from '../charts/TimeSeriesChart';
import {
  buildCarbonByYearData,
  buildContributionData,
  buildTimeSeriesData,
} from '../lib/analytics';
import { formatCompact, formatDecimal, formatNumber } from '../lib/format';
import type { Series } from '../types';

export function ProjectDetailPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const project = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectsApi.get(projectId),
    enabled: Boolean(projectId),
  });

  const analytics = useQuery({
    queryKey: ['project-analytics', projectId],
    queryFn: () => analyticsApi.project(projectId),
    enabled: Boolean(projectId),
  });

  if (project.isLoading || analytics.isLoading) return <Loading label="Loading project…" />;
  if (project.isError || analytics.isError) {
    return (
      <ErrorState
        message={String(project.error ?? analytics.error)}
        onRetry={() => {
          void project.refetch();
          void analytics.refetch();
        }}
      />
    );
  }

  const data = analytics.data;
  const meta = project.data;
  if (!data || !meta) return null;

  const carbonSeries = buildTimeSeriesData(data.series, ['carbon_sequestered_tco2e']);
  const healthSeries = buildTimeSeriesData(data.series, [
    'ndvi',
    'canopy_cover_pct',
    'biodiversity_index',
  ]);
  const byYear = buildCarbonByYearData(data.carbon_by_year);
  const contributions = buildContributionData(data);

  const latestCanopy = latestOf(data.series, 'canopy_cover_pct');
  const earliestCanopy = earliestOf(data.series, 'canopy_cover_pct');
  const canopyDelta =
    latestCanopy !== null && earliestCanopy !== null && earliestCanopy !== 0
      ? ((latestCanopy - earliestCanopy) / Math.abs(earliestCanopy)) * 100
      : null;

  return (
    <>
      <PageHeader
        title={meta.name}
        subtitle={`${meta.country}${meta.methodology ? ` · ${meta.methodology}` : ''}${
          meta.baseline_year ? ` · baseline ${meta.baseline_year}` : ''
        }`}
        actions={
          <>
            <Link to="/map" className="btn btn-secondary">
              View on map
            </Link>
            {isAdmin ? (
              <button type="button" className="btn" onClick={() => navigate('/map')}>
                Add site
              </button>
            ) : null}
          </>
        }
      />

      <div className="content">
        <div className="row" style={{ marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
          <ProjectTypeBadge type={meta.project_type} />
          <StatusBadge status={meta.status} />
          {meta.description ? <span className="muted small">{meta.description}</span> : null}
        </div>

        <div className="kpi-grid">
          <StatCard label="Sites" value={formatNumber(data.site_count)} foot="mapped parcels" />
          <StatCard
            label="Total area"
            value={`${formatCompact(data.total_area_hectares)} ha`}
            foot={`${formatDecimal(data.total_area_hectares)} hectares`}
          />
          <StatCard
            label="Carbon sequestered"
            value={`${formatCompact(data.total_carbon_tco2e)} tCO2e`}
            foot="cumulative across sites"
          />
          <StatCard
            label="Mean canopy cover"
            value={
              data.average_canopy_cover_pct === null
                ? '—'
                : `${formatDecimal(data.average_canopy_cover_pct, 1)}%`
            }
            delta={canopyDelta}
            foot="since first measurement"
          />
          <StatCard
            label="Mean NDVI"
            value={data.average_ndvi === null ? '—' : formatDecimal(data.average_ndvi, 3)}
            foot="vegetation health"
          />
          <StatCard
            label="Biodiversity index"
            value={
              data.average_biodiversity_index === null
                ? '—'
                : formatDecimal(data.average_biodiversity_index, 3)
            }
            foot="mean across sites"
          />
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <h2>Carbon sequestration over time</h2>
              <span className="muted small">monthly, all sites</span>
            </div>
            <TimeSeriesChart data={carbonSeries} yTitle="tCO2e per month" />
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Annual accumulation</h2>
              <span className="muted small">tCO2e by year</span>
            </div>
            <BarChart data={byYear} yTitle="tCO2e" />
          </div>
        </div>

        <div className="grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <div className="card-header">
              <h2>Vegetation &amp; biodiversity</h2>
              <span className="muted small">project averages</span>
            </div>
            <TimeSeriesChart data={healthSeries} />
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Contribution by site</h2>
              <span className="muted small">cumulative tCO2e</span>
            </div>
            <BarChart data={contributions} horizontal yTitle="tCO2e" />
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h2>Sites</h2>
            <span className="muted small">{data.contributions.length} parcels</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Site</th>
                  <th className="num">Area (ha)</th>
                  <th className="num">Carbon (tCO2e)</th>
                  <th className="num">Canopy %</th>
                  <th className="num">NDVI</th>
                  <th className="num">Biodiversity</th>
                </tr>
              </thead>
              <tbody>
                {data.contributions.map((site) => (
                  <tr key={site.site_id}>
                    <td>
                      <Link to={`/sites/${site.site_id}`} style={{ fontWeight: 600 }}>
                        {site.site_name}
                      </Link>
                    </td>
                    <td className="num">{formatDecimal(site.area_hectares)}</td>
                    <td className="num">{formatNumber(site.carbon_tco2e)}</td>
                    <td className="num">
                      {site.canopy_cover_pct === null
                        ? '—'
                        : formatDecimal(site.canopy_cover_pct, 1)}
                    </td>
                    <td className="num">
                      {site.ndvi === null ? '—' : formatDecimal(site.ndvi, 3)}
                    </td>
                    <td className="num">
                      {site.biodiversity_index === null
                        ? '—'
                        : formatDecimal(site.biodiversity_index, 3)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function latestOf(series: Series[], metric: string): number | null {
  const found = series.find((entry) => entry.label === metric);
  if (!found) return null;
  for (let index = found.values.length - 1; index >= 0; index -= 1) {
    const value = found.values[index];
    if (value !== null && value !== undefined) return value;
  }
  return null;
}

function earliestOf(series: Series[], metric: string): number | null {
  const found = series.find((entry) => entry.label === metric);
  if (!found) return null;
  for (const value of found.values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
}
