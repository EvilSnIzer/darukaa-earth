import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../api/endpoints';
import { ApiRequestError } from '../api/client';
import type { ProjectStatus, ProjectType } from '../types';

const PROJECT_TYPES: ProjectType[] = [
  'reforestation',
  'afforestation',
  'mangrove_restoration',
  'agroforestry',
  'avoided_deforestation',
  'biodiversity_conservation',
  'wetland_restoration',
];

const STATUSES: ProjectStatus[] = ['planning', 'active', 'paused', 'completed'];

export function CreateProjectModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>('reforestation');
  const [status, setStatus] = useState<ProjectStatus>('planning');
  const [country, setCountry] = useState('India');
  const [methodology, setMethodology] = useState('');
  const [baselineYear, setBaselineYear] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      projectsApi.create({
        name,
        description: description || null,
        project_type: projectType,
        status,
        country,
        methodology: methodology || null,
        baseline_year: baselineYear ? Number(baselineYear) : null,
      }),
    onSuccess: (project) => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      window.location.assign(`/projects/${project.id}`);
    },
    onError: (caught) => {
      setError(caught instanceof ApiRequestError ? caught.detail : 'Could not create the project.');
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    mutation.mutate();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.45)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 50,
        padding: 20,
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="card"
        style={{ width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Create project"
      >
        <div className="card-header">
          <h2>New project</h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? <div className="alert alert-error">{error}</div> : null}

        <form onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="project-name">Project name</label>
            <input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
              placeholder="Yamuna Riparian Restoration"
            />
          </div>

          <div className="field">
            <label htmlFor="project-description">Description</label>
            <textarea
              id="project-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="What does this project restore or protect?"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="project-type">Project type</label>
              <select
                id="project-type"
                value={projectType}
                onChange={(event) => setProjectType(event.target.value as ProjectType)}
              >
                {PROJECT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="project-status">Status</label>
              <select
                id="project-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as ProjectStatus)}
              >
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label htmlFor="project-country">Country</label>
              <input
                id="project-country"
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="project-baseline">Baseline year</label>
              <input
                id="project-baseline"
                type="number"
                min={1900}
                max={2100}
                value={baselineYear}
                onChange={(event) => setBaselineYear(event.target.value)}
                placeholder="2021"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="project-methodology">Methodology</label>
            <input
              id="project-methodology"
              value={methodology}
              onChange={(event) => setMethodology(event.target.value)}
              placeholder="VCS VM0047 (ARR)"
            />
            <span className="field-hint">
              Carbon or biodiversity standard this project is verified against.
            </span>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn" disabled={mutation.isPending}>
              {mutation.isPending ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
