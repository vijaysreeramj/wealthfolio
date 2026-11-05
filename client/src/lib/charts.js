import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js'
import { inr, inrShort } from './format'

Chart.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, Filler)
Chart.defaults.font.family = getComputedStyle(document.documentElement).getPropertyValue('--font') || 'system-ui'
Chart.defaults.maintainAspectRatio = false

/** Common options for money charts, themed from CSS tokens. */
export function moneyChartOptions(colors, { stacked = false, legend = true } = {}) {
  return {
    responsive: true,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: legend, position: 'bottom', labels: { color: colors.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${inr(ctx.parsed.y ?? ctx.parsed)}` } },
    },
    scales: {
      x: { stacked, grid: { display: false }, ticks: { color: colors.text }, border: { color: colors.grid } },
      y: {
        stacked,
        grid: { color: colors.grid },
        border: { display: false },
        ticks: { color: colors.text, callback: (v) => inrShort(v) },
      },
    },
  }
}

export function doughnutOptions(colors) {
  return {
    responsive: true,
    cutout: '68%',
    plugins: {
      legend: { position: 'right', labels: { color: colors.text, boxWidth: 10, boxHeight: 10, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const total = ctx.dataset.data.reduce((a, b) => a + b, 0)
            return `${ctx.label}: ${inr(ctx.parsed)} (${total ? ((ctx.parsed / total) * 100).toFixed(1) : 0}%)`
          },
        },
      },
    },
    borderColor: colors.surface,
  }
}
