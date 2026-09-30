import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getEvent } from '@/services/events'
import {
  addSessionNote,
  getEventSession,
  getSessionAudit,
  getSessionNotes,
  subscribeToEventSession,
  transitionSession,
} from '@/services/raceControl'
import { getResultSet } from '@/services/results'
import { getTracks } from '@/services/tracks'
import { getChampionship } from '@/services/championships'
import {
  NORMAL_TARGETS,
  SESSION_LABEL,
  availableSessionActions,
  isTerminalForPhase,
  requiresQualifyingResults,
  sessionActionFor,
  stageStatus,
  type WeekendStage,
} from '@/utils/sessionModel'
import { eventDisplayTitle, eventRoundLabel } from '@/utils/currentRace'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDate, formatDateTime } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { EventRow, EventSessionAuditRow, EventSessionNoteRow, EventSessionRow, SessionState } from '@/types/database'

const STAGES: { key: WeekendStage; label: string }[] = [
  { key: 'practice', label: 'Practice' },
  { key: 'qualifying', label: 'Qualifying' },
  { key: 'race', label: 'Race' },
]

const STATE_TONE: Partial<Record<SessionState, 'success' | 'warning' | 'danger' | 'neutral'>> = {
  qualifying_active: 'success',
  race_active: 'success',
  cancelled: 'danger',
  postponed: 'warning',
}

/**
 * Race Weekend event (iOS race-weekend detail + `VRCRaceWeekendControlTiles`): the Practice → Qualifying → Race timeline derived
 * purely from the authoritative session state, links to Race Prep / Qualifying / Results / Pit Wall, and — for Owner/Admin/Marshal —
 * session controls. The server (`vrc_session_transition`) decides what is legal; the UI only offers normal transitions, blocks the
 * race path until qualifying is official (fail-closed), and exposes the audited Authorized Override to managers only.
 */
