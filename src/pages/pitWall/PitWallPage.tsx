import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { getSeasonEvents } from '@/services/events'
import {
  getCapturedRuns,
  getEngineeringState,
  getPitWallWeekend,
  getSetupBoard,
  getWeekendProgrammes,
  type CapturedRunRow,
  type PitWallWeekend,
} from '@/services/pitWall'
import { eventDisplayTitle, eventRoundLabel, resolveCurrentRace } from '@/utils/currentRace'
import {
  PACKAGE_STATUS_LABEL,
  PROGRAMME_STATUS_LABEL,
  RUN_STATUS_LABEL,
  formatSetupValue,
  humanizeKey,
  pitWallErrorMessage,
  statusLabel,
  type EngineeringState,
  type PitWallProgramme,
  type PitWallProgrammes,
  type SetupBoard,
  type SetupSnapshot,
  type TestPackage,
} from '@/utils/pitWallModel'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDateTime } from '@/utils/format'
import type { EventRow } from '@/types/database'

type Tab = 'overview' | 'setup' | 'history'
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'setup', label: 'Setup' },
  { key: 'history', label: 'History' },
]

/**
 * Pit Wall (iOS Pit Wall V3 workspace, web edition). Read-only by design and honest about it: the workspace's capture, garage-arrival,
 * run-card and Engineering Call evaluation flows are driven by native GT7 telemetry and setup screens, which a browser cannot provide.
 * This page shows the canonical state those flows have already saved for the signed-in driver — Overview, Setup and History — exactly as
 * the server returned it. Nothing on it is computed locally, and nothing is shown for a weekend that has not been started on a device.
 * Route-level `ProGate` enforces the Pro / League Plus entitlement (registry: `pitWall` requires Pro).
 */
