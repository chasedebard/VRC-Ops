import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { getSeasonEvents } from '@/services/events'
import { getResultSetsForEvents } from '@/services/results'
import { getTracks } from '@/services/tracks'
import { dayKey, eventDisplayTitle, eventRoundLabel, resolveCurrentRace } from '@/utils/currentRace'
import { hasLiveOrUpcoming, roundStatus, type RoundStatus } from '@/utils/sessionModel'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDate } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { ChampionshipRow, EventRow, ResultSetRow, SeasonRow } from '@/types/database'

const STATUS_TONE: Record<RoundStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'accent'> = {
  Cancelled: 'danger',
  Postponed: 'warning',
  Draft: 'neutral',
  Completed: 'success',
  'Awaiting Results': 'warning',
  'Current Race': 'accent',
  Live: 'success',
  Upcoming: 'neutral',
}

/**
 * Race Weekend overview (iOS `VRCRaceControlEventListView`): a current-race hero first — with ONE reconciled status badge, since
 * `events.status` alone can read "Completed" before results exist — a round selector, and the full round list with per-round
 * results status. Everyone in the league sees the same screen; control surfaces on the event page hide themselves by role.
 */
export default function RaceWeekendHubPage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const [context, setContext] = useState<{ championship: ChampionshipRow; season: SeasonRow } | null | undefined>(undefined)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [resultSets, setResultSets] = useState<ResultSetRow[]>([])
  const [trackNames, setTrackNames] = useState<Map<string, string>>(new Map())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!selectedLeague) return
    setError(null)
    try {
      const active = await resolveActiveSeason(selectedLeague.league.id)
      setContext(active)
      if (!active) return
      const list = await getSeasonEvents(active.season.id)
      setEvents(list)
      const [sets, tracks] = await Promise.all([
        getResultSetsForEvents(list.map((e) => e.id)).catch(() => []),
        getTracks(active.championship.game_id, selectedLeague.league.id).catch(() => []),
      ])
      setResultSets(sets)
      setTrackNames(new Map(tracks.map((t) => [t.id, t.name])))
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load the race weekend.'))
    }
  }, [selectedLeague])

  useEffect(() => {
    void load()
  }, [load])

  // Archived/cancelled events cannot run a live session.
  const operable = useMemo(() => (events ?? []).filter((e) => e.status !== 'archived' && e.status !== 'cancelled'), [events])
  const ordered = useMemo(
    () => [...operable].sort((a, b) => a.round - b.round || (a.event_date ?? '').localeCompare(b.event_date ?? '')),
    [operable],
  )
  const current = useMemo(() => resolveCurrentRace(operable), [operable])
  const awaitingNextSeason = selectedId === null && events !== null && !hasLiveOrUpcoming(operable, dayKey())
  const hero = (selectedId ? operable.find((e) => e.id === selectedId) : null) ?? (awaitingNextSeason ? null : current)
  const raceSetByEvent = useMemo(() => new Map(resultSets.filter((s) => s.kind === 'race').map((s) => [s.event_id, s])), [resultSets])
  const qualSetByEvent = useMemo(() => new Map(resultSets.filter((s) => s.kind === 'qualifying').map((s) => [s.event_id, s])), [resultSets])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (context === undefined || (context && events === null)) return <LoadingState label="Loading events…" />
  if (context === null) {
    return (
      <EmptyState
        title="No active season"
        description="Activate a season with at least one event to see race weekend info here."
        action={
          <Link to="/championships" className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
            Go to championships
          </Link>
        }
      />
    )
  }

  const heroRace = hero ? raceSetByEvent.get(hero.id) : undefined
  const heroStatus = hero ? roundStatus(hero, hero.id === current?.id, heroRace?.official) : null
  const heroQual = hero ? qualSetByEvent.get(hero.id) : undefined

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Race Weekend</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {context.championship.name} · {context.season.name}
        </p>
      </div>

      {awaitingNextSeason ? (
        <EmptyState
          title="Awaiting Next Season"
          description={operable.length === 0 ? 'No races are scheduled yet.' : 'Every scheduled round in this season is complete.'}
          action={
            permissions.canManageSetup ? (
              <Link to="/championships" className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
                Championship management
              </Link>
            ) : undefined
          }
        />
      ) : hero && heroStatus ? (
        <Link to={`/race-weekend/${hero.id}`} aria-label={`Open ${eventRoundLabel(hero)} ${eventDisplayTitle(hero)}`}>
          <Card style={{ borderColor: 'var(--color-accent)' }} className="transition hover:shadow-md">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={STATUS_TONE[heroStatus]}>{heroStatus}</Badge>
              <div className="flex gap-1.5">
                <Badge tone={heroQual?.official ? 'success' : 'neutral'}>Qualifying {heroQual?.official ? 'official' : 'pending'}</Badge>
                <Badge tone={heroRace?.official ? 'success' : 'neutral'}>Race {heroRace?.official ? 'official' : 'pending'}</Badge>
              </div>
            </div>
            <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
              {eventRoundLabel(hero)}
            </p>
            <h2 className="text-xl font-bold">{eventDisplayTitle(hero)}</h2>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {[hero.track_id ? trackNames.get(hero.track_id) : null, hero.track_layout, hero.event_date ? formatDate(hero.event_date) : 'Date to be announced']
                .filter(Boolean)
                .join(' · ')}
            </p>
          </Card>
        </Link>
      ) : (
        <EmptyState title="No upcoming event" description="Schedule an event in the season calendar." />
      )}

      {ordered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All rounds</CardTitle>
            {selectedId && (
              <button type="button" className="text-xs underline" onClick={() => setSelectedId(null)}>
                Back to current race
              </button>
            )}
          </CardHeader>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {ordered.map((event) => {
              const race = raceSetByEvent.get(event.id)
              const status = roundStatus(event, event.id === current?.id && !awaitingNextSeason, race ? race.official : undefined)
              return (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => setSelectedId(event.id)} aria-label={`Show ${eventRoundLabel(event)} at the top`}>
                      {eventRoundLabel(event)} · {eventDisplayTitle(event)}
                    </button>
                    <Link to={`/race-weekend/${event.id}`} className="text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
                      Open
                    </Link>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: 'var(--color-text-muted)' }}>{formatDate(event.event_date)}</span>
                    <Badge tone={STATUS_TONE[status]}>{status}</Badge>
                    {race?.official && <Badge tone="success">Results</Badge>}
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
