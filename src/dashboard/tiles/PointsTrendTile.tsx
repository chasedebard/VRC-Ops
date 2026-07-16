import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { getSeasonScoringOutputs, getLatestStandings } from '@/services/standings'
import { buildCumulativePointsSeries } from '@/services/dashboardAnalytics'
import { MultiSeriesTrendChart } from '@/components/charts/MultiSeriesTrendChart'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { ChartLineIcon } from '../icons'
import type { TileComponentProps } from '../types'

interface PointsTrendSettings extends Record<string, unknown> {
  scope: 'field' | 'top5' | 'self_and_rivals'
}

export function PointsTrendTile({ settings }: TileComponentProps<PointsTrendSettings>) {
  const { active, drivers, events, loading } = useDashboardBaseData()
  const driver = useCurrentDriver()
  const seasonId = active?.season.id ?? null
  const outputsQuery = useQuery({
    queryKey: dashboardKeys.scoringOutputs(seasonId ?? 'none'),
    queryFn: () => getSeasonScoringOutputs(seasonId!),
    enabled: Boolean(seasonId),
  })
  const standingsQuery = useQuery({
    queryKey: dashboardKeys.latestStandings(seasonId ?? 'none', 'overall', null),
    queryFn: () => getLatestStandings(seasonId!, 'overall'),
    enabled: Boolean(seasonId) && settings.scope !== 'field',
  })

  if (loading || outputsQuery.isLoading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />
  if (outputsQuery.error) {
    return <EmptyState title="Could not load points trend" description={toSafeErrorMessage(outputsQuery.error, 'Try again later.')} />
  }

  const rows = standingsQuery.data?.rows ?? []
  let preferredDriverIds: string[] = []
  if (settings.scope === 'top5') {
    preferredDriverIds = rows.slice(0, 5).map((r) => r.driver_id).filter((id): id is string => Boolean(id))
  } else if (settings.scope === 'self_and_rivals' && driver) {
    const selfRow = rows.find((r) => r.driver_id === driver.id)
    if (selfRow) {
      preferredDriverIds = rows
        .filter((r) => Math.abs(r.position - selfRow.position) <= 2)
        .map((r) => r.driver_id)
        .filter((id): id is string => Boolean(id))
    }
  }

  const roundByEvent = new Map(events.map((e) => [e.id, e.round]))
  const pointsSeries = buildCumulativePointsSeries(outputsQuery.data ?? [], roundByEvent, preferredDriverIds, drivers)

  return <MultiSeriesTrendChart xLabels={pointsSeries.xLabels} series={pointsSeries.series} height={200} />
}

registerTile({
  type: 'points_trend',
  displayName: 'Points Trend',
  description: 'Cumulative championship points over the season.',
  icon: ChartLineIcon,
  category: 'chart',
  supportedSizes: ['wide', 'large', 'full'],
  defaultSize: 'wide',
  minSize: 'wide',
  maxSize: 'full',
  allowMultipleInstances: true,
  requiresPro: false,
  defaultSettings: { scope: 'top5' },
  configSchema: [
    {
      key: 'scope',
      label: 'Drivers shown',
      type: 'select',
      options: [
        { value: 'top5', label: 'Top 5' },
        { value: 'self_and_rivals', label: 'Me and nearby rivals' },
        { value: 'field', label: 'Entire field' },
      ],
    },
  ],
  Component: PointsTrendTile,
})
