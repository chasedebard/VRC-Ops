import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getLatestStandings } from '@/services/standings'
import { resolveUpcomingEvent } from '@/services/events'
import { LoadingState, EmptyState } from '@/components/States'
import { BuildingIcon } from '../icons'
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

export function LeagueOverviewTile(_props: TileComponentProps) {
  const { selectedLeague } = useLeagueSession()
  const { active, drivers, events, loading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const standingsQuery = useQuery({
    queryKey: dashboardKeys.latestStandings(seasonId ?? 'none', 'overall', null),
    queryFn: () => getLatestStandings(seasonId!, 'overall'),
    enabled: Boolean(seasonId),
  })

  if (loading) return <LoadingState />
  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (standingsQuery.error) console.error(standingsQuery.error)

  const leaderRow = standingsQuery.data?.rows[0]
  const leaderDriver = leaderRow?.driver_id ? drivers.find((d) => d.id === leaderRow.driver_id) : undefined
  const upcoming = resolveUpcomingEvent(events)

  return (
    <div className="space-y-3">
      <p className="font-semibold">{selectedLeague.league.name}</p>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Active season" value={active?.season.name ?? '—'} />
        <Stat label="Drivers" value={drivers.filter((d) => d.is_active).length} />
        <Stat label="Events completed" value={events.filter((e) => e.status === 'completed').length} />
        <Stat label="Next race" value={upcoming ? `Round ${upcoming.round}` : '—'} />
        <Stat label="Current leader" value={leaderDriver?.display_name ?? '—'} />
      </div>
    </div>
  )
}

registerTile({
  type: 'league_overview',
  displayName: 'League Overview',
  description: 'League name, season, roster size, and current leader.',
  icon: BuildingIcon,
  category: 'other',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'medium',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: LeagueOverviewTile,
})
