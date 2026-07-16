import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { resolveUpcomingEvent } from '@/services/events'
import { getTracks } from '@/services/tracks'
import { Badge } from '@/components/Badge'
import { LoadingState, EmptyState } from '@/components/States'
import { formatDate } from '@/utils/format'
import { FlagIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function UpcomingRaceTile(_props: TileComponentProps) {
  const { leagueId, active, events, loading } = useDashboardBaseData()
  const tracksQuery = useQuery({
    queryKey: dashboardKeys.tracks(active?.championship.game_id ?? 'none', leagueId),
    queryFn: () => getTracks(active!.championship.game_id, leagueId),
    enabled: Boolean(active),
  })

  if (loading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />

  const upcoming = resolveUpcomingEvent(events)
  if (!upcoming) return <EmptyState title="No upcoming event" description="Schedule an event in the season calendar." />

  if (tracksQuery.error) console.error(tracksQuery.error)
  const trackName = upcoming.track_id ? tracksQuery.data?.find((t) => t.id === upcoming.track_id)?.name : null

  return (
    <Link to={`/race-weekend/${upcoming.id}`} className="block h-full">
      <div className="flex h-full flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">
            Round {upcoming.round}
            {upcoming.custom_title ? ` — ${upcoming.custom_title}` : ''}
          </p>
          <Badge tone={upcoming.status === 'live' ? 'success' : 'neutral'}>{upcoming.status}</Badge>
        </div>
        <div className="space-y-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          <p>{formatDate(upcoming.event_date)}</p>
          {trackName && (
            <p>
              {trackName}
              {upcoming.track_layout ? ` · ${upcoming.track_layout}` : ''}
            </p>
          )}
          {upcoming.race_distance_type && (
            <p>
              {upcoming.race_distance_type === 'laps' ? `${upcoming.race_value ?? '?'} laps` : `${upcoming.race_value ?? '?'} min endurance`}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

registerTile({
  type: 'upcoming_race',
  displayName: 'Upcoming Race',
  description: 'The next scheduled event: track, date, and format.',
  icon: FlagIcon,
  category: 'race',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'medium',
  minSize: 'small',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: UpcomingRaceTile,
})
