import { Doughnut } from 'react-chartjs-2';
import './chartSetup';

interface Props {
  labels: string[];
  values: number[];
  colours: string[];
  height?: number;
  centreLabel?: string;
  centreValue?: string;
}

export function DoughnutChart({
  labels,
  values,
  colours,
  height = 230,
  centreLabel,
  centreValue,
}: Props) {
  if (values.length === 0) {
    return <p className="muted small">No data to chart.</p>;
  }

  return (
    <div style={{ position: 'relative', height, display: 'grid', placeItems: 'center' }}>
      <Doughnut
        data={{
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colours,
              borderWidth: 2,
              borderColor: '#fff',
              hoverOffset: 8,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          plugins: { legend: { position: 'right' } },
        }}
      />
      {centreValue ? (
        <div
          style={{
            position: 'absolute',
            textAlign: 'center',
            pointerEvents: 'none',
            left: '34%',
            transform: 'translateX(-50%)',
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 680 }}>{centreValue}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {centreLabel}
          </div>
        </div>
      ) : null}
    </div>
  );
}
