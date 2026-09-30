import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { getSeasonEvents } from '@/services/events'
import { getTracks } from '@/services/tracks'
import { listLeagueClasses, listLeagueRegions } from '@/services/setup'
import { dayKey, eventDisplayTitle, eventRoundLabel, raceTemporality, resolveCurrentRace } from '@/utils/currentRace'
import { distanceText } from '@/utils/dashboardModel'
import { EVENT_STATUS_LABEL } from '@/utils/eventForm'
import { backendErrorMessage } from '@/utils/backendErrors'
import { formatDate } from '@/utils/format'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { ChampionshipRow, EventRow, SeasonRow } from '@/types/database'

const TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = { live: 'success', cancelled: 'danger', postponed: 'warning' }

/**
 * Championship ▸ Schedule (iOS `VRCScheduleTileWindow` / schedule subsection): the active season's calendar, read-only for every member. Owners and
 * Admins edit races from the season page. Nothing here depends on role — the list is whatever RLS lets the viewer read.
 */
export default function SchedulePage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const leagueId = selectedLeague?.league.id ?? null
  const [context, setContext] = useState<{ championship: ChampionshipRow; season: SeasonRow } | null | undefined>(undefined)
  const [events, setEvents] = useState<EventRow[]>([])
  const [names, setNames] = useState<{ tracks: Map<string, string>; classes: Map<string, string>; regions: Map<string, string> }>({ tracks: new Map(), classes: new Map(), regions: new Map() })
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!leagueId) return
    setError(null)
    try {
      const active = await resolveActiveSeason(leagueId)
      setContext(active)
      if (!active) return
      const [list, tracks, classes, regions] = await Promise.all([
        getSeasonEvents(active.season.id),
        getTracks(active.championship.game_id, leagueId).catch(() => []),
        listLeagueClasses(leagueId).catch(() => []),
        listLeagueRegions(leagueId).catch(() => []),
      ])
      setEvents(list)
      setNames({
        tracks: new Map(tracks.map((t) => [t.id, t.layout ? `${t.name} — ${t.layout}` : t.name])),
        classes: new Map(classes.map((c) => [c.id, c.name])),
        regions: new Map(regions.map((r) => [r.id, r.name])),
      })
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load the schedule.'))
    }
  }, [leagueId])

  useEffect(() => {
    void load()
  }, [load])

  const ordered = useMemo(() => [...events].sort((a, b) => a.round - b.round), [events])
  const current = useMemo(() => resolveCurrentRace(events.filter((e) => e.status !== 'archived' && e.status !== 'cancelled')), [events])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (context === undefined) return <LoadingState label="Loading schedule…" />
  if (context === null) {
    return <EmptyState title="No active season" description={permissions.canManageSetup ? 'Create a championship and activate a season to build a schedule.' : 'The schedule appears once a season is active.'} />
  }
  const today = dayKey()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Schedule</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {context.championship.name} · {context.season.name} · {ordered.length} round{ordered.length === 1 ? '' : 's'}
          {permissions.canManageSetup && (
            <>
              {' · '}
              <Link to={`/seasons/${context.season.id}`} className="underline" style={{ color: 'var(--color-accent)' }}>
                Edit races
              </Link>
            </>
          )}
        </p>
      </div>

      {ordered.length === 0 ? (
        <EmptyState title="No events scheduled" description="Races appear here once they are added to the season." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Rounds</CardTitle>
          </CardHeader>
          <ol className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {ordered.map((event) => {
              const upcoming = event.event_date ? event.event_date >= today : true
              return (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 py-3" aria-current={event.id === current?.id ? 'true' : undefined}>
                  <div>
                    <p className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>{eventRoundLabel(event)}</p>
                    <Link to={`/race-weekend/${event.id}`} className="font-medium hover:underline">
                      {event.track_id ? names.tracks.get(event.track_id) ?? eventDisplayTitle(event) : eventDisplayTitle(event)}
                    </Link>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {[
                        event.event_date ? formatDate(event.event_date) : 'Date to be announced',
                        event.start_time ? event.start_time.slice(0, 5) : null,
                        selectedLeague && context.championship.classes_enabled && event.class_id ? names.classes.get(event.class_id) : null,
                        context.championship.regions_enabled && event.region_id ? names.regions.get(event.region_id) : null,
                        distanceText(event),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {event.id === current?.id && <Badge tone="accent">Current race</Badge>}
                    <Badge tone={TONE[event.status] ?? 'neutral'}>{EVENT_STATUS_LABEL[event.status]}</Badge>
                    {event.status === 'scheduled' && !upcoming && raceTemporality(event) === 'Completed' && <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Past</span>}
                  </div>
                </li>
              )
            })}
          </ol>
        </Card>
      )}
    </div>
  )
}

/** `/teams` — Championship ▸ Teams: jumps to the active season's team management. */
export function TeamsRedirect() {
  const { selectedLeague } = useLeagueSession()
  const leagueId = selectedLeague?.league.id ?? null
  const [target, setTarget] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!leagueId) return
    resolveActiveSeason(leagueId)
      .then((active) => setTarget(active ? `/seasons/${active.season.id}/teams` : null))
      .catch(() => setTarget(null))
  }, [leagueId])
  if (target === undefined) return <LoadingState label="Opening teams…" />
  if (target === null) return <Navigate to="/championships" replace />
  return <Navigate to={target} replace />
}
