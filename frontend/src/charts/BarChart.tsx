import { Bar } from 'react-chartjs-2';
import './chartSetup';
import { CHART_GRID, type BarData } from '../lib/analytics';

interface Props {
  data: BarData;
  horizontal?: boolean;
  height?: number;
  yTitle?: string;
}

export function BarChart({ data, horizontal = false, height = 290, yTitle }: Props) {
  if (data.labels.length === 0) {
    return <p className="muted small">No data to chart.</p>;
  }

  return (
    <div style={{ position: 'relative', height }}>
      <Bar
        data={data}
        options={{
          indexAxis: horizontal ? 'y' : 'x',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: {
              grid: horizontal ? { color: CHART_GRID } : { display: false },
              title: horizontal && yTitle ? { display: true, text: yTitle } : undefined,
            },
            y: {
              grid: horizontal ? { display: false } : { color: CHART_GRID },
              beginAtZero: true,
              title: !horizontal && yTitle ? { display: true, text: yTitle } : undefined,
            },
          },
        }}
      />
    </div>
  );
}
