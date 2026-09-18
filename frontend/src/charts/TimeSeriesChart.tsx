import { Line } from 'react-chartjs-2';
import './chartSetup';
import { CHART_GRID, type TimeSeriesData } from '../lib/analytics';

interface Props {
  data: TimeSeriesData;
  height?: number;
  yTitle?: string;
}

export function TimeSeriesChart({ data, height = 290, yTitle }: Props) {
  if (data.datasets.length === 0) {
    return <p className="muted small">No time-series data recorded yet.</p>;
  }

  return (
    <div style={{ position: 'relative', height }}>
      <Line
        data={data}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { position: 'top', align: 'end' },
            tooltip: { mode: 'index', intersect: false },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
            },
            y: {
              grid: { color: CHART_GRID },
              beginAtZero: false,
              title: yTitle ? { display: true, text: yTitle } : undefined,
            },
          },
        }}
      />
    </div>
  );
}
