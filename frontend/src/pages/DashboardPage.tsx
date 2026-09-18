import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { analyticsApi, projectsApi } from '../api/endpoints';
import { PageHeader } from '../components/Layout';
import { StatCard } from '../components/StatCard';
import { StatusBadge, ProjectTypeBadge } from '../components/StatusBadge';
import { ErrorState, Loading } from '../components/Loading';
import { BarChart } from '../charts/BarChart';
import { DoughnutChart } from '../charts/DoughnutChart';
import { buildAreaByTypeData, CHART_COLOURS } from '../lib/analytics';
import { formatCompact, formatDecimal, formatNumber, colourForProjectType } from '../lib/format';

export function DashboardPage() {
  const summary = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => analyticsApi.dashboard(),
  });

  const projects = useQuery({
    queryKey: ['projects', 'dashboard'],
    queryFn: () => projectsApi.list({ limit: 50 }),
  });

  if (summary.isLoading || projects.isLoading) return <Loading label="Loading portfolio…" />;
  if (summary.isError) {
    return <ErrorState message={String(summary.error)} onRetry={() => summary.refetch()} />;
  }

  const data = summary.data;
  if (!data) return null;

  const doughnut = buildAreaByTypeData(data.area_by_project_type);
  const doughnutColours = Object.keys(data.area_by_project_type).map((type) =>
    colourForProjectType(type),
  );

  const carbonMonths = Object.keys(data.carbon_by_month).sort().slice(-18);
  const carbonChartData = {
    labels: carbonMonths,
    datasets: [
      {
        label: 'tCO2e',
        data: carbonMonths.map((month) => data.carbon_by_month[month]),
        backgroundColor: '#2d8659',
        borderRadius: 5,
        maxBarThickness: 34,
      },
    ],
  };

  const topProjects = (projects.data?.items ?? [])
    .slice()
    .sort((a, b) => b.total_carbon_tco2e - a.total_carbon_tco2e);

  return (
    <>
      <PageHeader
        title="Portfolio dashboard"
        subtitle="Carbon and biodiversity projects across the portfolio"
        actions={
          <Link to="/projects" className="btn">
            Manage projects
          </Link>
        }
      />

      <div className="content">
        <div className="kpi-grid">
          <StatCard
            label="Projects"
            value={formatNumber(data.project_count)}
            foot="active portfolios"
          />
          <StatCard
            label="Mapped sites"
            value={formatNumber(data.site_count)}
            foot="with drawn boundaries"
          />
          <StatCard
            label="Total area"
            value={`${formatCompact(data.total_area_hectares)} ha`}
            foot={`${formatNumber(data.total_area_hectares)} hectares`}
          />
          <StatCard
            label="Carbon sequestered"
            value={`${formatCompact(data.total_carbon_tco2e)} tCO2e`}
            foot="cumulative, all sites"
          />
          <StatCard
            label="Mean NDVI"
            value={data.average_ndvi === null ? '—' : formatDecimal(data.average_ndvi, 3)}
            foot="vegetation health, latest"
          />
          <StatCard
            label="Observations"
            value={formatNumber(data.observation_count)}
            foot="monthly measurements"
          />
        </div>

        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <h2>Monthly sequestration</h2>
              <span className="muted small">last {carbonMonths.length} months</span>
            </div>
            <BarChart data={carbonChartData} yTitle="tCO2e" />
          </div>

          <div className="card">
            <div className="card-header">
              <h2>Area by project type</h2>
              <span className="muted small">hectares</span>
            </div>
            <DoughnutChart
              labels={doughnut.labels}
              values={doughnut.datasets[0].data as number[]}
              colours={doughnutColours.length > 0 ? doughnutColours : CHART_COLOURS}
              centreValue={`${formatCompact(data.total_area_hectares)}`}
              centreLabel="hectares"
            />
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h2>Projects</h2>
            <Link to="/projects" className="small">
              View all →
            </Link>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="num">Sites</th>
                  <th className="num">Area (ha)</th>
                  <th className="num">Carbon (tCO2e)</th>
                </tr>
              </thead>
              <tbody>
                {topProjects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <Link to={`/projects/${project.id}`} style={{ fontWeight: 600 }}>
                        {project.name}
                      </Link>
                      <div className="muted small">{project.country}</div>
                    </td>
                    <td>
                      <ProjectTypeBadge type={project.project_type} />
                    </td>
                    <td>
                      <StatusBadge status={project.status} />
                    </td>
                    <td className="num">{project.site_count}</td>
                    <td className="num">{formatDecimal(project.total_area_hectares)}</td>
                    <td className="num">{formatNumber(project.total_carbon_tco2e)}</td>
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
