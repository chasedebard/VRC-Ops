import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useAuth } from '@/hooks/useAuth'
import { loadResultEntryContext, eventSetupIssue, type ResultEntryContext } from '@/services/resultEntryData'
import {
  addScoreAdjustment,
  getEventClassIdsFor,
  getRaceResultSets,
  issuePenalty,
  saveResults,
  syncSeriesAwards,
  unlockResults,
} from '@/services/results'
import { getSeasonScoringOutputs } from '@/services/standings'
import { getSeasonEvents } from '@/services/events'
import { getLeagueMmrImpactSafe } from '@/services/mmrImpact'
import { standingsConfigForSeason } from '@/services/standingsData'
import { raceRowToDraft, seedMissingRaceDrafts } from '@/utils/resultDrafts'
import {
  RESULT_STATUS_LABEL,
  blocksSave,
  buildFinalizePayload,
  formatLapMs,
  formatRaceTimeMs,
  isClassifiedFinisher,
  isPoleManuallyOverridden,
  isResultSetEditable,
  lapsDown,
  lapsDownLabel,
  lapsDownValidationMessage,
  lapTimeValidationMessage,
  parseLapTimeMs,
  parseLapsDown,
  parseRaceTimeMs,
  raceTimeValidationMessage,
  resetPoleToQualifying,
  scoreRaceRows,
  selectPoleManually,
  syncPole,
  timeGapLabel,
  timeGapMs,
  toSaveRaceRow,
  validateFinalRace,
  validateRace,
  withLapsDown,
  withTimeGap,
  type GapType,
  type RaceRowDraft,
} from '@/utils/resultEntry'
import { eventScoreFromOutput, SubSeriesPlanner, type SeriesEventScores } from '@/utils/standingsEngine'
import { eventDisplayTitle, eventRoundLabel } from '@/utils/currentRace'
import type { ResultMmrImpact } from '@/types/mmr'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { Modal } from '@/components/Modal'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { RaceResultStatus } from '@/types/database'

const STATUSES: RaceResultStatus[] = ['fin', 'dnf', 'dns', 'dsq', 'classified', 'nc']
const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' } as const

/**
 * Race results (iOS race entry in `VRCResultEntryView` + `VRCResultsBrowseView`). One atomic Owner/Admin save
 * (`vrc_save_results`) persists the rows, this event's scoring outputs and the cumulative standings snapshots (Overall, every
 * Class and Region, Team), then reports the series states to the award ledger. Every rule the backend enforces is checked here
 * first — one classified P1 per class carrying the total race time, everyone else a gap (time or laps), a class on every row of a
 * multi-class event — so the editor names exactly what is missing. Everyone else sees the official result read-only, with the
 * finalized Global MMR delta per driver once the server has calculated it (never an estimate).
 */
