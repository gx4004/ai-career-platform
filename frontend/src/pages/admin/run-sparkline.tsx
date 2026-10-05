import type { DayCount } from './runs-by-day'

const W = 320
const H = 72
const PAD = 6

const dayLabel = (date: Date) => date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/** Runs per day as one ink line over a soft area, the last day marked. The numbers are in the accessible name and beside it. */
export function RunSparkline({ days }: { days: DayCount[] }) {
  const max = Math.max(1, ...days.map((day) => day.count))
  const step = days.length > 1 ? (W - PAD * 2) / (days.length - 1) : 0
  const points = days.map((day, index) => ({
    x: PAD + index * step,
    y: H - PAD - (day.count / max) * (H - PAD * 2),
  }))
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const area = points.length ? `${line} L${points.at(-1)!.x.toFixed(1)},${H - PAD} L${points[0].x.toFixed(1)},${H - PAD} Z` : ''
  const last = points.at(-1)
  const summary = days.map((day) => `${dayLabel(day.date)} ${day.count}`).join(', ')

  return (
    <svg
      className="admin-spark"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Runs per day, last ${days.length} days: ${summary}`}
      focusable="false"
    >
      <path className="admin-spark__area" d={area} />
      <path className="admin-spark__line" d={line} />
      {last ? <circle className="admin-spark__dot" cx={last.x} cy={last.y} r={5} /> : null}
    </svg>
  )
}

export { dayLabel }