export default function PitWallPage() {
  const { selectedLeague } = useLeagueSession()
  const [params, setParams] = useSearchParams()
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [weekend, setWeekend] = useState<PitWallWeekend | null | undefined>(undefined)
  const [programmes, setProgrammes] = useState<PitWallProgrammes | null>(null)
  const [programmeId, setProgrammeId] = useState<string | null>(null)
  const [board, setBoard] = useState<SetupBoard | null>(null)
  const [engineering, setEngineering] = useState<EngineeringState | null>(null)
  const [runs, setRuns] = useState<CapturedRunRow[]>([])
  const [partial, setPartial] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')

  const eventParam = params.get('event')

  const loadEvents = useCallback(async () => {
    if (!selectedLeague) return
    try {
      const active = await resolveActiveSeason(selectedLeague.league.id)
      setEvents(active ? await getSeasonEvents(active.season.id) : [])
    } catch (err) {
      setError(pitWallErrorMessage(err))
    }
  }, [selectedLeague])

  useEffect(() => {
    void loadEvents()
  }, [loadEvents])

  const operable = useMemo(() => (events ?? []).filter((e) => e.status !== 'archived' && e.status !== 'cancelled'), [events])
  const ordered = useMemo(() => [...operable].sort((a, b) => a.round - b.round), [operable])
  const current = useMemo(() => resolveCurrentRace(operable), [operable])
  const event = ordered.find((e) => e.id === eventParam) ?? current ?? ordered[0] ?? null
  const eventId = event?.id ?? null

  const loadWeekend = useCallback(async () => {
    if (!eventId) return
    setError(null)
    setWeekend(undefined)
    setProgrammes(null)
    setProgrammeId(null)
    try {
      const w = await getPitWallWeekend(eventId)
      setWeekend(w)
      if (!w) return
      const list = await getWeekendProgrammes(w.id)
      setProgrammes(list)
      setProgrammeId(list.activeProgrammeId ?? list.programmes[0]?.id ?? null)
      setRuns(await getCapturedRuns(w.id).catch(() => []))
    } catch (err) {
      setError(pitWallErrorMessage(err))
    }
  }, [eventId])

  useEffect(() => {
    void loadWeekend()
  }, [loadWeekend])

  useEffect(() => {
    if (!weekend || !programmeId) {
      setBoard(null)
      setEngineering(null)
      return
    }
    let cancelled = false
    // Each read is independent: a partial failure still renders what loaded, and says which part is missing.
    Promise.allSettled([getSetupBoard(weekend.id, programmeId), getEngineeringState(weekend.id, programmeId)]).then(([b, e]) => {
      if (cancelled) return
      const failed: string[] = []
      setBoard(b.status === 'fulfilled' ? b.value : null)
      setEngineering(e.status === 'fulfilled' ? e.value : null)
      if (b.status === 'rejected') failed.push('setup')
      if (e.status === 'rejected') failed.push('engineering call')
      setPartial(failed)
    })
    return () => {
      cancelled = true
    }
  }, [weekend, programmeId])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={loadWeekend} />
  if (events === null) return <LoadingState label="Loading Pit Wall…" />

  const programme = programmes?.programmes.find((p) => p.id === programmeId) ?? null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Pit Wall</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Your engineering state for the weekend, as saved by the VRC Ops app.
          </p>
        </div>
        {ordered.length > 0 && (
          <label className="text-sm">
            <span className="sr-only">Event</span>
            <select
              value={eventId ?? ''}
              onChange={(e) => setParams({ event: e.target.value })}
              className="rounded-lg border bg-transparent px-2 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {ordered.map((e) => (
                <option key={e.id} value={e.id}>
                  {eventRoundLabel(e)} · {eventDisplayTitle(e)}
                  {e.id === current?.id ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <p role="note" className="rounded-lg border p-3 text-xs" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
        Pit Wall on the web is read-only. Capturing telemetry, arriving in the garage, recording runs and evaluating Engineering Calls happen in the
        iPhone/iPad app (or on Android) while you are driving — a browser cannot receive Gran Turismo 7 telemetry. Nothing here is estimated or
        computed by the website.
      </p>

      {!event ? (
        <EmptyState title="No events" description="Pit Wall follows the active season's schedule. Add an event to begin." />
      ) : weekend === undefined ? (
        <LoadingState label="Loading weekend…" />
      ) : weekend === null ? (
        <EmptyState
          title="No Pit Wall weekend for this event"
          description="Start this weekend from Pit Wall in the VRC Ops app. Once it has a car programme, its state appears here."
        />
      ) : !programmes || programmes.programmes.length === 0 ? (
        <EmptyState title="No car programme yet" description="Pick a car for this weekend in the VRC Ops app to begin your programme." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Car programme">
            {programmes.programmes.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProgrammeId(p.id)}
                aria-pressed={p.id === programmeId}
                className="rounded-full border px-3 py-1 text-sm"
                style={{
                  borderColor: p.id === programmeId ? 'var(--color-accent)' : 'var(--color-border)',
                  backgroundColor: p.id === programmeId ? 'var(--color-accent)' : 'transparent',
                  color: p.id === programmeId ? 'var(--color-accent-contrast)' : 'var(--color-text)',
                }}
              >
                {p.carName}
                {p.competingClassName ? ` · ${p.competingClassName}` : ''}
              </button>
            ))}
          </div>

          <div role="tablist" aria-label="Pit Wall sections" className="flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
            {TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className="px-3 py-2 text-sm font-medium"
                style={{
                  borderBottom: `2px solid ${tab === t.key ? 'var(--color-accent)' : 'transparent'}`,
                  opacity: tab === t.key ? 1 : 0.7,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>

          {partial.length > 0 && (
            <p role="status" className="text-sm" style={{ color: 'var(--color-warning)' }}>
              Couldn&apos;t read {partial.join(' and ')} right now — that section is empty rather than guessed.
            </p>
          )}

          {programme && tab === 'overview' && <Overview programme={programme} board={board} engineering={engineering} />}
          {programme && tab === 'setup' && <Setup board={board} />}
          {tab === 'history' && <History runs={runs} />}
        </>
      )}
    </div>
  )
}

function Overview({ programme, board, engineering }: { programme: PitWallProgramme; board: SetupBoard | null; engineering: EngineeringState | null }) {
  const call = engineering?.call ?? null
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{programme.carName}</CardTitle>
          <Badge tone={programme.lifecycleStatus === 'race_package_locked' ? 'warning' : 'accent'}>
            {statusLabel(PROGRAMME_STATUS_LABEL, programme.lifecycleStatus)}
          </Badge>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <Fact label="Competing class" value={programme.competingClassName ?? 'Not set'} />
          <Fact label="GT7 class" value={programme.carGtClass ?? '—'} />
          <Fact label="Baseline" value={programme.hasBaseline ? 'Recorded' : 'Not recorded'} />
          <Fact label="Current setup" value={programme.hasConfirmedCurrent ? 'Confirmed' : 'Not confirmed'} />
          <Fact label="Sessions" value={String(programme.sessionCount)} />
          <Fact label="Active session" value={programme.activeSession ? programme.activeSession.displayName : 'None'} />
          <Fact label="Run cards" value={String(programme.runCardCount)} />
          <Fact label="Reports" value={String(programme.reportCount)} />
        </dl>
        {programme.hasLockedRacePackage && (
          <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            The race package is locked for this programme.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Engineering call</CardTitle>
          {engineering?.pace && <Badge tone="neutral">Pace: {humanizeKey(engineering.pace.value)}</Badge>}
        </CardHeader>
        {call ? (
          <div className="space-y-2 text-sm">
            <p>
              <strong>{call.nextActionType ? humanizeKey(call.nextActionType) : 'Engineering call'}</strong>
              {call.confidence && <span style={{ color: 'var(--color-text-muted)' }}> · {humanizeKey(call.confidence)} confidence</span>}
            </p>
            {call.nextActionDetail && <p>{call.nextActionDetail}</p>}
            {call.primaryHypothesis && <Fact label="Hypothesis" value={call.primaryHypothesis} block />}
            {call.expectedBenefit && <Fact label="Expected benefit" value={call.expectedBenefit} block />}
            {call.expectedRisk && <Fact label="Expected risk" value={call.expectedRisk} block />}
            {call.validationRequirement && <Fact label="Validation" value={call.validationRequirement} block />}
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {call.supportingEvidence.length} supporting · {call.contradictingEvidence.length} contradicting evidence item
              {call.supportingEvidence.length + call.contradictingEvidence.length === 1 ? '' : 's'}.
            </p>
          </div>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No engineering call has been issued yet. The app issues one from your captured evidence.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setup status</CardTitle>
        </CardHeader>
        <ul className="space-y-1 text-sm">
          <li>Baseline: {board?.baseline ? `recorded ${board.baseline.observedAt ? formatDateTime(board.baseline.observedAt) : ''}` : 'not recorded'}</li>
          <li>Current: {board?.current ? humanizeKey(board.current.lifecycleStatus) : 'not recorded'}</li>
          <li>
            Open package:{' '}
            {(engineering?.activePackage ?? board?.activePackage)
              ? statusLabel(PACKAGE_STATUS_LABEL, (engineering?.activePackage ?? board?.activePackage)?.status ?? '')
              : 'none'}
          </li>
        </ul>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Engineering queue</CardTitle>
          <Badge tone={engineering && engineering.questions.length > 0 ? 'warning' : 'neutral'}>{engineering?.questions.length ?? 0} open</Badge>
        </CardHeader>
        {engineering && engineering.questions.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {engineering.questions.map((q) => (
              <li key={q.id}>
                <p>{q.question}</p>
                {q.requiredEvidence && (
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Needs: {q.requiredEvidence}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No open engineering questions.
          </p>
        )}
      </Card>
    </div>
  )
}

function Setup({ board }: { board: SetupBoard | null }) {
  if (!board || (!board.baseline && !board.current && !board.activePackage)) {
    return <EmptyState title="No setup recorded" description="Record your baseline setup on arrival in the garage, in the app." />
  }
  return (
    <div className="space-y-4">
      {board.activePackage && <PackageCard pkg={board.activePackage} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <SnapshotCard title="Baseline" snapshot={board.baseline} />
        <SnapshotCard title="Current" snapshot={board.current} />
      </div>
    </div>
  )
}

function SnapshotCard({ title, snapshot }: { title: string; snapshot: SetupSnapshot | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {snapshot && <Badge tone="neutral">{humanizeKey(snapshot.lifecycleStatus)}</Badge>}
      </CardHeader>
      {!snapshot ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Not recorded.
        </p>
      ) : (
        <>
          <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {snapshot.observedAt ? `Observed ${formatDateTime(snapshot.observedAt)} · ` : ''}Source: {humanizeKey(snapshot.source)}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {snapshot.values.map((v) => (
                  <tr key={v.parameterKey}>
                    <th scope="row" className="py-1.5 pr-3 font-normal" style={{ color: 'var(--color-text-muted)' }}>
                      {humanizeKey(v.parameterKey)}
                    </th>
                    <td className="py-1.5 font-mono">{formatSetupValue(v.value, v.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  )
}

function PackageCard({ pkg }: { pkg: TestPackage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Test package</CardTitle>
        <div className="flex items-center gap-2">
          <Badge tone="neutral">{pkg.sourceLabel}</Badge>
          <Badge tone="accent">{statusLabel(PACKAGE_STATUS_LABEL, pkg.status)}</Badge>
          {pkg.driverModified && <Badge tone="warning">Driver modified</Badge>}
        </div>
      </CardHeader>
      {pkg.primaryHypothesis && <p className="mb-2 text-sm">{pkg.primaryHypothesis}</p>}
      {pkg.manualReason && <p className="mb-2 text-sm">Reason: {pkg.manualReason}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: 'var(--color-text-muted)' }}>
              <th className="pb-2 pr-3">Parameter</th>
              <th className="pb-2 pr-3">From</th>
              <th className="pb-2 pr-3">To</th>
              <th className="pb-2 pr-3">Applied</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {pkg.changes.map((c) => (
              <tr key={c.parameterKey}>
                <th scope="row" className="py-1.5 pr-3 font-normal">
                  {humanizeKey(c.parameterKey)}
                </th>
                <td className="py-1.5 pr-3 font-mono">{formatSetupValue(c.currentValue, c.unit)}</td>
                <td className="py-1.5 pr-3 font-mono">{formatSetupValue(c.targetValue, c.unit)}</td>
                <td className="py-1.5 pr-3">
                  {c.actualConfirmedValue !== null ? formatSetupValue(c.actualConfirmedValue, c.unit) : c.executionStatus ? humanizeKey(c.executionStatus) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {(pkg.expectedBenefit || pkg.expectedRisk || pkg.validationRequirement) && (
        <dl className="mt-3 space-y-1 text-sm">
          {pkg.expectedBenefit && <Fact label="Expected benefit" value={pkg.expectedBenefit} block />}
          {pkg.expectedRisk && <Fact label="Expected risk" value={pkg.expectedRisk} block />}
          {pkg.validationRequirement && <Fact label="Validation" value={pkg.validationRequirement} block />}
        </dl>
      )}
    </Card>
  )
}

function History({ runs }: { runs: CapturedRunRow[] }) {
  if (runs.length === 0) {
    return <EmptyState title="No captured runs" description="Runs you capture in the app are listed here with their parsed summary." />
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Captured runs</CardTitle>
      </CardHeader>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr style={{ color: 'var(--color-text-muted)' }}>
              <th className="pb-2 pr-4">Started</th>
              <th className="pb-2 pr-4">Status</th>
              <th className="pb-2 pr-4">Laps</th>
              <th className="pb-2 pr-4">Tyre</th>
              <th className="pb-2 pr-4">Fuel (L)</th>
              <th className="pb-2 pr-4">Data quality</th>
              <th className="pb-2 pr-4">Debrief</th>
            </tr>
          </thead>
          <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {runs.map((run) => (
              <tr key={run.id}>
                <td className="py-2 pr-4">{run.started_at ? formatDateTime(run.started_at) : '—'}</td>
                <td className="py-2 pr-4">{statusLabel(RUN_STATUS_LABEL, run.capture_status)}</td>
                <td className="py-2 pr-4">
                  {run.detected_completed_lap_count}
                  {run.expected_lap_count !== null ? ` / ${run.expected_lap_count}` : ''}
                </td>
                <td className="py-2 pr-4">{run.tyre_compound_key ? humanizeKey(run.tyre_compound_key) : '—'}</td>
                <td className="py-2 pr-4 font-mono">
                  {run.fuel_start_liters !== null ? run.fuel_start_liters : '—'} → {run.fuel_end_liters !== null ? run.fuel_end_liters : '—'}
                </td>
                <td className="py-2 pr-4">
                  <Badge tone={run.data_quality_status === 'valid' ? 'success' : run.data_quality_status === 'invalid' ? 'danger' : 'warning'}>
                    {humanizeKey(run.data_quality_status)}
                  </Badge>
                </td>
                <td className="py-2 pr-4">{humanizeKey(run.driver_debrief_status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function Fact({ label, value, block = false }: { label: string; value: string; block?: boolean }) {
  return block ? (
    <p>
      <span style={{ color: 'var(--color-text-muted)' }}>{label}: </span>
      {value}
    </p>
  ) : (
    <>
      <dt style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  )
}
