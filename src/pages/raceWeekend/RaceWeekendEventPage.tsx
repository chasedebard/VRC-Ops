import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getEvent } from '@/services/events'
import { getEventSession, subscribeToEventSession, transitionSession } from '@/services/raceControl'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDate } from '@/utils/format'
import type { EventRow, EventSessionRow, SessionState } from '@/types/database'

const NEXT_STATE: Partial<Record<SessionState, { target: SessionState; label: string }>> = {
  scheduled: { target: 'qualifying_active', label: 'Start qualifying' },
  practice_available: { target: 'qualifying_active', label: 'Start qualifying' },
  qualifying_active: { target: 'qualifying_complete', label: 'End qualifying' },
  qualifying_complete: { target: 'race_ready', label: 'Ready to race' },
  race_ready: { target: 'race_active', label: 'Start race' },
  race_active: { target: 'race_complete', label: 'End race' },
  race_complete: { target: 'results_pending', label: 'Submit for results' },
}

export default function RaceWeekendEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { permissions } = useLeagueSession()
  const [event, setEvent] = useState<EventRow | null | undefined>(undefined)
  const [session, setSession] = useState<EventSessionRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!eventId) return
    setError(null)
    try {
      const [e, s] = await Promise.all([getEvent(eventId), getEventSession(eventId)])
      setEvent(e)
      setSession(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this event.')
    }
  }

  useEffect(() => {
    load()
    if (!eventId) return
    return subscribeToEventSession(eventId, setSession)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  async function advance() {
    if (!eventId || !session) return
    const next = NEXT_STATE[session.state]
    if (!next) return
    setBusy(true)
    try {
      const updated = await transitionSession(eventId, session.version, next.target, null)
      setSession(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the session state.')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (event === undefined) return <LoadingState />
  if (event === null) return <EmptyState title="Event not found" />

  const next = session ? NEXT_STATE[session.state] : NEXT_STATE.scheduled

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Round {event.round} {event.custom_title ? `— ${event.custom_title}` : ''}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {formatDate(event.event_date)}
          </p>
        </div>
        <Badge tone="neutral">{session?.state ?? 'scheduled'}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link to={`/race-prep/${event.id}`}>
          <Card className="h-full transition hover:shadow-md">
            <CardHeader>
              <CardTitle>Race Prep</CardTitle>
            </CardHeader>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Practice pace leaderboard from parsed telemetry.
            </p>
          </Card>
        </Link>
        <Link to={`/qualifying/${event.id}`}>
          <Card className="h-full transition hover:shadow-md">
            <CardHeader>
              <CardTitle>Qualifying</CardTitle>
            </CardHeader>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Qualifying order and pole position.
            </p>
          </Card>
        </Link>
        <Link to={`/results/${event.id}`}>
          <Card className="h-full transition hover:shadow-md">
            <CardHeader>
              <CardTitle>Results</CardTitle>
            </CardHeader>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Official race results and points.
            </p>
          </Card>
        </Link>
      </div>

      {permissions.canOperateRaceControl && (
        <Card>
          <CardHeader>
            <CardTitle>Race control</CardTitle>
          </CardHeader>
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Current state: <strong>{session?.state ?? 'scheduled'}</strong>
          </p>
          {next ? (
            <Button onClick={advance} disabled={busy}>
              {busy ? 'Updating…' : next.label}
            </Button>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No further transitions from this state.
            </p>
          )}
        </Card>
      )}
    </div>
  )
}
