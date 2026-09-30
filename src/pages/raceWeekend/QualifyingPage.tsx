import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { loadResultEntryContext, eventSetupIssue, type ResultEntryContext } from '@/services/resultEntryData'
import { saveResults, unlockResults } from '@/services/results'
import { getQualifyingCandidates } from '@/services/racePrep'
import { qualifyingRowToDraft, seedMissingQualifyingDrafts } from '@/utils/resultDrafts'
import {
  blocksSave,
  formatLapMs,
  isResultSetEditable,
  lapTimeValidationMessage,
  normalizeQualifyingPole,
  orderQualifyingByLapTime,
  parseLapTimeMs,
  toSaveQualifyingRow,
  validateQualifying,
  type QualifyingRowDraft,
} from '@/utils/resultEntry'
import { eventDisplayTitle, eventRoundLabel } from '@/utils/currentRace'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { Modal } from '@/components/Modal'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { DriverRow } from '@/types/database'

const TELEMETRY_NOTE = 'Parsed telemetry'
const MANUAL_NOTE = 'Manual admin entry'
const OVERRIDE_NOTE = 'Admin override'

/**
 * Qualifying (iOS qualifying entry in `VRCResultEntryView`). Owners/Admins classify the active season roster — position, best
 * lap, gap to pole, grid adjustment and penalty positions — and save it Official in one atomic `vrc_save_results` call, which
 * also wires pole into the race result. Everyone else sees the official classification read-only. Telemetry-derived best laps
 * only prefill empty draft cells; provenance is recorded in the row note exactly as iOS does.
 */