export default function RaceWeekendEventPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { permissions, selectedLeague } = useLeagueSession()
  const [event, setEvent] = useState<EventRow | null | undefined>(undefined)
  const [trackName, setTrackName] = useState<string | null>(null)
  const [session, setSession] = useState<EventSessionRow | null>(null)
  const [qualifyingOfficial, setQualifyingOfficial] = useState<boolean | null>(null)
  const [audit, setAudit] = useState<EventSessionAuditRow[]>([])
  const [notes, setNotes] = useState<EventSessionNoteRow[]>([])
  const [noteText, setNoteText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<SessionState | null>(null)
  const [showOverride, setShowOverride] = useState(false)
  const [overrideTarget, setOverrideTarget] = useState<SessionState>('scheduled')
  const [overrideReason, setOverrideReason] = useState('')

  const canOperate = permissions.canOperateRaceControl
  const canOverride = permissions.canOverrideSession
  const state: SessionState = session?.state ?? 'scheduled'

  const loadStaff = useCallback(async () => {
    if (!eventId || !canOperate) return
    const [a, n] = await Promise.all([getSessionAudit(eventId).catch(() => []), getSessionNotes(eventId).catch(() => [])])
    setAudit(a)
    setNotes(n)
  }, [eventId, canOperate])

  const load = useCallback(async () => {
    if (!eventId) return
    setError(null)
    try {
      const [e, s] = await Promise.all([getEvent(eventId), getEventSession(eventId)])
      setEvent(e)
      setSession(s)
      if (e && selectedLeague) {
        getChampionship(e.championship_id)
          .then((c) => (c && e.track_id ? getTracks(c.game_id, selectedLeague.league.id) : []))
          .then((tracks) => setTrackName(tracks.find((t) => t.id === e.track_id)?.name ?? null))
          .catch(() => undefined)
      }
      const st = s?.state ?? 'scheduled'
      if (st === 'qualifying_complete' || st === 'race_ready') {
        const set = await getResultSet(eventId, 'qualifying').catch(() => null)
        setQualifyingOfficial(set?.official ?? false)
      } else {
        setQualifyingOfficial(null)
      }
      await loadStaff()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load this event.'))
    }
  }, [eventId, selectedLeague, loadStaff])

  useEffect(() => {
    void load()
    if (!eventId) return
    // Realtime is a hint only — every change refetches the authoritative, RLS-filtered row.
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribeToEventSession(eventId, () => {
      clearTimeout(timer)
      timer = setTimeout(() => void load(), 250)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [eventId, load])

  async function transition(target: SessionState, reason: string | null = null, override = false) {
    if (!eventId) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await transitionSession(eventId, session?.version ?? 0, target, reason, override)
      setSession(updated)
      setNotice(`Session is now “${SESSION_LABEL[updated.state]}”.`)
      setConfirm(null)
      setShowOverride(false)
      setOverrideReason('')
      await load()
    } catch (err) {
      const raw = String((err as { message?: string })?.message ?? '')
      if (/VERSION|CONFLICT|STALE/i.test(raw)) {
        await load()
        setError('The session changed on another device. Review the current state and try again from there.')
      } else {
        setError(backendErrorMessage(err, 'Could not update the session state.'))
      }
    } finally {
      setBusy(false)
    }
  }

  async function postNote(e: React.FormEvent) {
    e.preventDefault()
    if (!eventId || !event || !noteText.trim()) return
    try {
      await addSessionNote(eventId, event.league_id, noteText.trim())
      setNoteText('')
      await loadStaff()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not save the note.'))
    }
  }

  if (error && event === undefined) return <ErrorState message={error} onRetry={load} />
  if (event === undefined) return <LoadingState label="Loading event…" />
  if (event === null) return <EmptyState title="Event not found" />

  const actions = availableSessionActions({ state, canOperate, canOverride, qualifyingOfficial })
  const gated = requiresQualifyingResults(state, qualifyingOfficial)
  const isDriverOrOps = permissions.roles.has('driver') || canOperate

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Link to="/race-weekend" className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
            ← Race Weekend
          </Link>
          <p className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
            {eventRoundLabel(event)}
          </p>
          <h1 className="text-2xl font-bold">{eventDisplayTitle(event)}</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {[trackName, event.track_layout, event.event_date ? formatDate(event.event_date) : 'Date to be announced', event.start_time?.slice(0, 5)]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session?.override_active && <Badge tone="warning">Override</Badge>}
          <Badge tone={STATE_TONE[state] ?? 'neutral'}>{SESSION_LABEL[state]}</Badge>
        </div>
      </div>

      {(state === 'cancelled' || state === 'postponed') && (
        <p role="status" className="rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-warning)' }}>
          This event is {state}. {state === 'postponed' ? 'An Owner or Admin can return it to Scheduled when the new date is set.' : 'No further session changes are possible.'}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <ol className="grid grid-cols-3 gap-2">
          {STAGES.map((stage) => {
            const status = stageStatus(stage.key, session?.state ?? null)
            return (
              <li key={stage.key} className="rounded-lg border p-3 text-center text-sm" style={{ borderColor: status === 'active' ? 'var(--color-accent)' : 'var(--color-border)' }}>
                <p className="font-semibold">{stage.label}</p>
                <p className="text-xs capitalize" style={{ color: status === 'complete' ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                  {status === 'upcoming' ? 'Upcoming' : status === 'active' ? 'Current' : 'Complete'}
                </p>
              </li>
            )
          })}
        </ol>
        {(session?.qualifying_started_at || session?.race_started_at) && (
          <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {session.qualifying_started_at && <>Qualifying started {formatDateTime(session.qualifying_started_at)}. </>}
            {session.race_started_at && <>Race started {formatDateTime(session.race_started_at)}.</>}
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isDriverOrOps && (
          <Link to={`/race-prep/${event.id}`}>
            <Card className="h-full transition hover:shadow-md">
              <CardHeader>
                <CardTitle>Race Prep</CardTitle>
              </CardHeader>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Practice pace leaderboard and DNS.
              </p>
            </Card>
          </Link>
        )}
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
        {isDriverOrOps && (
          <Link to="/pit-wall">
            <Card className="h-full transition hover:shadow-md">
              <CardHeader>
                <CardTitle>Pit Wall</CardTitle>
                <Badge tone="warning">PRO</Badge>
              </CardHeader>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Setup and engineering state for this weekend.
              </p>
            </Card>
          </Link>
        )}
      </div>

      {canOperate && (
        <Card>
          <CardHeader>
            <CardTitle>Race control</CardTitle>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Current session: <strong>{SESSION_LABEL[state]}</strong>
            </span>
          </CardHeader>
          {gated && (
            <p role="status" className="mb-3 text-sm" style={{ color: 'var(--color-warning)' }}>
              The race can&apos;t start until qualifying results are made Official.{' '}
              <Link to={`/qualifying/${event.id}`} className="underline">
                Open qualifying
              </Link>
              {canOverride ? ' — or use an Authorized Override.' : '.'}
            </p>
          )}
          {error && (
            <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="mb-3 text-sm" style={{ color: 'var(--color-success)' }}>
              {notice}
            </p>
          )}
          {actions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.target}
                  variant={action.destructive ? 'danger' : 'primary'}
                  disabled={busy}
                  onClick={() => (action.destructive ? setConfirm(action.target) : transition(action.target))}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              No further session actions from “{SESSION_LABEL[state]}”. Results are entered on the Results screen.
            </p>
          )}

          {canOverride && !isTerminalForPhase(state) && (
            <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
              <Button variant="secondary" onClick={() => setShowOverride(true)} disabled={busy}>
                Authorized override
              </Button>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Overrides need a reason and are recorded in the audit log.
              </p>
            </div>
          )}
        </Card>
      )}

      {canOperate && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Staff notes</CardTitle>
            </CardHeader>
            <ul className="mb-3 space-y-2 text-sm">
              {notes.length === 0 && <li style={{ color: 'var(--color-text-muted)' }}>No notes yet.</li>}
              {notes.map((n) => (
                <li key={n.id}>
                  <p>{n.note}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{formatDateTime(n.created_at)}</p>
                </li>
              ))}
            </ul>
            <form onSubmit={postNote} className="flex gap-2">
              <input
                aria-label="Add a staff note"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Add a note"
                className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
              />
              <Button type="submit" variant="secondary" disabled={!noteText.trim()}>
                Add
              </Button>
            </form>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Session audit</CardTitle>
            </CardHeader>
            <ul className="space-y-2 text-sm">
              {audit.length === 0 && <li style={{ color: 'var(--color-text-muted)' }}>No changes recorded.</li>}
              {audit.map((a) => (
                <li key={a.id}>
                  <p>
                    {a.previous_state ? SESSION_LABEL[a.previous_state] : '—'} → {SESSION_LABEL[a.new_state]}
                    {a.was_override && <Badge tone="warning">override</Badge>}
                  </p>
                  {a.reason && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{a.reason}</p>}
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{formatDateTime(a.created_at)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {confirm && (
        <Modal title={sessionActionFor(confirm).label + '?'} onClose={() => !busy && setConfirm(null)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {confirm === 'cancelled'
              ? 'Cancelling ends this event permanently — no further session changes are possible.'
              : 'Postponing pauses this event until you return it to Scheduled.'}
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="danger" onClick={() => transition(confirm)} disabled={busy}>
              {busy ? 'Working…' : sessionActionFor(confirm).label}
            </Button>
            <Button variant="secondary" onClick={() => setConfirm(null)} disabled={busy}>
              Keep event
            </Button>
          </div>
        </Modal>
      )}

      {showOverride && (
        <Modal title="Authorized override" onClose={() => !busy && setShowOverride(false)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Move the session to any state, bypassing the normal order. A reason is required and the change is recorded in the audit log.
          </p>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium">Target state</span>
            <select
              value={overrideTarget}
              onChange={(e) => setOverrideTarget(e.target.value as SessionState)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            >
              {(Object.keys(NORMAL_TARGETS) as SessionState[])
                .filter((s) => s !== state && s !== 'results_pending')
                .map((s) => (
                  <option key={s} value={s}>
                    {SESSION_LABEL[s]}
                  </option>
                ))}
            </select>
          </label>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium">Reason</span>
            <input
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            />
          </label>
          <div className="mt-4 flex gap-2">
            <Button variant="danger" onClick={() => transition(overrideTarget, overrideReason.trim(), true)} disabled={busy || !overrideReason.trim()}>
              {busy ? 'Working…' : 'Apply override'}
            </Button>
            <Button variant="secondary" onClick={() => setShowOverride(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
