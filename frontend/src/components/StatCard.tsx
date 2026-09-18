interface StatCardProps {
  label: string;
  value: string;
  foot?: string;
  delta?: number | null;
  deltaSuffix?: string;
}

/** KPI card. `delta` renders green when positive, red when negative. */
export function StatCard({ label, value, foot, delta, deltaSuffix = '' }: StatCardProps) {
  const showDelta = delta !== null && delta !== undefined;
  const direction = showDelta && delta >= 0 ? 'delta-up' : 'delta-down';

  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-foot">
        {showDelta ? (
          <span className={direction}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%{deltaSuffix}
          </span>
        ) : null}
        {showDelta && foot ? ' · ' : null}
        {foot}
      </div>
    </div>
  );
}
