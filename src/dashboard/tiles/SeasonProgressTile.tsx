import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { getLatestStandings } from '@/services/standings'
import { resolveUpcomingEvent } from '@/services/events'
import { LoadingState, EmptyState } from '@/components/States'
import { formatDate } from '@/utils/format'
import { toSafeErrorMessage } from '@/utils/errors'
import { CalendarIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function SeasonProgressTile(_props: TileComponentProps) {
  const { active, drivers, events, loading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const historyQuery = useQuery({
    queryKey: dashboardKeys.seasonDriverHistory(seasonId ?? 'none'),
    queryFn: () => getSeasonDriverHistory(seasonId!),
    enabled: Boolean(seasonId),
  })
  const standingsQuery = useQuery({
    queryKey: dashboardKeys.latestStandings(seasonId ?? 'none', 'overall', null),
    queryFn: () => getLatestStandings(seasonId!, 'overall'),
    enabled: Boolean(seasonId),
  })

  if (loading || historyQuery.isLoading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />
  if (historyQuery.error) {
    return <EmptyState title="Could not load season progress" description={toSafeErrorMessage(historyQuery.error, 'Try again later.')} />
  }

  const completedEventIds = new Set(
    (historyQuery.data ?? []).filter((h) => h.result_kind === 'race').map((h) => h.event_id),
  )
  const completed = completedEventIds.size
  const remaining = Math.max(0, events.length - completed)
  const percent = events.length > 0 ? Math.round((completed / events.length) * 100) : 0
  const leader = standingsQuery.data?.rows[0]
  const leaderDriver = leader?.driver_id ? drivers.find((d) => d.id === leader.driver_id) : undefined
  const next = resolveUpcomingEvent(events)

  return (
    <div className="space-y-2 text-sm">
      <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-surface)' }}>
        <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: 'var(--color-accent)' }} />
      </div>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--color-text-muted)' }}>Completed</span>
        <span className="font-mono">{completed}</span>
      </div>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--color-text-muted)' }}>Remaining</span>
        <span className="font-mono">{remaining}</span>
      </div>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--color-text-muted)' }}>Leader</span>
        <span className="font-medium">{leaderDriver?.display_name ?? '—'}</span>
      </div>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--color-text-muted)' }}>Next event</span>
        <span>{next ? formatDate(next.event_date) : '—'}</span>
      </div>
    </div>
  )
}

registerTile({
  type: 'season_progress',
  displayName: 'Season Progress',
  description: 'Rounds completed, leader, and what’s next.',
  icon: CalendarIcon,
  category: 'other',
  supportedSizes: ['small', 'medium'],
  defaultSize: 'medium',
  minSize: 'small',
  maxSize: 'medium',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: SeasonProgressTile,
})