export default function ResultsPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { permissions } = useLeagueSession()
  const { state } = useAuth()
  const userId = state.kind === 'authenticated' ? state.user.id : null
  const [ctx, setCtx] = useState<ResultEntryContext | null>(null)
  const [rows, setRows] = useState<RaceRowDraft[]>([])
  const [texts, setTexts] = useState<Record<string, { total: string; gap: string; laps: string; best: string }>>({})
  const [hasUnsavedPole, setHasUnsavedPole] = useState(false)
  const [impact, setImpact] = useState<ResultMmrImpact | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showUnlock, setShowUnlock] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [openRow, setOpenRow] = useState<string | null>(null)

  const canEdit = permissions.canApproveResults
  const editable = canEdit && isResultSetEditable(ctx?.raceSet)
  const locked = Boolean(ctx?.raceSet && !isResultSetEditable(ctx.raceSet))

  const flags = useMemo(
    () => ({
      teamsEnabled: ctx?.season.teams_enabled === true,
      classesEnabled: ctx?.championship.classes_enabled === true,
      regionsEnabled: ctx?.championship.regions_enabled === true,
    }),
    [ctx],
  )

  const load = useCallback(async () => {
    if (!eventId) return
    setError(null)
    try {
      const loaded = await loadResultEntryContext(eventId)
      setCtx(loaded)
      const isLocked = Boolean(loaded.raceSet && !isResultSetEditable(loaded.raceSet))
      let draft = loaded.raceRows.map(raceRowToDraft)
      if (canEdit && !isLocked) {
        draft = seedMissingRaceDrafts(draft, loaded.rosterDrivers, {
          dnsDriverIds: loaded.dnsDriverIds,
          roster: loaded.roster,
          flags: {
            teamsEnabled: loaded.season.teams_enabled,
            classesEnabled: loaded.championship.classes_enabled,
            regionsEnabled: loaded.championship.regions_enabled,
          },
        })
        const pole = loaded.qualifyingRows.find((q) => q.status === 'set' && q.position === 1)?.driver_id ?? null
        draft = syncPole(draft, pole)
      }
      setRows(draft)
      setHasUnsavedPole(false)
      setTexts(
        Object.fromEntries(
          draft.map((r) => [
            r.key,
            {
              total: formatRaceTimeMs(r.totalTimeMs) ?? '',
              gap: r.gapType === 'time' ? (formatRaceTimeMs(r.gapValue) ?? '') : '',
              laps: r.gapType === 'laps' ? String(r.gapValue ?? '') : '',
              best: formatLapMs(r.bestLapMs) ?? '',
            },
          ]),
        ),
      )
      if (loaded.raceSet?.official) {
        getLeagueMmrImpactSafe(loaded.raceSet.id).then(setImpact)
      } else {
        setImpact(null)
      }
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load results.'))
    } finally {
      setLoading(false)
    }
  }, [eventId, canEdit])

  useEffect(() => {
    void load()
  }, [load])

  const driverById = useMemo(() => new Map((ctx?.allDrivers ?? []).map((d) => [d.id, d])), [ctx])
  const classNameById = useMemo(() => new Map((ctx?.classes ?? []).map((c) => [c.id, c.name])), [ctx])
  const teamNameById = useMemo(() => new Map((ctx?.teams ?? []).map((t) => [t.id, t.name])), [ctx])
  const config = useMemo(() => standingsConfigForSeason(ctx?.season), [ctx])
  const adjustmentMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of ctx?.adjustments ?? []) if (a.driver_id) map.set(a.driver_id, (map.get(a.driver_id) ?? 0) + a.points_delta)
    return map
  }, [ctx])
  const preview = useMemo(() => scoreRaceRows(rows, config, adjustmentMap), [rows, config, adjustmentMap])
  const pointsByDriver = useMemo(() => new Map(preview.map((s) => [s.driverId, s.totalPoints])), [preview])

  const isMultiClass = (ctx?.eventClassIds.length ?? 0) > 1
  const singleClassId = ctx?.eventClassIds.length === 1 ? ctx.eventClassIds[0] : null
  const issue = ctx ? eventSetupIssue(ctx.event, ctx.eventClassIds) : null
  const validation = useMemo(() => {
    const base = validateRace(rows)
    const final = blocksSave(base) ? [] : validateFinalRace(rows, isMultiClass, singleClassId)
    const classIssue =
      isMultiClass && rows.some((r) => r.classId == null) ? [{ severity: 'error' as const, message: 'Assign a class to every result row before saving.' }] : []
    return [...base, ...classIssue, ...final]
  }, [rows, isMultiClass, singleClassId])

  const qualifyingPole = ctx?.qualifyingRows.find((q) => q.status === 'set' && q.position === 1)?.driver_id ?? null
  const poleManual = isPoleManuallyOverridden(rows)

  function updateRow(key: string, patch: Partial<RaceRowDraft>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  function setText(key: string, patch: Partial<{ total: string; gap: string; laps: string; best: string }>) {
    setTexts((prev) => ({ ...prev, [key]: { ...{ total: '', gap: '', laps: '', best: '' }, ...prev[key], ...patch } }))
  }

  function commitTotal(row: RaceRowDraft, text: string) {
    updateRow(row.key, { totalTimeMs: parseRaceTimeMs(text) })
  }
  function commitGap(row: RaceRowDraft, mode: GapType, text: string) {
    if (mode === 'time') setRows((prev) => prev.map((r) => (r.key === row.key ? withTimeGap(r, parseRaceTimeMs(text)) : r)))
    else setRows((prev) => prev.map((r) => (r.key === row.key ? withLapsDown(r, parseLapsDown(text)) : r)))
  }

  function togglePole(row: RaceRowDraft) {
    setRows((prev) => selectPoleManually(prev, row.earnedPole ? null : row.driverId))
    setHasUnsavedPole(true)
  }
  function toggleFastest(row: RaceRowDraft) {
    setRows((prev) => prev.map((r) => ({ ...r, fastestLap: r.key === row.key ? !row.fastestLap : false })))
  }
  function resetPole() {
    setRows((prev) => resetPoleToQualifying(prev, qualifyingPole))
    setHasUnsavedPole(true)
    setMessage('Pole reset to qualifying P1 — save the race result to persist.')
  }

  async function save() {
    if (!ctx) return
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const season = ctx.season
      // Cumulative: prior official events for the season + this event.
      const [prior, events] = await Promise.all([getSeasonScoringOutputs(season.id), getSeasonEvents(season.id)])
      const eventsById = new Map(events.map((e) => [e.id, e]))
      const rosterByDriver = new Map(ctx.roster.map((r) => [r.driver_id, r]))
      const byEvent = new Map<string, SeriesEventScores>()
      for (const o of prior) {
        if (o.event_id === ctx.event.id) continue
        const entry = byEvent.get(o.event_id) ?? { eventId: o.event_id, round: eventsById.get(o.event_id)?.round ?? 0, scores: [] }
        entry.scores.push(eventScoreFromOutput(o, eventsById.get(o.event_id), rosterByDriver.get(o.driver_id)))
        byEvent.set(o.event_id, entry)
      }
      // Planner: the event being saved is official the moment the save commits, so it is never "remaining".
      const official = new Set<string>([...byEvent.keys(), ctx.event.id])
      const undecided = events.map((e) => e.id).filter((id) => !official.has(id))
      let resultSets: { event_id: string; state: string }[] | null = null
      try {
        resultSets = await getRaceResultSets(undecided)
      } catch {
        resultSets = null
      }
      const officialIds = SubSeriesPlanner.officialEventIds(official, resultSets ?? [])
      const remaining = SubSeriesPlanner.unfinishedEvents(events, officialIds)
      let eventClassIds: Map<string, string[]> | null
      try {
        eventClassIds = await getEventClassIdsFor(remaining.map((e) => e.id))
      } catch {
        eventClassIds = null
      }
      const planner = new SubSeriesPlanner({
        seasonEvents: events,
        officialEventIds: officialIds,
        eventClassIds,
        eligibleDriverIds: new Set(ctx.rosterDrivers.map((d) => d.id)),
        isReliable: resultSets !== null && eventClassIds !== null,
      })
      const driverInfo = new Map(
        ctx.allDrivers.map((d) => [d.id, { name: d.display_name, number: rosterByDriver.get(d.id)?.number_override?.toString().trim() || (d.driver_number?.toString() ?? '') }]),
      )
      const payload = buildFinalizePayload({
        eventId: ctx.event.id,
        eventRound: ctx.event.round,
        thisScores: preview,
        priorEvents: Array.from(byEvent.values()),
        driverInfo,
        teamInfo: teamNameById,
        config,
        planner,
        championshipName: ctx.championship.name,
        classes: flags.classesEnabled ? ctx.classes.filter((c) => ctx.seasonClassIds.has(c.id)).map((c) => ({ id: c.id, name: c.name })) : [],
        regions: flags.regionsEnabled ? ctx.regions.filter((r) => ctx.seasonRegionIds.has(r.id)).map((r) => ({ id: r.id, name: r.name })) : [],
        teamsEnabled: flags.teamsEnabled,
        scheduleKnown: events.length > 0 && planner.isReliable,
      })
      await saveResults({
        eventId: ctx.event.id,
        kind: 'race',
        expectedRevision: ctx.raceSet?.revision ?? -1,
        rows: rows.map(toSaveRaceRow),
        scoringVersion: 1,
        outputs: payload.outputs as unknown as Record<string, unknown>[],
        snapshots: payload.snapshots as unknown as Record<string, unknown>[],
        reason: null,
      })
      // The result is official now: record / finalize / revoke series awards. Best-effort — the next Owner/Admin Standings load
      // reconciles anything this misses.
      if (payload.awardClaims.length > 0) void syncSeriesAwards(season.id, payload.awardClaims).catch(() => undefined)
      setMessage('Results saved — Official, published, and locked.')
      await load()
    } catch (err) {
      const raw = String((err as { message?: string })?.message ?? '')
      if (raw.includes('RESULT_VERSION_CONFLICT')) {
        setError('The result changed on another device. The latest version was loaded — review and try again.')
        await load()
      } else {
        setError(backendErrorMessage(err, 'Could not save race results.'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function unlock() {
    if (!ctx?.raceSet) return
    setBusy(true)
    setError(null)
    try {
      await unlockResults(ctx.raceSet.id, ctx.raceSet.revision, unlockReason.trim())
      setShowUnlock(false)
      setUnlockReason('')
      setMessage('Unlocked for editing — standings stay on the last saved results until you save again.')
      await load()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not unlock this result.'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState label="Loading results…" />
  if (error && !ctx) return <ErrorState message={error} onRetry={load} />
  if (!ctx) return <EmptyState title="Event not found" />

  const impactByDriver = new Map((impact?.drivers ?? []).map((d) => [d.driver_id, d]))
  const showImpact = impact && impact.calculation_state && impact.calculation_state !== 'coming_soon' && impact.calculation_state !== 'none'
  const officialRows = [...rows].sort((a, b) => (a.finishPosition ?? 999) - (b.finishPosition ?? 999))
  const editing = editable && !locked
  const display = editing ? rows : officialRows
  const nameOf = (id: string) => driverById.get(id)?.display_name ?? 'Driver'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link to={`/race-weekend/${ctx.event.id}`} className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
            ← {eventRoundLabel(ctx.event)} · {eventDisplayTitle(ctx.event)}
          </Link>
          <h1 className="text-2xl font-bold">Race results</h1>
        </div>
        <div className="flex items-center gap-2">
          {ctx.raceSet?.official ? <Badge tone="success">{locked ? 'Official · locked' : 'Official · unlocked for edit'}</Badge> : <Badge tone="neutral">{rows.length ? 'Draft' : 'No results yet'}</Badge>}
          {canEdit && ctx.raceSet && (
            <Link to={`/results/${ctx.event.id}/audit`} className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
              Audit log
            </Link>
          )}
        </div>
      </div>

      {issue && (
        <p role="alert" className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-warning)' }}>
          {issue}
        </p>
      )}
      {message && <p role="status" className="text-sm" style={{ color: 'var(--color-success)' }}>{message}</p>}
      {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}

      {display.length === 0 ? (
        <EmptyState
          title={canEdit ? 'No drivers on the season roster' : 'No official results yet'}
          description={canEdit ? 'Add drivers to the season before entering results.' : 'Official results appear here once an Owner or Admin saves them.'}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{editing ? 'Finishing order' : 'Official result'}</CardTitle>
            {editing && (
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {poleManual ? (hasUnsavedPole ? 'Pole manually overridden — save to persist' : 'Pole manually overridden') : qualifyingPole ? `Pole auto-set from qualifying P1: ${nameOf(qualifyingPole)}` : 'No qualifying pole yet'}
              </span>
            )}
          </CardHeader>

          {showImpact && impact && (
            <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }} role="status">
              {impact.calculation_state === 'processing'
                ? 'Global MMR impact is being calculated and will appear here once finalized.'
                : impact.calculation_state === 'finalized'
                  ? `Global MMR change per driver${impact.revised ? ' (updated after a correction)' : ''}.`
                  : (impact.insufficient_field_message ?? 'No Global MMR impact for this result.')}
            </p>
          )}

          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {display.map((row) => {
              const driver = driverById.get(row.driverId)
              const t = texts[row.key] ?? { total: '', gap: '', laps: '', best: '' }
              const winner = row.finishPosition === 1
              const needsGap = isClassifiedFinisher(row.status) && !winner && row.finishPosition != null
              const gapMode: GapType = row.gapType ?? 'time'
              const points = pointsByDriver.get(row.driverId) ?? 0
              const delta = impactByDriver.get(row.driverId)
              const expanded = openRow === row.key
              return (
                <li key={row.key} className="py-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="flex min-w-[10rem] flex-1 items-center gap-2 font-medium">
                      {editing ? null : <span className="w-6 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>{row.finishPosition ?? '—'}</span>}
                      {driver && <DriverAvatar driver={driver} size="sm" />}
                      <Link to={`/drivers/${row.driverId}`} className="hover:underline">
                        {nameOf(row.driverId)}
                      </Link>
                      {row.earnedPole && <Badge tone="accent">Pole</Badge>}
                      {row.fastestLap && <Badge tone="accent">FL</Badge>}
                      {row.classId && isMultiClass && <Badge tone="neutral">{classNameById.get(row.classId) ?? 'Class'}</Badge>}
                      {row.teamId && <Badge tone="neutral">{teamNameById.get(row.teamId) ?? 'Team'}</Badge>}
                    </span>

                    {editing ? (
                      <>
                        <label className="text-xs">
                          <span className="sr-only">Finish position for {nameOf(row.driverId)}</span>
                          <input
                            type="number"
                            min={1}
                            placeholder="Pos"
                            aria-label={`Finish position for ${nameOf(row.driverId)}`}
                            value={row.finishPosition ?? ''}
                            onChange={(e) => updateRow(row.key, { finishPosition: e.target.value ? Number(e.target.value) : null })}
                            className="w-16 rounded-lg border px-2 py-1 text-sm"
                            style={inputStyle}
                          />
                        </label>
                        <select
                          aria-label={`Status for ${nameOf(row.driverId)}`}
                          value={row.status}
                          onChange={(e) => {
                            const status = e.target.value as RaceResultStatus
                            updateRow(row.key, isClassifiedFinisher(status) ? { status } : { status, totalTimeMs: null, gapType: null, gapValue: null })
                          }}
                          className="rounded-lg border px-2 py-1 text-sm"
                          style={inputStyle}
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>{RESULT_STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={row.fastestLap} onChange={() => toggleFastest(row)} /> FL
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input type="checkbox" checked={row.earnedPole} onChange={() => togglePole(row)} /> Pole
                        </label>
                        <span className="w-14 text-right text-xs tabular-nums" aria-label={`Points preview ${points}`}>
                          {points} pts
                        </span>
                        <Button variant="ghost" aria-expanded={expanded} onClick={() => setOpenRow(expanded ? null : row.key)}>
                          {expanded ? 'Less' : 'More'}
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="w-24 text-xs uppercase" style={{ color: 'var(--color-text-muted)' }}>{RESULT_STATUS_LABEL[row.status]}</span>
                        <span className="w-28 font-mono text-xs">
                          {winner ? formatRaceTimeMs(row.totalTimeMs) : (lapsDownLabel(lapsDown(row)) ?? timeGapLabel(timeGapMs(row)))}
                        </span>
                        <span className="w-16 text-right tabular-nums">{points} pts</span>
                        {showImpact && impact?.calculation_state === 'finalized' && delta?.final_delta != null && (
                          <span
                            className="w-14 text-right text-xs font-bold tabular-nums"
                            style={{ color: delta.final_delta > 0 ? 'var(--color-success)' : delta.final_delta < 0 ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
                            title={`Global MMR ${delta.mmr_display_status === 'revised' ? '(updated) ' : ''}change`}
                          >
                            {delta.final_delta >= 0 ? '+' : ''}
                            {delta.final_delta} MMR
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {editing && isClassifiedFinisher(row.status) && row.finishPosition != null && (
                    <div className="mt-2 grid gap-2 pl-0 text-xs sm:grid-cols-[auto_1fr]">
                      {winner ? (
                        <label className="block sm:col-span-2">
                          <span className="mb-0.5 block font-medium">Total race time (required — P1 for their class)</span>
                          <input
                            value={t.total}
                            aria-invalid={Boolean(raceTimeValidationMessage(t.total))}
                            placeholder="e.g. 43:12.408"
                            onChange={(e) => setText(row.key, { total: e.target.value })}
                            onBlur={(e) => commitTotal(row, e.target.value)}
                            className="w-44 rounded-lg border px-2 py-1 font-mono text-sm"
                            style={inputStyle}
                          />
                          {raceTimeValidationMessage(t.total) && <span className="ml-2" style={{ color: 'var(--color-danger)' }}>{raceTimeValidationMessage(t.total)}</span>}
                        </label>
                      ) : needsGap ? (
                        <>
                          <label className="block">
                            <span className="mb-0.5 block font-medium">Gap to leader</span>
                            <select
                              aria-label={`Gap representation for ${nameOf(row.driverId)}`}
                              value={gapMode}
                              onChange={(e) => {
                                const mode = e.target.value as GapType
                                // Switching modes discards the other field so a stale value can never be submitted.
                                setText(row.key, { gap: '', laps: '' })
                                updateRow(row.key, { gapType: mode, gapValue: null })
                              }}
                              className="rounded-lg border px-2 py-1 text-sm"
                              style={inputStyle}
                            >
                              <option value="time">Time behind leader</option>
                              <option value="laps">Laps down</option>
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-0.5 block font-medium">{gapMode === 'time' ? 'Time behind leader' : 'Laps down'} (required)</span>
                            <input
                              value={gapMode === 'time' ? t.gap : t.laps}
                              aria-invalid={Boolean(gapMode === 'time' ? raceTimeValidationMessage(t.gap) : lapsDownValidationMessage(t.laps))}
                              placeholder={gapMode === 'time' ? 'e.g. +12.408 or 1:02.115' : 'e.g. 1'}
                              onChange={(e) => setText(row.key, gapMode === 'time' ? { gap: e.target.value } : { laps: e.target.value })}
                              onBlur={(e) => commitGap(row, gapMode, e.target.value)}
                              className="w-44 rounded-lg border px-2 py-1 font-mono text-sm"
                              style={inputStyle}
                            />
                            <span className="ml-2" style={{ color: 'var(--color-danger)' }}>
                              {gapMode === 'time' ? raceTimeValidationMessage(t.gap) : lapsDownValidationMessage(t.laps)}
                            </span>
                            {gapMode === 'laps' && parseLapsDown(t.laps) !== null && (
                              <span className="ml-2" style={{ color: 'var(--color-text-muted)' }}>Saves as “{lapsDownLabel(parseLapsDown(t.laps))}”.</span>
                            )}
                          </label>
                        </>
                      ) : null}
                    </div>
                  )}
                  {editing && !isClassifiedFinisher(row.status) && (
                    <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {RESULT_STATUS_LABEL[row.status]} results don&apos;t need a race time or gap.
                    </p>
                  )}

                  {editing && expanded && (
                    <div className="mt-2 grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-3" style={{ borderColor: 'var(--color-border)' }}>
                      <NumberField label="Start position" value={row.startPosition} onChange={(v) => updateRow(row.key, { startPosition: v })} />
                      <NumberField label="Laps completed" value={row.lapsCompleted} onChange={(v) => updateRow(row.key, { lapsCompleted: v })} />
                      <label className="block">
                        <span className="mb-0.5 block font-medium">Best lap</span>
                        <input
                          value={t.best}
                          placeholder="1:43.208"
                          aria-invalid={Boolean(lapTimeValidationMessage(t.best))}
                          onChange={(e) => setText(row.key, { best: e.target.value })}
                          onBlur={(e) => updateRow(row.key, { bestLapMs: parseLapTimeMs(e.target.value) })}
                          className="w-full rounded-lg border px-2 py-1 font-mono text-sm"
                          style={inputStyle}
                        />
                        {lapTimeValidationMessage(t.best) && <span style={{ color: 'var(--color-danger)' }}>{lapTimeValidationMessage(t.best)}</span>}
                      </label>
                      <NumberField label="Bonus points" value={row.bonusPoints} allowNegative onChange={(v) => updateRow(row.key, { bonusPoints: v ?? 0 })} />
                      <NumberField label="Penalty points" value={row.penaltyPoints} onChange={(v) => updateRow(row.key, { penaltyPoints: Math.max(0, v ?? 0) })} />
                      {flags.teamsEnabled && (
                        <label className="block">
                          <span className="mb-0.5 block font-medium">Result team</span>
                          <select
                            value={row.teamId ?? ''}
                            onChange={(e) => updateRow(row.key, { teamId: e.target.value || null })}
                            className="w-full rounded-lg border px-2 py-1 text-sm"
                            style={inputStyle}
                          >
                            <option value="">None</option>
                            {ctx.teams.map((team) => (
                              <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                          </select>
                        </label>
                      )}
                      {isMultiClass ? (
                        <label className="block">
                          <span className="mb-0.5 block font-medium">Result class (required)</span>
                          <select
                            value={row.classId ?? ''}
                            onChange={(e) => updateRow(row.key, { classId: e.target.value || null })}
                            className="w-full rounded-lg border px-2 py-1 text-sm"
                            style={inputStyle}
                          >
                            <option value="">Select a class</option>
                            {ctx.eventClassIds.map((id) => (
                              <option key={id} value={id}>{classNameById.get(id) ?? 'Class'}</option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        singleClassId && (
                          <p className="sm:col-span-1" style={{ color: 'var(--color-text-muted)' }}>
                            Class: {classNameById.get(singleClassId) ?? 'Event class'} (inherited)
                          </p>
                        )
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          {editing && validation.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm" aria-label="Validation">
              {validation.map((v) => (
                <li key={v.message} role={v.severity === 'error' ? 'alert' : undefined} style={{ color: v.severity === 'error' ? 'var(--color-danger)' : 'var(--color-warning)' }}>
                  {v.message}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {editing && (
              <>
                <Button onClick={save} disabled={busy || blocksSave(validation) || Boolean(issue)}>
                  {busy ? 'Saving…' : 'Save — make Official'}
                </Button>
                {qualifyingPole && poleManual && (
                  <Button variant="secondary" onClick={resetPole} disabled={busy}>
                    Reset pole to qualifying
                  </Button>
                )}
              </>
            )}
            {canEdit && locked && (
              <Button variant="secondary" onClick={() => setShowUnlock(true)} disabled={busy}>
                Unlock to edit
              </Button>
            )}
            {!canEdit && (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Only an Owner or Admin can enter or change race results.
              </p>
            )}
          </div>
        </Card>
      )}

      {canEdit && ctx.raceSet && (
        <ExtraAdjustments ctx={ctx} userId={userId} onChanged={load} nameOf={nameOf} />
      )}

      {showUnlock && (
        <Modal title="Unlock this result for correction?" onClose={() => !busy && setShowUnlock(false)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Standings and predictions keep consuming the last saved official result until you save again. The reason is recorded in the audit log.
          </p>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium">Reason</span>
            <input value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" style={inputStyle} />
          </label>
          <div className="mt-4 flex gap-2">
            <Button onClick={unlock} disabled={busy || !unlockReason.trim()}>{busy ? 'Unlocking…' : 'Unlock'}</Button>
            <Button variant="secondary" onClick={() => setShowUnlock(false)} disabled={busy}>Cancel</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function NumberField({ label, value, onChange, allowNegative = false }: { label: string; value: number | null; onChange: (v: number | null) => void; allowNegative?: boolean }) {
  return (
    <label className="block">
      <span className="mb-0.5 block font-medium">{label}</span>
      <input
        type="number"
        min={allowNegative ? undefined : 0}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className="w-full rounded-lg border px-2 py-1 text-sm"
        style={inputStyle}
      />
    </label>
  )
}

/** Penalties and manual score adjustments for this event (Owner/Admin). Adjustments stay separate from earned points and record a reason. */
function ExtraAdjustments({
  ctx,
  userId,
  onChanged,
  nameOf,
}: {
  ctx: ResultEntryContext
  userId: string | null
  onChanged: () => Promise<void>
  nameOf: (id: string) => string
}) {
  const [driverId, setDriverId] = useState(ctx.rosterDrivers[0]?.id ?? '')
  const [points, setPoints] = useState('')
  const [reason, setReason] = useState('')
  const [penaltyType, setPenaltyType] = useState('Time penalty')
  const [penaltyPoints, setPenaltyPoints] = useState('')
  const [penaltyReason, setPenaltyReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function addAdjustment(e: React.FormEvent) {
    e.preventDefault()
    if (!userId || !driverId) return
    setBusy(true)
    setError(null)
    try {
      await addScoreAdjustment({ event_id: ctx.event.id, league_id: ctx.event.league_id, driver_id: driverId, points_delta: Number(points), reason: reason.trim(), acting_user: userId })
      setPoints('')
      setReason('')
      await onChanged()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not record the adjustment.'))
    } finally {
      setBusy(false)
    }
  }

  async function addPenalty(e: React.FormEvent) {
    e.preventDefault()
    if (!driverId) return
    setBusy(true)
    setError(null)
    try {
      await issuePenalty({
        event_id: ctx.event.id,
        league_id: ctx.event.league_id,
        driver_id: driverId,
        penalty_type: penaltyType,
        time_penalty_ms: 0,
        position_penalty: 0,
        point_deduction: Number(penaltyPoints) || 0,
        disqualification: false,
        reason: penaltyReason.trim(),
        issued_by: userId,
      })
      setPenaltyPoints('')
      setPenaltyReason('')
      await onChanged()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not record the penalty.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Score adjustments</CardTitle>
        </CardHeader>
        <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Manual adjustments stay separate from earned points and are recorded with a reason. They apply when results are next saved.
        </p>
        <ul className="mb-3 space-y-1 text-sm">
          {ctx.adjustments.length === 0 && <li style={{ color: 'var(--color-text-muted)' }}>None recorded.</li>}
          {ctx.adjustments.map((a) => (
            <li key={a.id}>
              {a.driver_id ? nameOf(a.driver_id) : 'Driver'}: <strong>{a.points_delta >= 0 ? '+' : ''}{a.points_delta}</strong> — {a.reason}
            </li>
          ))}
        </ul>
        <form onSubmit={addAdjustment} className="space-y-2 text-sm">
          <DriverSelect value={driverId} onChange={setDriverId} ctx={ctx} />
          <input aria-label="Points delta" type="number" required placeholder="Points (e.g. -3)" value={points} onChange={(e) => setPoints(e.target.value)} className="w-full rounded-lg border px-2 py-1" style={inputStyle} />
          <input aria-label="Reason" required placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full rounded-lg border px-2 py-1" style={inputStyle} />
          <Button type="submit" variant="secondary" disabled={busy || !points || !reason.trim()}>Add adjustment</Button>
        </form>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Penalties</CardTitle>
        </CardHeader>
        <ul className="mb-3 space-y-1 text-sm">
          {ctx.penalties.length === 0 && <li style={{ color: 'var(--color-text-muted)' }}>None issued.</li>}
          {ctx.penalties.map((p) => (
            <li key={p.id}>
              {p.driver_id ? nameOf(p.driver_id) : 'Driver'}: {p.penalty_type ?? 'Penalty'}
              {p.point_deduction ? ` (−${p.point_deduction} pts)` : ''} — {p.reason}
            </li>
          ))}
        </ul>
        <form onSubmit={addPenalty} className="space-y-2 text-sm">
          <DriverSelect value={driverId} onChange={setDriverId} ctx={ctx} />
          <input aria-label="Penalty type" value={penaltyType} onChange={(e) => setPenaltyType(e.target.value)} className="w-full rounded-lg border px-2 py-1" style={inputStyle} />
          <input aria-label="Point deduction" type="number" min={0} placeholder="Point deduction" value={penaltyPoints} onChange={(e) => setPenaltyPoints(e.target.value)} className="w-full rounded-lg border px-2 py-1" style={inputStyle} />
          <input aria-label="Penalty reason" required placeholder="Reason (required)" value={penaltyReason} onChange={(e) => setPenaltyReason(e.target.value)} className="w-full rounded-lg border px-2 py-1" style={inputStyle} />
          <Button type="submit" variant="secondary" disabled={busy || !penaltyReason.trim()}>Issue penalty</Button>
        </form>
        {error && <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      </Card>
    </div>
  )
}

function DriverSelect({ value, onChange, ctx }: { value: string; onChange: (v: string) => void; ctx: ResultEntryContext }) {
  return (
    <select aria-label="Driver" value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border px-2 py-1" style={inputStyle}>
      {ctx.allDrivers.map((d) => (
        <option key={d.id} value={d.id}>{d.display_name}</option>
      ))}
    </select>
  )
}
