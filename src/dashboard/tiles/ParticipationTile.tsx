import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { UsersIcon } from '../icons'
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

export function ParticipationTile(_props: TileComponentProps) {
  const driver = useCurrentDriver()
  const { active, drivers, events, loading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const query = useQuery({
    queryKey: dashboardKeys.seasonDriverHistory(seasonId ?? 'none'),
    queryFn: () => getSeasonDriverHistory(seasonId!),
    enabled: Boolean(seasonId),
  })

  if (loading || query.isLoading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />
  if (query.error) {
    return <EmptyState title="Could not load participation" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }
  if (events.length === 0) return <EmptyState title="No events scheduled yet" />

  const history = query.data ?? []

  if (driver) {
    const enteredEventIds = new Set(history.filter((h) => h.driver_id === driver.id).map((h) => h.event_id))
    const completedEventIds = new Set(
      history.filter((h) => h.driver_id === driver.id && h.result_kind === 'race').map((h) => h.event_id),
    )
    const entered = enteredEventIds.size
    const completed = completedEventIds.size
    const missed = Math.max(0, events.length - entered)
    const rate = events.length > 0 ? Math.round((completed / events.length) * 100) : 0
    return (
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Events entered" value={entered} />
        <Stat label="Events completed" value={completed} />
        <Stat label="Missed events" value={missed} />
        <Stat label="Completion rate" value={`${rate}%`} />
      </div>
    )
  }

  // No linked driver profile (typically an owner/admin) — show a league-wide rollup instead.
  const activeDriverIds = new Set(drivers.filter((d) => d.is_active).map((d) => d.id))
  const entriesByEvent = new Map<string, Set<string>>()
  for (const h of history) {
    if (!activeDriverIds.has(h.driver_id)) continue
    const set = entriesByEvent.get(h.event_id) ?? new Set<string>()
    set.add(h.driver_id)
    entriesByEvent.set(h.event_id, set)
  }
  const avgEntrants = entriesByEvent.size > 0
    ? Array.from(entriesByEvent.values()).reduce((sum, s) => sum + s.size, 0) / entriesByEvent.size
    : 0

  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat label="Active drivers" value={activeDriverIds.size} />
      <Stat label="Events scheduled" value={events.length} />
      <Stat label="Events with results" value={entriesByEvent.size} />
      <Stat label="Avg. entrants / race" value={avgEntrants.toFixed(1)} />
    </div>
  )
}

registerTile({
  type: 'participation',
  displayName: 'Participation & Attendance',
  description: 'Events entered, completed, and missed.',
  icon: UsersIcon,
  category: 'admin',
  supportedSizes: ['small', 'medium'],
  defaultSize: 'medium',
  minSize: 'small',
  maxSize: 'medium',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: ParticipationTile,
})
