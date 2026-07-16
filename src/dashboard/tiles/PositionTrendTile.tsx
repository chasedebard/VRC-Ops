import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { getStandingsHistory } from '@/services/standings'
import { seriesColor } from '@/utils/colors'
import { MultiSeriesTrendChart, type TrendSeries } from '@/components/charts/MultiSeriesTrendChart'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { ChartLineIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function PositionTrendTile(_props: TileComponentProps) {
  const { active, drivers, events, loading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const query = useQuery({
    queryKey: dashboardKeys.standingsHistory(seasonId ?? 'none', 'overall'),
    queryFn: () => getStandingsHistory(seasonId!, 'overall'),
    enabled: Boolean(seasonId),
  })

  if (loading || query.isLoading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />
  if (query.error) {
    return <EmptyState title="Could not load position trend" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }

  const snapshots = query.data ?? []
  if (snapshots.length < 2) {
    return <EmptyState title="Not enough rounds yet" description="Position trends appear after a few races." />
  }

  const roundByEvent = new Map(events.map((e) => [e.id, e.round]))
  const ordered = [...snapshots].sort((a, b) => {
    const roundA = a.snapshot.event_id ? roundByEvent.get(a.snapshot.event_id) ?? 0 : 0
    const roundB = b.snapshot.event_id ? roundByEvent.get(b.snapshot.event_id) ?? 0 : 0
    return roundA - roundB
  })

  const finalRows = ordered[ordered.length - 1].rows
  const driverIds = finalRows
    .filter((r) => r.driver_id)
    .sort((a, b) => a.position - b.position)
    .slice(0, 8)
    .map((r) => r.driver_id as string)
  const driverById = new Map(drivers.map((d) => [d.id, d]))

  const series: TrendSeries[] = driverIds.map((driverId, index) => ({
    id: driverId,
    label: driverById.get(driverId)?.display_name ?? 'Driver',
    color: seriesColor(index),
    values: ordered.map((s) => s.rows.find((r) => r.driver_id === driverId)?.position ?? finalRows.length),
  }))
  const xLabels = ordered.map((s) => (s.snapshot.event_id ? `R${roundByEvent.get(s.snapshot.event_id) ?? '?'}` : '—'))

  return (
    <div>
      <MultiSeriesTrendChart xLabels={xLabels} series={series} height={200} />
      <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Lower position is better.
      </p>
    </div>
  )
}

registerTile({
  type: 'position_trend',
  displayName: 'Position Trend',
  description: 'Championship position over the season.',
  icon: ChartLineIcon,
  category: 'chart',
  supportedSizes: ['wide', 'large', 'full'],
  defaultSize: 'wide',
  minSize: 'wide',
  maxSize: 'full',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: PositionTrendTile,
})
