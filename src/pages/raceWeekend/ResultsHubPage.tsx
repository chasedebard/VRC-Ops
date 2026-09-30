import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { getSeasonEvents } from '@/services/events'
import { getRaceResults, getResultSetsForEvents } from '@/services/results'
import { getDrivers } from '@/services/drivers'
import { eventDisplayTitle, eventRoundLabel } from '@/utils/currentRace'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDate } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { DriverRow, EventRow, RaceResultRow, ResultSetRow, SeasonRow } from '@/types/database'

const PODIUM_TINT = ['#C8A23A', '#8A9099', '#B07A45']

/**
 * Results → Latest (iOS `VRCResultsBrowseView`): the most recent official race result at a glance (podium), then every round of the
 * active season with its qualifying/race status. Each round opens `/results/:eventId` — the full classification for everyone, and
 * the entry sheet for Owner/Admin/Marshal.
 */
export default function ResultsHubPage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const [season, setSeason] = useState<SeasonRow | null | undefined>(undefined)
  const [events, setEvents] = useState<EventRow[]>([])
  const [sets, setSets] = useState<ResultSetRow[]>([])
  const [drivers, setDrivers] = useState<Map<string, DriverRow>>(new Map())
  const [podium, setPodium] = useState<RaceResultRow[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!selectedLeague) return
    setError(null)
    try {
      const active = await resolveActiveSeason(selectedLeague.league.id)
      setSeason(active?.season ?? null)
      if (!active) return
      const list = await getSeasonEvents(active.season.id)
      setEvents(list)
      const [resultSets, driverList] = await Promise.all([
        getResultSetsForEvents(list.map((e) => e.id)).catch(() => [] as ResultSetRow[]),
        getDrivers(selectedLeague.league.id, true).catch(() => [] as DriverRow[]),
      ])
      setSets(resultSets)
      setDrivers(new Map(driverList.map((d) => [d.id, d])))
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load results.'))
    }
  }, [selectedLeague])

  useEffect(() => {
    void load()
  }, [load])

  const raceSets = useMemo(() => new Map(sets.filter((s) => s.kind === 'race').map((s) => [s.event_id, s])), [sets])
  const qualSets = useMemo(() => new Map(sets.filter((s) => s.kind === 'qualifying').map((s) => [s.event_id, s])), [sets])
  const ordered = useMemo(
    () => [...events].filter((e) => e.status !== 'archived').sort((a, b) => b.round - a.round),
    [events],
  )
  // The latest round whose race result is official.
  const latest = useMemo(() => ordered.find((e) => raceSets.get(e.id)?.official) ?? null, [ordered, raceSets])
  const latestSetId = latest ? raceSets.get(latest.id)?.id : undefined

  useEffect(() => {
    let cancelled = false
    setPodium([])
    if (!latestSetId) return
    getRaceResults(latestSetId)
      .then((rows) => {
        if (!cancelled) setPodium(rows.filter((r) => r.status === 'fin' && r.finish_position !== null && r.finish_position <= 3).slice(0, 3))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [latestSetId])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (season === undefined) return <LoadingState label="Loading results…" />
  if (season === null) {
    return <EmptyState title="No active season" description="Official results appear here once a season has rounds." />
  }

  const canEnter = permissions.canSubmitResults

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Results</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {season.name} · official results and points.
          {!canEnter && ' Your role can view official results but cannot enter or edit them.'}
        </p>
      </div>

      {latest ? (
        <Card>
          <CardHeader>
            <CardTitle>Latest official result</CardTitle>
            <Badge tone="success">Official</Badge>
          </CardHeader>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
            {eventRoundLabel(latest)}
          </p>
          <p className="text-lg font-bold">{eventDisplayTitle(latest)}</p>
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {formatDate(latest.event_date)}
          </p>
          {podium.length > 0 && (
            <ol className="mb-3 grid gap-2 sm:grid-cols-3">
              {podium.map((row) => {
                const driver = drivers.get(row.driver_id)
                const place = row.finish_position ?? 0
                return (
                  <li key={row.id} className="flex items-center gap-2 rounded-lg border p-2" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="w-6 text-center text-lg font-bold" style={{ color: PODIUM_TINT[place - 1] }} aria-label={`Position ${place}`}>
                      {place}
                    </span>
                    {driver && <DriverAvatar driver={driver} size="sm" />}
                    <span className="min-w-0 truncate text-sm font-medium">{driver?.display_name ?? 'Unknown driver'}</span>
                  </li>
                )
              })}
            </ol>
          )}
          <Link to={`/results/${latest.id}`} className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
            Full classification
          </Link>
        </Card>
      ) : (
        <EmptyState title="No official results yet" description="Official race results will appear here once a race is finalized." />
      )}

      {ordered.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All rounds</CardTitle>
          </CardHeader>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {ordered.map((event) => {
              const race = raceSets.get(event.id)
              const qual = qualSets.get(event.id)
              return (
                <li key={event.id}>
                  <Link to={`/results/${event.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm hover:underline">
                    <span className="font-medium">
                      {eventRoundLabel(event)} · {eventDisplayTitle(event)}
                    </span>
                    <span className="flex items-center gap-2">
                      <span style={{ color: 'var(--color-text-muted)' }}>{formatDate(event.event_date)}</span>
                      {qual && <Badge tone={qual.official ? 'success' : 'neutral'}>{qual.official ? 'Qualifying official' : 'Qualifying draft'}</Badge>}
                      {race && <Badge tone={race.official ? 'success' : 'warning'}>{race.official ? 'Race official' : 'Race pending'}</Badge>}
                      {!race && !qual && <Badge tone="neutral">No results</Badge>}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </div>
  )
}
