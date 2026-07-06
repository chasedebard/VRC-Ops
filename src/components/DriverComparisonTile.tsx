import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { DriverAvatar } from '@/components/DriverAvatar'
import { EmptyState } from '@/components/States'
import { formatLapTime } from '@/utils/format'
import type { DriverComparisonStats } from '@/utils/driverComparison'
import type { DriverRow } from '@/types/database'

type ComparisonMode = 2 | 3
type MetricDirection = 'higher' | 'lower'

interface DriverComparisonTileProps {
  drivers: DriverRow[]
  stats: DriverComparisonStats[]
}

interface ComparisonMetric {
  id: keyof Pick<
    DriverComparisonStats,
    | 'championshipPosition'
    | 'points'
    | 'starts'
    | 'wins'
    | 'podiums'
    | 'poles'
    | 'fastestLaps'
    | 'averageFinish'
    | 'bestFinish'
    | 'winRate'
    | 'podiumRate'
    | 'poleRate'
    | 'averageQualifyingPosition'
    | 'fastestLapMs'
    | 'recentAverageFinish'
  >
  label: string
  direction: MetricDirection
  formatter: (value: number) => string
  visual?: boolean
}

const METRICS: ComparisonMetric[] = [
  { id: 'championshipPosition', label: 'Championship position', direction: 'lower', formatter: formatPosition },
  { id: 'points', label: 'Points', direction: 'higher', formatter: formatNumber, visual: true },
  { id: 'starts', label: 'Starts', direction: 'higher', formatter: formatNumber },
  { id: 'wins', label: 'Wins', direction: 'higher', formatter: formatNumber, visual: true },
  { id: 'podiums', label: 'Podiums', direction: 'higher', formatter: formatNumber, visual: true },
  { id: 'poles', label: 'Poles', direction: 'higher', formatter: formatNumber },
  { id: 'fastestLaps', label: 'Fastest laps', direction: 'higher', formatter: formatNumber },
  { id: 'averageFinish', label: 'Average finish', direction: 'lower', formatter: formatDecimal, visual: true },
  { id: 'bestFinish', label: 'Best finish', direction: 'lower', formatter: formatPosition },
  { id: 'winRate', label: 'Win rate', direction: 'higher', formatter: formatPercentValue, visual: true },
  { id: 'podiumRate', label: 'Podium rate', direction: 'higher', formatter: formatPercentValue },
  { id: 'poleRate', label: 'Pole rate', direction: 'higher', formatter: formatPercentValue },
  { id: 'averageQualifyingPosition', label: 'Average qualifying position', direction: 'lower', formatter: formatDecimal },
  { id: 'fastestLapMs', label: 'Fastest lap time', direction: 'lower', formatter: formatLapTime },
  { id: 'recentAverageFinish', label: 'Recent avg. finish', direction: 'lower', formatter: formatDecimal },
]

const PLACEHOLDERS = ['Select first driver', 'Select second driver', 'Select third driver']
const NO_DATA = 'No data available'

