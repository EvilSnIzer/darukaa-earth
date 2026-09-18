import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/Layout';
import { StatusBadge, ProjectTypeBadge } from '../components/StatusBadge';
import { EmptyState, ErrorState, Loading } from '../components/Loading';
import { CreateProjectModal } from '../components/CreateProjectModal';
import { formatCompact, formatDecimal, formatNumber } from '../lib/format';

export function ProjectsPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);

  const projects = useQuery({
    queryKey: ['projects', search],
    queryFn: () => projectsApi.list({ search: search || undefined, limit: 100 }),
  });

  const items = useMemo(() => projects.data?.items ?? [], [projects.data]);

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={`${projects.data?.total ?? 0} project${projects.data?.total === 1 ? '' : 's'}`}
        actions={
          <>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search projects…"
              style={{
                padding: '8px 12px',
                border: '1px solid var(--ink-300)',
                borderRadius: 8,
                minWidth: 220,
              }}
              aria-label="Search projects"
            />
            {isAdmin ? (
              <button type="button" className="btn" onClick={() => setCreating(true)}>
                + New project
              </button>
            ) : null}
          </>
        }
      />

      <div className="content">
        {projects.isLoading ? <Loading label="Loading projects…" /> : null}
        {projects.isError ? (
          <ErrorState message={String(projects.error)} onRetry={() => projects.refetch()} />
        ) : null}

        {projects.isSuccess && items.length === 0 ? (
          <EmptyState
            title="No projects yet"
            body="Create your first carbon or biodiversity project, then draw its sites on the map."
            action={
              isAdmin ? (
                <button type="button" className="btn" onClick={() => setCreating(true)}>
                  + New project
                </button>
              ) : null
            }
          />
        ) : null}

        {items.length > 0 ? (
          <div className="project-grid">
            {items.map((project) => (
              <article
                key={project.id}
                className="card project-card"
                onClick={() => navigate(`/projects/${project.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') navigate(`/projects/${project.id}`);
                }}
              >
                <div className="row-between">
                  <ProjectTypeBadge type={project.project_type} />
                  <StatusBadge status={project.status} />
                </div>

                <div>
                  <h3>{project.name}</h3>
                  <p
                    className="muted small"
                    style={{
                      margin: '6px 0 0',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {project.description ?? 'No description provided.'}
                  </p>
                </div>

                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span className="badge">{project.country}</span>
                  {project.methodology ? (
                    <span className="badge">{project.methodology}</span>
                  ) : null}
                </div>

                <div className="project-stats">
                  <div>
                    <div className="project-stat-label">Sites</div>
                    <div className="project-stat-value">{project.site_count}</div>
                  </div>
                  <div>
                    <div className="project-stat-label">Area</div>
                    <div className="project-stat-value">
                      {formatCompact(project.total_area_hectares)} ha
                    </div>
                  </div>
                  <div>
                    <div className="project-stat-label">Carbon</div>
                    <div className="project-stat-value">
                      {formatCompact(project.total_carbon_tco2e)}
                    </div>
                  </div>
                </div>

                <div className="muted small">
                  {formatDecimal(project.total_area_hectares)} ha total ·{' '}
                  {formatNumber(project.total_carbon_tco2e)} tCO2e
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>

      {creating ? <CreateProjectModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}
