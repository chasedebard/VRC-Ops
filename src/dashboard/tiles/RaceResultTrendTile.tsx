import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { TrendChart } from '@/components/charts/TrendChart'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { ChartLineIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function RaceResultTrendTile(_props: TileComponentProps) {
  const { active, loading } = useDashboardBaseData()
  const driver = useCurrentDriver()
  const seasonId = active?.season.id ?? null
  const query = useQuery({
    queryKey: dashboardKeys.seasonDriverHistory(seasonId ?? 'none'),
    queryFn: () => getSeasonDriverHistory(seasonId!),
    enabled: Boolean(seasonId),
  })

  if (!driver) return <EmptyState title="No driver profile linked" description="Link a driver profile to see your result trend." />
  if (loading || query.isLoading) return <LoadingState />
  if (query.error) {
    return <EmptyState title="Could not load result trend" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }

  const races = (query.data ?? [])
    .filter((h) => h.driver_id === driver.id && h.result_kind === 'race' && h.finish_position != null)
    .sort((a, b) => (a.events?.round ?? 0) - (b.events?.round ?? 0))

  if (races.length < 2) return <EmptyState title="Not enough races yet" />

  const points = races.map((race) => ({
    label: `R${race.events?.round ?? '?'}`,
    value: race.finish_position!,
    isWin: race.finish_position === 1 && race.status === 'fin',
    isPodium: (race.finish_position ?? 99) <= 3 && race.status === 'fin',
  }))

  return (
    <div>
      <TrendChart points={points} height={160} />
      <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Lower is better · gold dots mark wins.
      </p>
    </div>
  )
}

registerTile({
  type: 'race_result_trend',
  displayName: 'Race Result Trend',
  description: 'Your finishing position race by race.',
  icon: ChartLineIcon,
  category: 'chart',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'wide',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: RaceResultTrendTile,
})