export function DriverComparisonTile({ drivers, stats }: DriverComparisonTileProps) {
  const [mode, setMode] = useState<ComparisonMode>(2)
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>(['', '', ''])
  const initialized = useRef(false)

  const selectableDrivers = useMemo(
    () => drivers.filter((driver) => driver.is_active).sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [drivers],
  )
  const driverById = useMemo(() => new Map(selectableDrivers.map((driver) => [driver.id, driver])), [selectableDrivers])
  const statsByDriverId = useMemo(() => new Map(stats.map((row) => [row.driverId, row])), [stats])

  useEffect(() => {
    if (initialized.current || selectableDrivers.length === 0) return
    setSelectedDriverIds([selectableDrivers[0]?.id ?? '', selectableDrivers[1]?.id ?? '', ''])
    initialized.current = true
  }, [selectableDrivers])

  useEffect(() => {
    const validDriverIds = new Set(selectableDrivers.map((driver) => driver.id))
    setSelectedDriverIds((current) => sanitizeSelections(current, validDriverIds, mode))
  }, [mode, selectableDrivers])

  const visibleSelections = selectedDriverIds.slice(0, mode)
  const selectedDrivers = visibleSelections
    .map((driverId) => {
      const driver = driverById.get(driverId)
      const driverStats = statsByDriverId.get(driverId)
      return driver && driverStats ? { driver, stats: driverStats } : null
    })
    .filter((entry): entry is { driver: DriverRow; stats: DriverComparisonStats } => Boolean(entry))
  const visibleMetrics = METRICS.filter((metric) =>
    selectedDrivers.some(({ stats: driverStats }) => metricValue(metric, driverStats) != null),
  )
  const visualMetrics = visibleMetrics.filter((metric) => metric.visual).slice(0, 5)

  function handleModeChange(nextMode: ComparisonMode) {
    setMode(nextMode)
    setSelectedDriverIds((current) => {
      const next = [...current]
      if (nextMode === 2) {
        next[2] = ''
        return next
      }
      if (!next[2]) {
        const selected = new Set(next.filter(Boolean))
        next[2] = selectableDrivers.find((driver) => !selected.has(driver.id))?.id ?? ''
      }
      return next
    })
  }

  function handleSelectionChange(index: number, value: string) {
    setSelectedDriverIds((current) => {
      const next = [...current]
      next[index] = value
      if (value) {
        for (let i = 0; i < next.length; i += 1) {
          if (i !== index && next[i] === value) next[i] = ''
        }
      }
      return next
    })
  }

  return (
    <Card>
      <CardHeader className="items-start">
        <div>
          <CardTitle>Driver Comparison</CardTitle>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Compare performance across selected drivers
          </p>
        </div>
        <Badge tone="neutral">{mode} Drivers</Badge>
      </CardHeader>

      {selectableDrivers.length === 0 ? (
        <EmptyState title="No drivers available" description="Add active drivers before comparison is available." />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="inline-flex w-fit rounded-lg border p-1" style={{ borderColor: 'var(--color-border)' }}>
              <Button
                type="button"
                variant={mode === 2 ? 'primary' : 'ghost'}
                aria-pressed={mode === 2}
                className="px-3 py-1.5"
                onClick={() => handleModeChange(2)}
              >
                2 Drivers
              </Button>
              <Button
                type="button"
                variant={mode === 3 ? 'primary' : 'ghost'}
                aria-pressed={mode === 3}
                className="px-3 py-1.5"
                disabled={selectableDrivers.length < 3}
                onClick={() => handleModeChange(3)}
              >
                3 Drivers
              </Button>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: mode }).map((_, index) => (
                <DriverSelect
                  key={index}
                  index={index}
                  drivers={selectableDrivers}
                  selectedDriverIds={selectedDriverIds}
                  value={selectedDriverIds[index] ?? ''}
                  onChange={(value) => handleSelectionChange(index, value)}
                />
              ))}
            </div>
          </div>

          {selectableDrivers.length < mode && (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Add {mode - selectableDrivers.length} more active driver{mode - selectableDrivers.length === 1 ? '' : 's'} to fill every comparison slot.
            </p>
          )}

          {selectedDrivers.length === 0 ? (
            <EmptyState title="Select drivers to compare" description="Choose at least two drivers to build a comparison." />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                {selectedDrivers.map(({ driver, stats: driverStats }) => (
                  <DriverSummary key={driver.id} driver={driver} stats={driverStats} />
                ))}
              </div>

              {visualMetrics.length > 0 && selectedDrivers.length >= 2 && (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                  {visualMetrics.map((metric) => (
                    <MetricBars key={metric.id} metric={metric} selectedDrivers={selectedDrivers} />
                  ))}
                </div>
              )}

              {visibleMetrics.length > 0 ? (
                <ComparisonTable metrics={visibleMetrics} selectedDrivers={selectedDrivers} />
              ) : (
                <EmptyState title="No comparison data yet" description="Race results or standings are needed before metrics can be compared." />
              )}
            </>
          )}
        </div>
      )}
    </Card>
  )
}

function DriverSelect({
  index,
  drivers,
  selectedDriverIds,
  value,
  onChange,
}: {
  index: number
  drivers: DriverRow[]
  selectedDriverIds: string[]
  value: string
  onChange: (value: string) => void
}) {
  const selectedElsewhere = new Set(selectedDriverIds.filter((driverId, selectedIndex) => selectedIndex !== index && driverId))
  const selectId = `driver-comparison-${index}`

  return (
    <label className="text-sm font-medium" htmlFor={selectId}>
      Driver {index + 1}
      <select
        id={selectId}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
        value={value}
        aria-label={PLACEHOLDERS[index]}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{PLACEHOLDERS[index]}</option>
        {drivers
          .filter((driver) => driver.id === value || !selectedElsewhere.has(driver.id))
          .map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.driver_number != null ? `#${driver.driver_number} ` : ''}
              {driver.display_name}
            </option>
          ))}
      </select>
    </label>
  )
}

