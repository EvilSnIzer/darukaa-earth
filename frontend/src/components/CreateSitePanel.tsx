import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sitesApi } from '../api/endpoints';
import { ApiRequestError } from '../api/client';
import { formatDecimal } from '../lib/format';
import type { Polygon } from 'geojson';
import type { Project } from '../types';

interface Props {
  projects: Project[];
  defaultProjectId?: string;
  drawnGeometry: Polygon | null;
  onStartDrawing: () => void;
  onCancelDrawing: () => void;
  drawing: boolean;
  onCreated: (siteId: string) => void;
}

/**
 * Right-hand panel for the "add a site" user story.
 *
 * The drawn polygon arrives from the map component; area is NOT shown here because
 * it is computed server-side by PostGIS on save, which keeps the number the user
 * sees identical to the stored value.
 */
export function CreateSitePanel({
  projects,
  defaultProjectId,
  drawnGeometry,
  onStartDrawing,
  onCancelDrawing,
  drawing,
  onCreated,
}: Props) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '');
  const [landCover, setLandCover] = useState('');
  const [plantingYear, setPlantingYear] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId && projects.length > 0) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const mutation = useMutation({
    // The geometry is passed in rather than read from state: a closure over the
    // nullable `drawnGeometry` cannot be narrowed by the guard in onSubmit.
    mutationFn: (geometry: Polygon) =>
      sitesApi.create({
        name,
        project_id: projectId,
        geometry,
        land_cover: landCover || undefined,
        planting_year: plantingYear ? Number(plantingYear) : undefined,
        description: description || undefined,
      }),
    onSuccess: (site) => {
      void queryClient.invalidateQueries({ queryKey: ['sites'] });
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setName('');
      setDescription('');
      setError(null);
      onCreated(site.id);
    },
    onError: (caught) => {
      setError(caught instanceof ApiRequestError ? caught.detail : 'Could not save the site.');
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!drawnGeometry) {
      setError('Draw the site boundary on the map first.');
      return;
    }
    setError(null);
    mutation.mutate(drawnGeometry);
  };

  const vertexCount = drawnGeometry ? (drawnGeometry.coordinates[0]?.length ?? 0) : 0;

  return (
    <div className="map-panel">
      <div className="map-panel-header">
        <h2>Add a site</h2>
        <p className="muted small" style={{ margin: '4px 0 0' }}>
          Draw the boundary, then give the site a name. Area is computed by PostGIS.
        </p>
      </div>

      <div className="map-panel-body">
        {error ? <div className="alert alert-error">{error}</div> : null}

        {drawnGeometry ? (
          <div className="alert alert-info">
            Boundary captured · {vertexCount} vertices
            <br />
            <span className="small">Area will be calculated on save.</span>
          </div>
        ) : (
          <div className="alert alert-warn small">
            No boundary yet. Use the polygon tool (top-right on Mapbox) or the drawing button below.
          </div>
        )}

        {!drawing ? (
          <button type="button" className="btn btn-block" onClick={onStartDrawing}>
            {drawnGeometry ? 'Redraw boundary' : 'Draw boundary'}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-block" onClick={onCancelDrawing}>
            Cancel drawing
          </button>
        )}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="site-name">Site name</label>
            <input
              id="site-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              placeholder="Wazirabad Floodplain Block B"
            />
          </div>

          <div className="field">
            <label htmlFor="site-project">Project</label>
            <select
              id="site-project"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              required
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="site-cover">Land cover</label>
              <input
                id="site-cover"
                value={landCover}
                onChange={(event) => setLandCover(event.target.value)}
                placeholder="Dry deciduous"
              />
            </div>
            <div className="field">
              <label htmlFor="site-year">Planting year</label>
              <input
                id="site-year"
                type="number"
                min={1900}
                max={2100}
                value={plantingYear}
                onChange={(event) => setPlantingYear(event.target.value)}
                placeholder="2024"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="site-description">Notes</label>
            <textarea
              id="site-description"
              rows={2}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Species mix, access constraints, partner farmer…"
            />
          </div>

          <button
            type="submit"
            className="btn btn-block"
            disabled={mutation.isPending || !drawnGeometry}
          >
            {mutation.isPending ? 'Saving…' : 'Save site'}
          </button>
          <p className="field-hint" style={{ textAlign: 'center', marginTop: 8 }}>
            Duplicate names within a project are rejected by the API.
          </p>
        </form>
      </div>
    </div>
  );
}

export function SiteListPanel({
  sites,
  selectedId,
  onSelect,
}: {
  sites: { id: string; name: string; area_hectares: number; observation_count: number }[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="site-list">
      {sites.map((site) => (
        <div
          key={site.id}
          className={`site-row ${site.id === selectedId ? 'selected' : ''}`}
          onClick={() => onSelect(site.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSelect(site.id);
          }}
        >
          <div>
            <div className="site-row-name">{site.name}</div>
            <div className="site-row-meta">
              {formatDecimal(site.area_hectares)} ha · {site.observation_count} observations
            </div>
          </div>
          <span className="muted small">→</span>
        </div>
      ))}
    </div>
  );
}
