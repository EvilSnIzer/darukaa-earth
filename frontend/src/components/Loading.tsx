export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="fullscreen-center">
      <div className="spinner" />
      <p className="muted">{label}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card">
      <div className="alert alert-error">{message}</div>
      {onRetry ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card empty-state">
      <h3>{title}</h3>
      {body ? <p className="muted">{body}</p> : null}
      {action ? <div style={{ marginTop: 14 }}>{action}</div> : null}
    </div>
  );
}