function DriverSummary({ driver, stats }: { driver: DriverRow; stats: DriverComparisonStats }) {
  const details = [stats.classLabel, stats.regionLabel].filter(Boolean).join(' / ')
  const highlight =
    stats.points != null
      ? `${formatNumber(stats.points)} pts`
      : stats.wins != null
        ? `${formatNumber(stats.wins)} wins`
        : NO_DATA

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex items-start justify-between gap-3">
        <Link to={`/drivers/${driver.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
          <DriverAvatar driver={driver} size="sm" />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{driver.display_name}</span>
            <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {driver.driver_number != null ? `#${driver.driver_number}` : 'No number'}
              {details ? ` / ${details}` : ''}
            </span>
          </span>
        </Link>
        <span className="shrink-0 rounded-full px-2 py-1 text-xs font-medium" style={{ backgroundColor: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
          {stats.championshipPosition != null ? formatPosition(stats.championshipPosition) : 'No rank'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <SummaryStat label="Highlight" value={highlight} />
        <SummaryStat label="Recent" value={stats.recentForm ?? NO_DATA} />
      </div>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
      <p className="truncate font-medium">{value}</p>
    </div>
  )
}

function MetricBars({
  metric,
  selectedDrivers,
}: {
  metric: ComparisonMetric
  selectedDrivers: { driver: DriverRow; stats: DriverComparisonStats }[]
}) {
  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <p className="mb-2 text-xs font-medium uppercase" style={{ color: 'var(--color-text-muted)' }}>
        {metric.label}
      </p>
      <div className="space-y-2">
        {selectedDrivers.map(({ driver, stats }) => {
          const value = metricValue(metric, stats)
          const percent = value == null ? 0 : visualBarPercent(metric, selectedDrivers, value)
          return (
            <div key={driver.id}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="truncate">{driver.display_name}</span>
                <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {value == null ? 'No data' : metric.formatter(value)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-surface)' }}>
                <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: 'var(--color-accent)' }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ComparisonTable({
  metrics,
  selectedDrivers,
}: {
  metrics: ComparisonMetric[]
  selectedDrivers: { driver: DriverRow; stats: DriverComparisonStats }[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead>
          <tr style={{ color: 'var(--color-text-muted)' }}>
            <th className="pb-2 pr-4" scope="col">
              Metric
            </th>
            {selectedDrivers.map(({ driver }) => (
              <th key={driver.id} className="pb-2 pr-4" scope="col">
                {driver.display_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {metrics.map((metric) => {
            const bestDriverIds = bestDriversForMetric(metric, selectedDrivers)
            return (
              <tr key={metric.id}>
                <th className="py-2 pr-4 font-medium" scope="row">
                  {metric.label}
                </th>
                {selectedDrivers.map(({ driver, stats }) => {
                  const value = metricValue(metric, stats)
                  const isBest = bestDriverIds.has(driver.id)
                  return (
                    <td key={driver.id} className="py-2 pr-4">
                      <span className="inline-flex items-center gap-2">
                        <span className="font-mono">{value == null ? NO_DATA : metric.formatter(value)}</span>
                        {isBest && (
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                            style={{ backgroundColor: 'var(--color-success)', color: '#fff' }}
                            aria-label={`Best ${metric.label}`}
                          >
                            Best
                          </span>
                        )}
                      </span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function sanitizeSelections(current: string[], validDriverIds: Set<string>, mode: ComparisonMode): string[] {
  const seen = new Set<string>()
  return current.map((driverId, index) => {
    if (index >= mode) return ''
    if (!driverId || !validDriverIds.has(driverId) || seen.has(driverId)) return ''
    seen.add(driverId)
    return driverId
  })
}

function metricValue(metric: ComparisonMetric, stats: DriverComparisonStats): number | null {
  const value = stats[metric.id]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function bestDriversForMetric(
  metric: ComparisonMetric,
  selectedDrivers: { driver: DriverRow; stats: DriverComparisonStats }[],
): Set<string> {
  const values = selectedDrivers
    .map(({ driver, stats }) => ({ driverId: driver.id, value: metricValue(metric, stats) }))
    .filter((entry): entry is { driverId: string; value: number } => entry.value != null)
  if (values.length < 2 || new Set(values.map((entry) => entry.value)).size < 2) return new Set()

  const bestValue =
    metric.direction === 'higher'
      ? Math.max(...values.map((entry) => entry.value))
      : Math.min(...values.map((entry) => entry.value))
  return new Set(values.filter((entry) => entry.value === bestValue).map((entry) => entry.driverId))
}

function visualBarPercent(
  metric: ComparisonMetric,
  selectedDrivers: { driver: DriverRow; stats: DriverComparisonStats }[],
  value: number,
): number {
  const values = selectedDrivers
    .map(({ stats }) => metricValue(metric, stats))
    .filter((metricValue): metricValue is number => metricValue != null && metricValue > 0)
  if (values.length === 0) return 0
  if (metric.direction === 'higher') {
    const max = Math.max(...values)
    return max > 0 ? Math.max(6, (value / max) * 100) : 0
  }
  const min = Math.min(...values)
  return value > 0 ? Math.max(6, Math.min(100, (min / value) * 100)) : 0
}

function formatNumber(value: number): string {
  return Math.round(value).toLocaleString()
}

function formatDecimal(value: number): string {
  return value.toFixed(1)
}

function formatPercentValue(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatPosition(value: number): string {
  return `P${Math.round(value)}`
}
