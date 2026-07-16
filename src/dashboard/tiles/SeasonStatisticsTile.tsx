import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { getSeasonDriverHistory, computeCareerStats } from '@/services/driverProfile'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { ChartBarIcon } from '../icons'
import type { TileComponentProps } from '../types'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
    </div>
  )
}

export function SeasonStatisticsTile(_props: TileComponentProps) {
  const driver = useCurrentDriver()
  const { active, loading: baseLoading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const query = useQuery({
    queryKey: dashboardKeys.seasonDriverHistory(seasonId ?? 'none'),
    queryFn: () => getSeasonDriverHistory(seasonId!),
    enabled: Boolean(seasonId),
  })

  if (!driver) {
    return <EmptyState title="No driver profile linked" description="Link a driver profile to see season stats." />
  }
  if (baseLoading || query.isLoading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />
  if (query.error) {
    return <EmptyState title="Could not load season statistics" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }

  const driverHistory = (query.data ?? []).filter((h) => h.driver_id === driver.id)
  const races = driverHistory.filter((h) => h.result_kind === 'race')
  if (races.length === 0) {
    return <EmptyState title="No results yet this season" />
  }

  const stats = computeCareerStats(races)
  const qualifyingPositions = driverHistory
    .map((h) => h.qualifying_position)
    .filter((p): p is number => p != null && p > 0)
  const avgQualifying = qualifyingPositions.length > 0 ? qualifyingPositions.reduce((a, b) => a + b, 0) / qualifyingPositions.length : null
  const totalPoints = races.reduce((sum, r) => sum + (r.points ?? 0), 0)
  const positionChanges = races
    .filter((r) => r.start_position != null && r.finish_position != null)
    .reduce((sum, r) => sum + (r.start_position! - r.finish_position!), 0)
  const completionRate = races.length > 0 ? (races.filter((r) => r.status === 'fin').length / races.length) * 100 : 0

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      <Stat label="Starts" value={stats.starts} />
      <Stat label="Wins" value={stats.wins} />
      <Stat label="Podiums" value={stats.podiums} />
      <Stat label="Poles" value={stats.poles} />
      <Stat label="Fastest laps" value={stats.fastestLaps} />
      <Stat label="Avg. qualifying" value={avgQualifying != null ? avgQualifying.toFixed(1) : '—'} />
      <Stat label="Avg. finish" value={stats.averageFinish != null ? stats.averageFinish.toFixed(1) : '—'} />
      <Stat label="Total points" value={Math.round(totalPoints)} />
      <Stat label="Positions gained" value={positionChanges > 0 ? `+${positionChanges}` : positionChanges} />
      <Stat label="Completion rate" value={`${Math.round(completionRate)}%`} />
    </div>
  )
}

registerTile({
  type: 'season_statistics',
  displayName: 'Season Statistics',
  description: 'This season’s starts, points, and position changes.',
  icon: ChartBarIcon,
  category: 'driver',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'wide',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: SeasonStatisticsTile,
})
