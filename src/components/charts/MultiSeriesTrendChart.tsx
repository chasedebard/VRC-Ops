import { useState } from 'react'

/**
 * Multi-line SVG chart for comparing every driver's cumulative points across
 * rounds — richer than the native app's single-snapshot standings view,
 * showing how tight the championship race actually is over time. The y-axis
 * top is derived from the visible data (bottom is always pinned to 0) so a
 * young season with low point totals doesn't get dwarfed by a fixed scale.
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

const WIDTH = 640
const PADDING_LEFT = 34
const PADDING_RIGHT = 8
const PADDING_TOP = 10
const PADDING_BOTTOM = 22
const TICK_COUNT = 4

export function MultiSeriesTrendChart({ xLabels, series, height = 220 }: MultiSeriesTrendChartProps) {
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())

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

  const visibleSeries = series.filter((s) => !hiddenIds.has(s.id))
  const max = niceMax(Math.max(0, ...visibleSeries.flatMap((s) => s.values)))
  const min = 0

  const plotWidth = WIDTH - PADDING_LEFT - PADDING_RIGHT
  const plotHeight = height - PADDING_TOP - PADDING_BOTTOM

  function xFor(i: number): number {
    return PADDING_LEFT + (xLabels.length === 1 ? 0 : (i / (xLabels.length - 1)) * plotWidth)
  }
  function yFor(v: number): number {
    return PADDING_TOP + plotHeight - ((v - min) / (max - min || 1)) * plotHeight
  }
  function pathFor(values: number[]): string {
    return values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i)} ${yFor(v)}`).join(' ')
  }

  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => Math.round((max / TICK_COUNT) * i))

  function toggle(id: string) {
    setHiddenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" height={height}>
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={PADDING_LEFT}
              x2={WIDTH - PADDING_RIGHT}
              y1={yFor(t)}
              y2={yFor(t)}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
            <text x={PADDING_LEFT - 6} y={yFor(t)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="var(--color-text-muted)">
              {t}
            </text>
          </g>
        ))}

        {xLabels.map((label, i) => (
          <text
            key={`${label}-${i}`}
            x={xFor(i)}
            y={height - PADDING_BOTTOM + 14}
            textAnchor="middle"
            fontSize="9"
            fill="var(--color-text-muted)"
          >
            {label}
          </text>
        ))}

        {visibleSeries.map((s) => (
          <g key={s.id}>
            <path d={pathFor(s.values)} fill="none" stroke={s.color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {s.values.map((v, i) => (
              <circle key={i} cx={xFor(i)} cy={yFor(v)} r={2.5} fill={s.color} />
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {series.map((s) => {
          const hidden = hiddenIds.has(s.id)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className="flex items-center gap-1.5"
              style={{ opacity: hidden ? 0.4 : 1 }}
              aria-pressed={!hidden}
              title={hidden ? `Show ${s.label}` : `Hide ${s.label}`}
            >
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const NICE_FRACTIONS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

/** Rounds a value up to a "nice" axis maximum so gridlines land on round numbers
 *  without leaving much more headroom than the data actually needs. */
function niceMax(value: number): number {
  if (value <= 0) return 10
  const exponent = Math.floor(Math.log10(value))
  const fraction = value / 10 ** exponent
  const niceFraction = NICE_FRACTIONS.find((f) => f >= fraction) ?? 10
  return niceFraction * 10 ** exponent
}
