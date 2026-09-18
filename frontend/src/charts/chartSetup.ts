/**
 * Chart.js registration, done once.
 *
 * We register only the controllers and scales we actually use. Registering
 * everything (ChartJS.register(...registerables)) would add roughly 100KB of
 * unused chart types to the bundle for a dashboard that only draws lines, bars
 * and one doughnut.
 */
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  DoughnutController,
  ArcElement,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(
  LineController,
  LineElement,
  PointElement,
  BarController,
  BarElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Filler,
  Tooltip,
  Legend,
);

export const BASE_FONT_FAMILY =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

ChartJS.defaults.font.family = BASE_FONT_FAMILY;
ChartJS.defaults.color = '#64748b';
ChartJS.defaults.plugins.legend.labels.usePointStyle = true;
ChartJS.defaults.plugins.legend.labels.boxWidth = 8;
ChartJS.defaults.plugins.legend.labels.padding = 14;

export { ChartJS };
