/**
 * Lightweight hand-rolled SVG line chart — ports the shape of the native
 * app's DriverTrendChartView/DriverSparklineView (points-per-round line with
 * win/podium markers sized up) without pulling in a charting library.
 */
export interface TrendPoint {
  label: string
  value: number
  isWin?: boolean
  isPodium?: boolean
}

interface TrendChartProps {
  points: TrendPoint[]
  height?: number
  color?: string
  showAxis?: boolean
}

export function TrendChart({ points, height = 160, color = 'var(--color-accent)', showAxis = true }: TrendChartProps) {
  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height, color: 'var(--color-text-muted)' }}
      >
        Not enough races yet for a trend line.
      </div>
    )
  }

  const width = 100
  const padding = 6
  const values = points.map((p) => p.value)
  const min = Math.min(...values, 0)
  const max = Math.max(...values, 1)
  const range = max - min || 1

  const coords = points.map((p, i) => ({
    x: padding + (i / (points.length - 1)) * (width - padding * 2),
    y: height - padding - ((p.value - min) / range) * (height - padding * 2),
    point: p,
  }))

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {coords.map((c, i) => (
        <circle
          key={i}
          cx={c.x}
          cy={c.y}
          r={c.point.isWin ? 3 : c.point.isPodium ? 2.2 : 1.3}
          fill={c.point.isWin ? '#eab308' : color}
        />
      ))}
      {showAxis && (
        <text x={padding} y={height - 1} fontSize={4} fill="var(--color-text-muted)">
          {points[0].label}
        </text>
      )}
      {showAxis && (
        <text x={width - padding} y={height - 1} fontSize={4} fill="var(--color-text-muted)" textAnchor="end">
          {points[points.length - 1].label}
        </text>
      )}
    </svg>
  )
}
