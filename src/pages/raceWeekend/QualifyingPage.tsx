import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getEvent, getEventDrivers } from '@/services/events'
import { getDrivers } from '@/services/drivers'
import { getQualifyingResults, getResultSet, saveResults } from '@/services/results'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatLapTime, parseLapTime } from '@/utils/format'
import type { DriverRow, QualifyingResultRow, QualifyingStatus, ResultSetRow } from '@/types/database'

interface RowState {
  driverId: string
  displayName: string
  lapTimeText: string
  status: QualifyingStatus
}

export default function QualifyingPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { selectedLeague, permissions } = useLeagueSession()
  const [resultSet, setResultSet] = useState<ResultSetRow | null>(null)
  const [saved, setSaved] = useState<QualifyingResultRow[]>([])
  const [rows, setRows] = useState<RowState[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!eventId || !selectedLeague) return
    setError(null)
    try {
      const event = await getEvent(eventId)
      if (!event) throw new Error('Event not found.')
      const [eventDrivers, allDrivers, set] = await Promise.all([
        getEventDrivers(eventId),
        getDrivers(selectedLeague.league.id, false),
        getResultSet(eventId, 'qualifying'),
      ])
      setResultSet(set)
      const driverIds = eventDrivers.length > 0 ? new Set(eventDrivers.map((d) => d.driver_id)) : null
      const roster: DriverRow[] = driverIds ? allDrivers.filter((d) => driverIds.has(d.id)) : allDrivers
      const existing = set ? await getQualifyingResults(set.id) : []
      setSaved(existing)

      setRows(
        roster.map((driver) => {
          const prior = existing.find((r) => r.driver_id === driver.id)
          return {
            driverId: driver.id,
            displayName: driver.display_name,
            lapTimeText: prior?.best_lap_ms != null ? formatLapTime(prior.best_lap_ms) : '',
            status: prior?.status ?? 'set',
          }
        }),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load qualifying.')
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

  async function handleSave() {
    if (!eventId) return
    setBusy(true)
    setError(null)
    try {
      const timed = rows
        .filter((r) => r.status === 'set')
        .map((r) => ({ ...r, ms: parseLapTime(r.lapTimeText) }))
        .filter((r) => r.ms != null)
        .sort((a, b) => a.ms! - b.ms!)

      const payloadRows = [
        ...timed.map((r, index) => ({
          driver_id: r.driverId,
          position: index + 1,
          best_lap_ms: r.ms,
          status: 'set',
        })),
        ...rows
          .filter((r) => r.status !== 'set')
          .map((r) => ({ driver_id: r.driverId, position: null, best_lap_ms: null, status: r.status })),
      ]

      const updated = await saveResults({
        eventId,
        kind: 'qualifying',
        expectedRevision: resultSet?.revision ?? 0,
        rows: payloadRows,
        scoringVersion: 1,
        outputs: [],
        snapshots: [],
        reason: 'Web qualifying entry',
      })
      setResultSet(updated)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save qualifying results.')
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
        <h1 className="text-2xl font-bold">Qualifying</h1>
        {resultSet?.official && <Badge tone="success">Official</Badge>}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No drivers assigned" description="Assign drivers to this event before entering qualifying." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Lap times</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.driverId} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm" style={{ borderColor: 'var(--color-border)' }}>
                <span className="w-40 font-medium">{row.displayName}</span>
                <input
                  type="text"
                  placeholder="1:23.456"
                  disabled={!canEdit || row.status !== 'set'}
                  value={row.lapTimeText}
                  onChange={(e) => updateRow(row.driverId, { lapTimeText: e.target.value })}
                  className="w-32 rounded-lg border px-2 py-1 font-mono"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                />
                <select
                  disabled={!canEdit}
                  value={row.status}
                  onChange={(e) => updateRow(row.driverId, { status: e.target.value as QualifyingStatus })}
                  className="rounded-lg border px-2 py-1"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                >
                  <option value="set">Set</option>
                  <option value="dns">DNS</option>
                  <option value="dsq">DSQ</option>
                </select>
              </div>
            ))}
          </div>
          {canEdit && (
            <Button className="mt-4" onClick={handleSave} disabled={busy}>
              {busy ? 'Saving…' : 'Save qualifying — make official'}
            </Button>
          )}
        </Card>
      )}

      {saved.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Pole position is assigned automatically to P1 unless manually overridden on the results screen.
        </p>
      )}
    </div>
  )
}
