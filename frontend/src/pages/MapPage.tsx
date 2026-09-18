import { useMemo, useState } from 'react';
import type { Polygon } from 'geojson';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { projectsApi, sitesApi } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { PageHeader } from '../components/Layout';
import { MapView } from '../components/MapView';
import { CreateSitePanel, SiteListPanel } from '../components/CreateSitePanel';
import { ErrorState, Loading } from '../components/Loading';
import { formatDecimal } from '../lib/format';

/**
 * "View all projects and sites on an interactive map" plus
 * "add new sites by drawing polygons".
 */
export function MapPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [mode, setMode] = useState<'browse' | 'create'>('browse');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawnGeometry, setDrawnGeometry] = useState<Polygon | null>(null);

  const projects = useQuery({
    queryKey: ['projects', 'map'],
    queryFn: () => projectsApi.list({ limit: 100 }),
  });
  const geojson = useQuery({
    queryKey: ['sites', 'geojson'],
    queryFn: () => sitesApi.mapGeoJSON(),
  });
  const sites = useQuery({ queryKey: ['sites', 'all'], queryFn: () => sitesApi.list() });

  const features = useMemo(() => geojson.data?.features ?? [], [geojson.data]);
  const selectedSite = useMemo(
    () => (sites.data ?? []).find((site) => site.id === selectedId),
    [sites.data, selectedId],
  );

  if (projects.isLoading || geojson.isLoading) return <Loading label="Loading map data…" />;
  if (geojson.isError)
    return <ErrorState message={String(geojson.error)} onRetry={() => geojson.refetch()} />;

  return (
    <>
      <PageHeader
        title="Site map"
        subtitle={`${features.length} mapped site${features.length === 1 ? '' : 's'}`}
        actions={
          <>
            <div className="tabs" style={{ borderBottom: 'none', marginBottom: 0 }}>
              <button
                type="button"
                className={`tab ${mode === 'browse' ? 'active' : ''}`}
                onClick={() => {
                  setMode('browse');
                  setDrawnGeometry(null);
                }}
              >
                Browse
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  className={`tab ${mode === 'create' ? 'active' : ''}`}
                  onClick={() => setMode('create')}
                >
                  Add site
                </button>
              ) : null}
            </div>
          </>
        }
      />

      <div className="content-flush">
        <div className="map-layout">
          <div className="map-container">
            <MapView
              features={features}
              selectedId={selectedId}
              onSelect={setSelectedId}
              drawing={mode === 'create'}
              onDrawComplete={(geometry) => {
                setDrawnGeometry(geometry);
              }}
              onDrawCancel={() => setDrawnGeometry(null)}
            />
          </div>

          {mode === 'create' && isAdmin ? (
            <CreateSitePanel
              projects={projects.data?.items ?? []}
              drawnGeometry={drawnGeometry}
              drawing={mode === 'create' && drawnGeometry === null}
              onStartDrawing={() => setDrawnGeometry(null)}
              onCancelDrawing={() => setDrawnGeometry(null)}
              onCreated={(siteId) => {
                setDrawnGeometry(null);
                setMode('browse');
                navigate(`/sites/${siteId}`);
              }}
            />
          ) : (
            <div className="map-panel">
              <div className="map-panel-header">
                <h2>{selectedSite ? selectedSite.name : 'All sites'}</h2>
                {selectedSite ? (
                  <p className="muted small" style={{ margin: '4px 0 0' }}>
                    {formatDecimal(selectedSite.area_hectares)} ha ·{' '}
                    {selectedSite.observation_count} observations
                  </p>
                ) : (
                  <p className="muted small" style={{ margin: '4px 0 0' }}>
                    Click a polygon, or pick a site below.
                  </p>
                )}
              </div>

              <div className="map-panel-body">
                {selectedSite ? (
                  <Link to={`/sites/${selectedSite.id}`} className="btn btn-block">
                    View site analytics
                  </Link>
                ) : null}

                <SiteListPanel
                  sites={sites.data ?? []}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
