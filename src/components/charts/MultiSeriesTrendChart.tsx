/**
 * Multi-line SVG chart for comparing several drivers' cumulative points
 * across rounds — richer than the native app's single-snapshot standings
 * view, showing how tight the championship race actually is over time.
 */
export interface TrendSeries {
  id: string
  label: string
  color: string
  values: number[]
}

interface MultiSeriesTrendChartProps {
  xLabels: string[]
  series: TrendSeries[]
  height?: number
}

export function MultiSeriesTrendChart({ xLabels, series, height = 200 }: MultiSeriesTrendChartProps) {
  if (xLabels.length < 2 || series.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-xs"
        style={{ height, color: 'var(--color-text-muted)' }}
      >
        Not enough rounds completed yet for a trend chart.
      </div>
    )
  }

  const width = 100
  const padding = 4
  const allValues = series.flatMap((s) => s.values)
  const min = Math.min(...allValues, 0)
  const max = Math.max(...allValues, 1)
  const range = max - min || 1

  function pathFor(values: number[]): string {
    return values
      .map((v, i) => {
        const x = padding + (i / (xLabels.length - 1)) * (width - padding * 2)
        const y = height - padding - ((v - min) / range) * (height - padding * 2)
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
      })
      .join(' ')
  }

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        {series.map((s) => (
          <path
            key={s.id}
            d={pathFor(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}
