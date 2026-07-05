import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getEvent, getEventDrivers } from '@/services/events'
import { getSeasonEvents } from '@/services/events'
import { getDrivers } from '@/services/drivers'
import { getQualifyingResults, getRaceResults, getResultSet, saveResults } from '@/services/results'
import { getSeasonScoringOutputs } from '@/services/standings'
import {
  DEFAULT_SCORING_RULE,
  buildSeasonStandingsRows,
  pointsForResult,
} from '@/utils/scoring'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type {
  DriverRow,
  RaceResultRow,
  RaceResultStatus,
  ResultSetRow,
  ScoringOutputRow,
} from '@/types/database'

interface RowState {
  driverId: string
  displayName: string
  finishPosition: string
  status: RaceResultStatus
  fastestLap: boolean
  earnedPole: boolean
}

export default function ResultsPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { selectedLeague, permissions } = useLeagueSession()
  const [resultSet, setResultSet] = useState<ResultSetRow | null>(null)
  const [rows, setRows] = useState<RowState[]>([])
  const [poleDriverId, setPoleDriverId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [seasonId, setSeasonId] = useState<string | null>(null)

  async function load() {
    if (!eventId || !selectedLeague) return
    setError(null)
    try {
      const event = await getEvent(eventId)
      if (!event) throw new Error('Event not found.')
      setSeasonId(event.season_id)

      const [eventDrivers, allDrivers, set, qualifying] = await Promise.all([
        getEventDrivers(eventId),
        getDrivers(selectedLeague.league.id, false),
        getResultSet(eventId, 'race'),
        getQualifyingResults((await getResultSet(eventId, 'qualifying'))?.id ?? '').catch(() => []),
      ])
      setResultSet(set)
      const driverIds = eventDrivers.length > 0 ? new Set(eventDrivers.map((d) => d.driver_id)) : null
      const roster: DriverRow[] = driverIds ? allDrivers.filter((d) => driverIds.has(d.id)) : allDrivers
      const existing: RaceResultRow[] = set ? await getRaceResults(set.id) : []

      const qualifyingPole = qualifying.find((q) => q.position === 1 && q.status === 'set')?.driver_id ?? null
      const overriddenPole = existing.find((r) => r.earned_pole)?.driver_id ?? null
      setPoleDriverId(overriddenPole ?? qualifyingPole)

      setRows(
        roster.map((driver) => {
          const prior = existing.find((r) => r.driver_id === driver.id)
          return {
            driverId: driver.id,
            displayName: driver.display_name,
            finishPosition: prior?.finish_position != null ? String(prior.finish_position) : '',
            status: prior?.status ?? 'fin',
            fastestLap: prior?.fastest_lap ?? false,
            earnedPole: prior?.driver_id === (overriddenPole ?? qualifyingPole),
          }
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load results.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, selectedLeague?.league.id])

  function updateRow(driverId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.driverId === driverId ? { ...r, ...patch } : r)))
  }

  function setFastestLap(driverId: string) {
    setRows((prev) => prev.map((r) => ({ ...r, fastestLap: r.driverId === driverId })))
  }

  function setPole(driverId: string) {
    setPoleDriverId(driverId)
  }

  async function handleSave() {
    if (!eventId || !seasonId || !selectedLeague) return
    setBusy(true)
    setError(null)
    try {
      const raceRowsForScoring: RaceResultRow[] = rows.map((r) => ({
        id: '',
        result_set_id: '',
        league_id: selectedLeague.league.id,
        driver_id: r.driverId,
        finish_position: r.finishPosition ? Number(r.finishPosition) : null,
        start_position: null,
        laps_completed: null,
        total_time_ms: null,
        gap_ms: null,
        best_lap_ms: null,
        fastest_lap: r.fastestLap,
        earned_pole: r.driverId === poleDriverId,
        pole_manually_overridden: false,
        status: r.status,
        bonus_points: 0,
        penalty_points: 0,
        team_id: null,
        class_id: null,
        region_id: null,
        notes: null,
        created_at: '',
        updated_at: '',
      }))

      const payloadRows = raceRowsForScoring.map((r) => ({
        driver_id: r.driver_id,
        finish_position: r.finish_position,
        status: r.status,
        fastest_lap: r.fastest_lap,
        earned_pole: r.earned_pole,
        bonus_points: r.bonus_points,
        penalty_points: r.penalty_points,
      }))

      const thisEventOutputs: ScoringOutputRow[] = raceRowsForScoring.map((r) => ({
        id: '',
        event_id: eventId,
        league_id: selectedLeague.league.id,
        season_id: seasonId,
        championship_id: '',
        driver_id: r.driver_id,
        earned_points: pointsForResult(r, DEFAULT_SCORING_RULE),
        adjustment_points: 0,
        total_points: pointsForResult(r, DEFAULT_SCORING_RULE),
        finish_position: r.finish_position,
        status: r.status,
        earned_pole: r.earned_pole,
        fastest_lap: r.fastest_lap,
        is_team_event: false,
        class_id: null,
        region_id: null,
        team_id: null,
        scoring_version: 1,
        created_at: '',
      }))

      const [otherOutputs, seasonEvents] = await Promise.all([
        getSeasonScoringOutputs(seasonId),
        getSeasonEvents(seasonId),
      ])
      const mergedOutputs = [
        ...otherOutputs.filter((o) => o.event_id !== eventId),
        ...thisEventOutputs,
      ]
      const displayNames = new Map(rows.map((r) => [r.driverId, r.displayName]))
      const standingsRows = buildSeasonStandingsRows(mergedOutputs, displayNames, seasonEvents.length)

      const updated = await saveResults({
        eventId,
        kind: 'race',
        expectedRevision: resultSet?.revision ?? 0,
        rows: payloadRows,
        scoringVersion: 1,
        outputs: thisEventOutputs.map((o) => ({
          driver_id: o.driver_id,
          earned_points: o.earned_points,
          adjustment_points: o.adjustment_points,
          total_points: o.total_points,
          finish_position: o.finish_position,
          status: o.status,
          earned_pole: o.earned_pole,
          fastest_lap: o.fastest_lap,
        })),
        snapshots: [
          {
            standings_type: 'overall',
            group_key: null,
            rows: standingsRows,
          },
        ],
        reason: 'Web race result entry',
      })
      setResultSet(updated)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save race results.')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (loading) return <LoadingState />

  const canEdit = permissions.canSubmitResults

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Results</h1>
        {resultSet?.official && <Badge tone="success">Official</Badge>}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No drivers assigned" description="Assign drivers to this event before entering results." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Finishing order</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.driverId} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
                <span className="w-40 font-medium">{row.displayName}</span>
                <input
                  type="number"
                  placeholder="Pos"
                  disabled={!canEdit}
                  value={row.finishPosition}
                  onChange={(e) => updateRow(row.driverId, { finishPosition: e.target.value })}
                  className="w-16 rounded-lg border px-2 py-1"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                />
                <select
                  disabled={!canEdit}
                  value={row.status}
                  onChange={(e) => updateRow(row.driverId, { status: e.target.value as RaceResultStatus })}
                  className="rounded-lg border px-2 py-1"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                >
                  <option value="fin">FIN</option>
                  <option value="dnf">DNF</option>
                  <option value="dns">DNS</option>
                  <option value="dsq">DSQ</option>
                  <option value="classified">Classified</option>
                  <option value="nc">NC</option>
                </select>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="fastest-lap"
                    disabled={!canEdit}
                    checked={row.fastestLap}
                    onChange={() => setFastestLap(row.driverId)}
                  />
                  Fastest lap
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="pole"
                    disabled={!canEdit}
                    checked={poleDriverId === row.driverId}
                    onChange={() => setPole(row.driverId)}
                  />
                  Pole
                </label>
              </div>
            ))}
          </div>
          {canEdit && (
            <Button className="mt-4" onClick={handleSave} disabled={busy}>
              {busy ? 'Saving…' : 'Save results — make official'}
            </Button>
          )}
        </Card>
      )}
    </div>
  )
}
