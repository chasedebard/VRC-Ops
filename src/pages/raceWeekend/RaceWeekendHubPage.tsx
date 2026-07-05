import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { getSeasonEvents, resolveUpcomingEvent } from '@/services/events'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDate } from '@/utils/format'
import type { ChampionshipRow, EventRow, SeasonRow } from '@/types/database'

const EVENT_STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  scheduled: 'neutral',
  live: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  postponed: 'warning',
  archived: 'neutral',
}

export default function RaceWeekendHubPage() {
  const { selectedLeague } = useLeagueSession()
  const [context, setContext] = useState<{ championship: ChampionshipRow; season: SeasonRow } | null | undefined>(
    undefined,
  )
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!selectedLeague) return
    setError(null)
    try {
      const active = await resolveActiveSeason(selectedLeague.league.id)
      setContext(active)
      if (active) setEvents(await getSeasonEvents(active.season.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the race weekend.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.league.id])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (context === undefined || (context && events === null)) return <LoadingState />
  if (context === null) {
    return (
      <EmptyState
        title="No active season"
        description="Create a championship and season, then schedule an event, to see race weekend info here."
        action={
          <Link to="/championships" className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
            Go to championships
          </Link>
        }
      />
    )
  }

  const upcoming = resolveUpcomingEvent(events ?? [])
  const rest = (events ?? [])
    .filter((e) => e.id !== upcoming?.id)
    .sort((a, b) => a.round - b.round)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Race Weekend</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {context.championship.name} · {context.season.name}
        </p>
      </div>

      {upcoming ? (
        <Link to={`/race-weekend/${upcoming.id}`}>
          <Card style={{ borderColor: 'var(--color-accent)' }} className="transition hover:shadow-md">
            <CardHeader>
              <CardTitle>
                Round {upcoming.round}
                {upcoming.custom_title ? ` — ${upcoming.custom_title}` : ''}
              </CardTitle>
              <Badge tone={EVENT_STATUS_TONE[upcoming.status]}>{upcoming.status}</Badge>
            </CardHeader>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {formatDate(upcoming.event_date)}
            </p>
          </Card>
        </Link>
      ) : (
        <EmptyState title="No upcoming event" description="Schedule an event in the season calendar." />
      )}

      {rest.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All events</CardTitle>
          </CardHeader>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {rest.map((event) => (
              <li key={event.id} className="flex items-center justify-between py-2.5 text-sm">
                <Link to={`/race-weekend/${event.id}`} className="font-medium hover:underline">
                  Round {event.round} {event.custom_title ? `— ${event.custom_title}` : ''}
                </Link>
                <div className="flex items-center gap-2">
                  <span style={{ color: 'var(--color-text-muted)' }}>{formatDate(event.event_date)}</span>
                  <Badge tone={EVENT_STATUS_TONE[event.status]}>{event.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
