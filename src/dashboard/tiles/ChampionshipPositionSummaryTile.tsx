import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { getLatestStandings } from '@/services/standings'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { MAX_POINTS_PER_ROUND, resolveForecastTotalRounds } from '@/services/dashboardAnalytics'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { TargetIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function ChampionshipPositionSummaryTile(_props: TileComponentProps) {
  const { active, events, loading } = useDashboardBaseData()
  const driver = useCurrentDriver()
  const seasonId = active?.season.id ?? null
  const standingsQuery = useQuery({
    queryKey: dashboardKeys.latestStandings(seasonId ?? 'none', 'overall', null),
    queryFn: () => getLatestStandings(seasonId!, 'overall'),
    enabled: Boolean(seasonId),
  })
  const historyQuery = useQuery({
    queryKey: dashboardKeys.seasonDriverHistory(seasonId ?? 'none'),
    queryFn: () => getSeasonDriverHistory(seasonId!),
    enabled: Boolean(seasonId),
  })

  if (!driver) return <EmptyState title="No driver profile linked" description="Link a driver profile to see your position." />
  if (loading || standingsQuery.isLoading || historyQuery.isLoading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />
  if (standingsQuery.error) {
    return <EmptyState title="Could not load standings" description={toSafeErrorMessage(standingsQuery.error, 'Try again later.')} />
  }

  const rows = standingsQuery.data?.rows ?? []
  const selfRow = rows.find((r) => r.driver_id === driver.id)
  if (!selfRow) return <EmptyState title="Not yet in the standings" description="Results appear here after your first race." />

  const leader = rows[0]
  const behind = rows.find((r) => r.position === selfRow.position + 1)
  const completedRaceCount = new Set(
    (historyQuery.data ?? []).filter((h) => h.result_kind === 'race').map((h) => h.event_id),
  ).size
  const totalRounds = resolveForecastTotalRounds(active.season, events, completedRaceCount, null)
  const remainingRounds = Math.max(0, totalRounds - completedRaceCount)
  const maxReachable = selfRow.points + remainingRounds * MAX_POINTS_PER_ROUND

  return (
    <div className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <p className="text-2xl font-bold">P{selfRow.position}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Current position
        </p>
      </div>
      <div>
        <p className="text-2xl font-bold">{selfRow.points}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Total points
        </p>
      </div>
      <div>
        <p className="font-mono font-semibold">{leader.points - selfRow.points || '—'}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Gap to leader
        </p>
      </div>
      <div>
        <p className="font-mono font-semibold">{behind ? selfRow.points - behind.points : '—'}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Gap behind
        </p>
      </div>
      <div>
        <p className="font-mono font-semibold">{remainingRounds}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Rounds remaining
        </p>
      </div>
      <div>
        <p className="font-mono font-semibold">{maxReachable}</p>
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Max possible finish
        </p>
      </div>
    </div>
  )
}

registerTile({
  type: 'championship_position_summary',
  displayName: 'Championship Position Summary',
  description: 'Your position, points, and gaps at a glance.',
  icon: TargetIcon,
  category: 'standings',
  supportedSizes: ['small', 'medium'],
  defaultSize: 'small',
  minSize: 'small',
  maxSize: 'medium',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: ChampionshipPositionSummaryTile,
})
