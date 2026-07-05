import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getChampionship, getSeason } from '@/services/championships'
import { createEvent, getSeasonEvents } from '@/services/events'
import { getTracks } from '@/services/tracks'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDate } from '@/utils/format'
import type { ChampionshipRow, EventRow, SeasonRow, TrackRow } from '@/types/database'

const EVENT_STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  scheduled: 'neutral',
  live: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  postponed: 'warning',
  archived: 'neutral',
}

export default function SeasonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { selectedLeague, permissions } = useLeagueSession()
  const [season, setSeason] = useState<SeasonRow | null>(null)
  const [championship, setChampionship] = useState<ChampionshipRow | null>(null)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [tracks, setTracks] = useState<TrackRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [round, setRound] = useState(1)
  const [trackId, setTrackId] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!id || !selectedLeague) return
    setError(null)
    try {
      const s = await getSeason(id)
      setSeason(s)
      if (s) {
        const [c, ev] = await Promise.all([getChampionship(s.championship_id), getSeasonEvents(id)])
        setChampionship(c)
        setEvents(ev)
        if (c) setTracks(await getTracks(c.game_id, selectedLeague.league.id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load season.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, selectedLeague?.league.id])

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!season || !selectedLeague) return
    setBusy(true)
    try {
      await createEvent({
        league_id: selectedLeague.league.id,
        championship_id: season.championship_id,
        season_id: season.id,
        round,
        track_id: trackId || null,
        event_date: eventDate || null,
        status: 'scheduled',
      })
      setShowCreate(false)
      setRound((r) => r + 1)
      setTrackId('')
      setEventDate('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create event.')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (season === null || events === null) return <LoadingState />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {season.name} {season.year ? `(${season.year})` : ''}
        </h1>
        {championship && (
          <Link to={`/championships/${championship.id}`} className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
            {championship.name}
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Race calendar</CardTitle>
          {permissions.canManageMembers && (
            <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New event'}</Button>
          )}
        </CardHeader>

        {showCreate && (
          <form onSubmit={handleCreateEvent} className="mb-4 grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field
              label="Round"
              type="number"
              value={round}
              onChange={(e) => setRound(Number(e.target.value))}
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Track</span>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
              >
                <option value="">Select a track…</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.layout ? `– ${t.layout}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
            <Button type="submit" disabled={busy || !round}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </form>
        )}

        {events.length === 0 ? (
          <EmptyState title="No events scheduled" description="Add your first race weekend to this season." />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {events
              .slice()
              .sort((a, b) => a.round - b.round)
              .map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <Link to={`/race-weekend/${event.id}`} className="font-medium hover:underline">
                      Round {event.round}
                      {event.custom_title ? ` — ${event.custom_title}` : ''}
                    </Link>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {formatDate(event.event_date)}
                    </p>
                  </div>
                  <Badge tone={EVENT_STATUS_TONE[event.status]}>{event.status}</Badge>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
