import { colourForProjectType } from '../lib/format';
import type { ProjectStatus, ProjectType } from '../types';

const STATUS_CLASS: Record<ProjectStatus, string> = {
  active: 'badge-green',
  planning: 'badge-blue',
  paused: 'badge-amber',
  completed: 'badge',
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`badge ${STATUS_CLASS[status] ?? 'badge'}`}>{status}</span>;
}

export function ProjectTypeBadge({ type }: { type: ProjectType | string }) {
  return (
    <span className="badge">
      <span className="badge-swatch" style={{ background: colourForProjectType(type) }} />
      {type.replace(/_/g, ' ')}
    </span>
  );
}
