import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useCurrentDriver } from '../useCurrentDriver'
import { getDriverHistory, computeCareerStats } from '@/services/driverProfile'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { TrophyIcon } from '../icons'
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

export function CareerStatisticsTile(_props: TileComponentProps) {
  const driver = useCurrentDriver()
  const query = useQuery({
    queryKey: dashboardKeys.driverHistory(driver?.id ?? 'none'),
    queryFn: () => getDriverHistory(driver!.id),
    enabled: Boolean(driver),
  })

  if (!driver) {
    return <EmptyState title="No driver profile linked" description="Link a driver profile to see career stats." />
  }
  if (query.isLoading) return <LoadingState />
  if (query.error) {
    return <EmptyState title="Could not load career statistics" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }
  const history = query.data ?? []
  if (history.length === 0) {
    return <EmptyState title="No race history yet" description="Career statistics appear after your first race." />
  }

  const stats = computeCareerStats(history)
  const totalPoints = history.filter((h) => h.result_kind === 'race').reduce((sum, h) => sum + (h.points ?? 0), 0)
  const bestFinish = history
    .filter((h) => h.result_kind === 'race' && h.status === 'fin' && h.finish_position != null)
    .reduce((best: number | null, h) => (best == null || h.finish_position! < best ? h.finish_position! : best), null)

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      <Stat label="Starts" value={stats.starts} />
      <Stat label="Wins" value={stats.wins} />
      <Stat label="Podiums" value={stats.podiums} />
      <Stat label="Poles" value={stats.poles} />
      <Stat label="Fastest laps" value={stats.fastestLaps} />
      <Stat label="Championships" value="—" />
      <Stat label="Avg. finish" value={stats.averageFinish != null ? stats.averageFinish.toFixed(1) : '—'} />
      <Stat label="Best finish" value={bestFinish != null ? `P${bestFinish}` : '—'} />
      <Stat label="Total points" value={Math.round(totalPoints)} />
    </div>
  )
}

registerTile({
  type: 'career_statistics',
  displayName: 'Career Statistics',
  description: 'Starts, wins, podiums, poles, and career points.',
  icon: TrophyIcon,
  category: 'driver',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'medium',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: CareerStatisticsTile,
})
