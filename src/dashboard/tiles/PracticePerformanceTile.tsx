import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { resolveUpcomingEvent } from '@/services/events'
import { getPracticeAggregates, buildRacePrepLeaderboard } from '@/services/racePrep'
import { LoadingState, EmptyState } from '@/components/States'
import { formatLapTime } from '@/utils/format'
import { toSafeErrorMessage } from '@/utils/errors'
import { ClockIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function PracticePerformanceTile(_props: TileComponentProps) {
  const { events, drivers, loading } = useDashboardBaseData()
  const driver = useCurrentDriver()
  const current = resolveUpcomingEvent(events)
  const query = useQuery({
    queryKey: dashboardKeys.practiceAggregates(current?.id ?? 'none', 'practice'),
    queryFn: () => getPracticeAggregates(current!.id, 'practice'),
    enabled: Boolean(current),
  })

  if (loading || query.isLoading) return <LoadingState />
  if (!current) return <EmptyState title="No active race weekend" />
  if (query.error) {
    return <EmptyState title="Could not load practice data" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }

  const leaderboard = buildRacePrepLeaderboard(query.data ?? [], drivers)
  if (leaderboard.length === 0 || leaderboard.every((row) => !row.hasPostedPractice)) {
    return <EmptyState title="No practice data yet" description="Post practice laps to see pace here." />
  }

  const rank = driver ? leaderboard.findIndex((row) => row.driverId === driver.id) : -1
  const self = rank >= 0 ? leaderboard[rank] : null
  const fastest = leaderboard[0]

  return (
    <div className="space-y-3 text-sm">
      {self && (
        <div className="flex items-center justify-between">
          <span style={{ color: 'var(--color-text-muted)' }}>Your rank</span>
          <span className="font-mono font-semibold">
            P{rank + 1} of {leaderboard.length}
          </span>
        </div>
      )}
      {self && (
        <>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Fastest lap</span>
            <span className="font-mono">{formatLapTime(self.fastestLapTimeMs)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Average lap</span>
            <span className="font-mono">{formatLapTime(self.averageLapTimeMs)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Gap to fastest</span>
            <span className="font-mono">
              {self.fastestLapTimeMs != null && fastest.fastestLapTimeMs != null
                ? `+${((self.fastestLapTimeMs - fastest.fastestLapTimeMs) / 1000).toFixed(3)}s`
                : '—'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Laps completed</span>
            <span className="font-mono">{self.lapsCompleted}</span>
          </div>
        </>
      )}
      {!self && (
        <p style={{ color: 'var(--color-text-muted)' }}>
          Fastest so far: {fastest.displayName} · {formatLapTime(fastest.fastestLapTimeMs)}
        </p>
      )}
    </div>
  )
}

registerTile({
  type: 'practice_performance',
  displayName: 'Practice Performance',
  description: 'Your practice pace vs the field for the current event.',
  icon: ClockIcon,
  category: 'race',
  supportedSizes: ['small', 'medium'],
  defaultSize: 'medium',
  minSize: 'small',
  maxSize: 'medium',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: PracticePerformanceTile,
})