export default function QualifyingPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { permissions } = useLeagueSession()
  const [ctx, setCtx] = useState<ResultEntryContext | null>(null)
  const [rows, setRows] = useState<QualifyingRowDraft[]>([])
  const [lapText, setLapText] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showUnlock, setShowUnlock] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')

  const canEdit = permissions.canApproveResults
  const editable = canEdit && isResultSetEditable(ctx?.qualifyingSet)
  const locked = Boolean(ctx?.qualifyingSet && !isResultSetEditable(ctx.qualifyingSet))

  const load = useCallback(async () => {
    if (!eventId) return
    setError(null)
    try {
      const loaded = await loadResultEntryContext(eventId)
      setCtx(loaded)
      let draft = loaded.qualifyingRows.map(qualifyingRowToDraft)
      const isLocked = Boolean(loaded.qualifyingSet && !isResultSetEditable(loaded.qualifyingSet))
      if (canEdit && !isLocked) {
        draft = seedMissingQualifyingDrafts(draft, loaded.rosterDrivers, loaded.dnsDriverIds)
        // Telemetry-derived candidates prefill empty best laps in editable drafts only.
        try {
          const candidates = new Map((await getQualifyingCandidates(loaded.event.id)).map((c) => [c.driver_id, c.fastest_ms]))
          draft = normalizeQualifyingPole(
            draft.map((r) =>
              r.status === 'set' && r.bestLapMs == null && candidates.has(r.driverId)
                ? { ...r, bestLapMs: candidates.get(r.driverId) as number, notes: TELEMETRY_NOTE }
                : r,
            ),
          )
        } catch {
          // Missing telemetry never blocks manual entry.
        }
      } else {
        draft = normalizeQualifyingPole(draft)
      }
      setRows(draft)
      setLapText(Object.fromEntries(draft.map((r) => [r.key, formatLapMs(r.bestLapMs) ?? ''])))
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load qualifying.'))
    } finally {
      setLoading(false)
    }
  }, [eventId, canEdit])

  useEffect(() => {
    void load()
  }, [load])

  const driverById = useMemo(() => new Map((ctx?.allDrivers ?? []).map((d) => [d.id, d])), [ctx])
  const issue = ctx ? eventSetupIssue(ctx.event, ctx.eventClassIds) : null
  const validation = validateQualifying(rows)

  function update(key: string, patch: Partial<QualifyingRowDraft>) {
    setRows((prev) => normalizeQualifyingPole(prev.map((r) => (r.key === key ? { ...r, ...patch } : r))))
  }

  function commitLap(row: QualifyingRowDraft, text: string) {
    const ms = parseLapTimeMs(text)
    const changed = ms !== row.bestLapMs
    const note = !changed
      ? row.notes
      : ms === null
        ? [TELEMETRY_NOTE, MANUAL_NOTE, OVERRIDE_NOTE].includes(row.notes ?? '')
          ? null
          : row.notes
        : row.notes === TELEMETRY_NOTE || row.notes === OVERRIDE_NOTE
          ? OVERRIDE_NOTE
          : MANUAL_NOTE
    update(row.key, { bestLapMs: ms, notes: note })
  }

  function autoOrder() {
    setRows((prev) => orderQualifyingByLapTime(prev))
  }

  async function save() {
    if (!ctx) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const normalized = normalizeQualifyingPole(rows)
      const updated = await saveResults({
        eventId: ctx.event.id,
        kind: 'qualifying',
        expectedRevision: ctx.qualifyingSet?.revision ?? -1,
        rows: normalized.map(toSaveQualifyingRow),
        scoringVersion: 1,
        outputs: [],
        snapshots: [],
        reason: null,
      })
      void updated
      setMessage('Qualifying saved — Official, published, and locked. Pole updated from P1.')
      await load()
    } catch (err) {
      const text = backendErrorMessage(err, 'Could not save qualifying results.')
      setError(
        String((err as { message?: string })?.message ?? '').includes('RESULT_VERSION_CONFLICT')
          ? 'The result changed on another device. The latest version was loaded — review and try again.'
          : text,
      )
      if (String((err as { message?: string })?.message ?? '').includes('RESULT_VERSION_CONFLICT')) await load()
    } finally {
      setBusy(false)
    }
  }

  async function unlock() {
    if (!ctx?.qualifyingSet) return
    setBusy(true)
    setError(null)
    try {
      await unlockResults(ctx.qualifyingSet.id, ctx.qualifyingSet.revision, unlockReason.trim())
      setShowUnlock(false)
      setUnlockReason('')
      setMessage('Qualifying unlocked for editing — active season drivers restored.')
      await load()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not unlock qualifying.'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState label="Loading qualifying…" />
  if (error && !ctx) return <ErrorState message={error} onRetry={load} />
  if (!ctx) return <EmptyState title="Event not found" />

  const ordered = [...rows].sort((a, b) => (a.position ?? 999) - (b.position ?? 999))
  const display = editable && !locked ? rows : ordered

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link to={`/race-weekend/${ctx.event.id}`} className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
            ← {eventRoundLabel(ctx.event)} · {eventDisplayTitle(ctx.event)}
          </Link>
          <h1 className="text-2xl font-bold">Qualifying</h1>
        </div>
        <div className="flex items-center gap-2">
          {ctx.qualifyingSet?.official ? <Badge tone="success">{locked ? 'Official · locked' : 'Official · unlocked for edit'}</Badge> : <Badge tone="neutral">Draft</Badge>}
        </div>
      </div>

      {issue && (
        <p role="alert" className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-warning)' }}>
          {issue}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm" style={{ color: 'var(--color-success)' }}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {display.length === 0 ? (
        <EmptyState
          title={canEdit ? 'No drivers on the season roster' : 'No qualifying results yet'}
          description={canEdit ? 'Add drivers to the season before entering qualifying.' : 'Official qualifying appears here once an Owner or Admin saves it.'}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Classification</CardTitle>
            {editable && !locked && (
              <Button variant="secondary" onClick={autoOrder} disabled={!rows.some((r) => r.status === 'set' && r.bestLapMs != null)}>
                Order by lap time
              </Button>
            )}
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Qualifying classification</caption>
              <thead>
                <tr style={{ color: 'var(--color-text-muted)' }}>
                  <th scope="col" className="pb-2 pr-3">Pos</th>
                  <th scope="col" className="pb-2 pr-3">Driver</th>
                  <th scope="col" className="pb-2 pr-3">Status</th>
                  <th scope="col" className="pb-2 pr-3">Best lap</th>
                  <th scope="col" className="pb-2 pr-3">Gap to pole</th>
                  {editable && !locked && (
                    <>
                      <th scope="col" className="pb-2 pr-3">Grid adj.</th>
                      <th scope="col" className="pb-2 pr-3">Penalty pos.</th>
                    </>
                  )}
                  <th scope="col" className="pb-2 pr-3"><span className="sr-only">Pole</span></th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {display.map((row) => {
                  const driver = driverById.get(row.driverId) as DriverRow | undefined
                  const lapError = lapTimeValidationMessage(lapText[row.key] ?? '')
                  const editing = editable && !locked
                  return (
                    <tr key={row.key}>
                      <td className="py-2 pr-3">
                        {editing ? (
                          <input
                            aria-label={`Qualifying position for ${driver?.display_name ?? 'driver'}`}
                            type="number"
                            min={1}
                            disabled={row.status !== 'set'}
                            value={row.position ?? ''}
                            onChange={(e) => update(row.key, { position: e.target.value ? Number(e.target.value) : null })}
                            className="w-16 rounded-lg border px-2 py-1"
                            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                          />
                        ) : (
                          (row.position ?? '—')
                        )}
                      </td>
                      <td className="py-2 pr-3 font-medium">
                        <span className="flex items-center gap-2">
                          {driver && <DriverAvatar driver={driver} size="sm" />}
                          {driver?.display_name ?? 'Driver'}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        {editing ? (
                          <select
                            aria-label={`Status for ${driver?.display_name ?? 'driver'}`}
                            value={row.status}
                            onChange={(e) => {
                              const status = e.target.value as QualifyingRowDraft['status']
                              update(row.key, { status, position: status === 'set' ? row.position : null })
                            }}
                            className="rounded-lg border px-2 py-1"
                            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                          >
                            <option value="set">Classified</option>
                            <option value="dns">DNS</option>
                            <option value="dsq">DSQ</option>
                          </select>
                        ) : (
                          <span className="uppercase">{row.status === 'set' ? 'Classified' : row.status}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {editing ? (
                          <div>
                            <input
                              aria-label={`Best lap for ${driver?.display_name ?? 'driver'}`}
                              aria-invalid={Boolean(lapError)}
                              inputMode="decimal"
                              placeholder="1:43.208"
                              disabled={row.status !== 'set'}
                              value={lapText[row.key] ?? ''}
                              onChange={(e) => setLapText((prev) => ({ ...prev, [row.key]: e.target.value }))}
                              onBlur={(e) => commitLap(row, e.target.value)}
                              className="w-28 rounded-lg border px-2 py-1 font-mono"
                              style={{ borderColor: lapError ? 'var(--color-danger)' : 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                            />
                            {lapError && <p className="mt-1 text-xs" style={{ color: 'var(--color-danger)' }}>{lapError}</p>}
                            {row.notes && [TELEMETRY_NOTE, MANUAL_NOTE, OVERRIDE_NOTE].includes(row.notes) && (
                              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>{row.notes}</p>
                            )}
                          </div>
                        ) : (
                          <span className="font-mono">{formatLapMs(row.bestLapMs) ?? '—'}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 font-mono">
                        {editing ? (
                          <input
                            aria-label={`Gap to pole in milliseconds for ${driver?.display_name ?? 'driver'}`}
                            type="number"
                            min={0}
                            disabled={row.status !== 'set'}
                            value={row.gapMs ?? ''}
                            onChange={(e) => update(row.key, { gapMs: e.target.value ? Number(e.target.value) : null })}
                            className="w-24 rounded-lg border px-2 py-1"
                            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                          />
                        ) : row.gapMs ? (
                          `+${(row.gapMs / 1000).toFixed(3)}`
                        ) : (
                          '—'
                        )}
                      </td>
                      {editing && (
                        <>
                          <td className="py-2 pr-3">
                            <input
                              aria-label={`Grid adjustment for ${driver?.display_name ?? 'driver'}`}
                              type="number"
                              value={row.gridAdjustment}
                              onChange={(e) => update(row.key, { gridAdjustment: Number(e.target.value) || 0 })}
                              className="w-16 rounded-lg border px-2 py-1"
                              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              aria-label={`Penalty positions for ${driver?.display_name ?? 'driver'}`}
                              type="number"
                              min={0}
                              value={row.penaltyPositions}
                              onChange={(e) => update(row.key, { penaltyPositions: Math.max(0, Number(e.target.value) || 0) })}
                              className="w-16 rounded-lg border px-2 py-1"
                              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                            />
                          </td>
                        </>
                      )}
                      <td className="py-2 pr-3">{row.status === 'set' && row.position === 1 && <Badge tone="accent">Pole</Badge>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {editable && !locked && validation.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm" aria-label="Validation">
              {validation.map((v) => (
                <li key={v.message} role={v.severity === 'error' ? 'alert' : undefined} style={{ color: v.severity === 'error' ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                  {v.message}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {editable && !locked && (
              <Button onClick={save} disabled={busy || blocksSave(validation) || Boolean(issue)}>
                {busy ? 'Saving…' : 'Save — make Official'}
              </Button>
            )}
            {canEdit && locked && (
              <Button variant="secondary" onClick={() => setShowUnlock(true)} disabled={busy}>
                Unlock to edit
              </Button>
            )}
            {!canEdit && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Only an Owner or Admin can enter or change qualifying results.
              </p>
            )}
          </div>
        </Card>
      )}

      {showUnlock && (
        <Modal title="Unlock qualifying for correction?" onClose={() => !busy && setShowUnlock(false)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Standings and predictions keep using the last saved official classification until you save again. The reason is recorded in the audit log.
          </p>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium">Reason</span>
            <input
              value={unlockReason}
              onChange={(e) => setUnlockReason(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            />
          </label>
          <div className="mt-4 flex gap-2">
            <Button onClick={unlock} disabled={busy || !unlockReason.trim()}>
              {busy ? 'Unlocking…' : 'Unlock'}
            </Button>
            <Button variant="secondary" onClick={() => setShowUnlock(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
