import type { EventRow, SessionState } from '@/types/database'

/**
 * Race Weekend session state machine, mirrored from iOS (`VRCSessionState`, `VRCSessionAction`, `VRCRaceWeekendTimelineLogic`,
 * `VRCRaceControlStore`). The server (`vrc_session_transition`, `vrc_session_normal_transition`) is the authority on which
 * transitions are legal; this only drives which controls appear, so the UI never offers a dead end.
 */

export const SESSION_LABEL: Record<SessionState, string> = {
  scheduled: 'Scheduled',
  practice_available: 'Practice Open',
  qualifying_active: 'Qualifying Active',
  qualifying_complete: 'Qualifying Complete',
  race_ready: 'Race Ready',
  race_active: 'Race Active',
  race_complete: 'Results In',
  results_pending: 'Results In',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
}

/** Targets reachable without an authorized override (mirror of `vrc_session_normal_transition`). */
export const NORMAL_TARGETS: Record<SessionState, SessionState[]> = {
  scheduled: ['practice_available', 'qualifying_active', 'cancelled', 'postponed'],
  practice_available: ['qualifying_active', 'scheduled', 'cancelled', 'postponed'],
  qualifying_active: ['qualifying_complete', 'cancelled', 'postponed'],
  qualifying_complete: ['race_ready', 'cancelled', 'postponed'],
  race_ready: ['race_active', 'qualifying_complete', 'cancelled', 'postponed'],
  race_active: ['race_complete'],
  // End Race is the end of live ops; results are entered on the Results screen, so there is no "Results Pending" dead end.
  race_complete: [],
  results_pending: [],
  postponed: ['scheduled'],
  cancelled: [],
}

export interface SessionAction {
  target: SessionState
  label: string
  destructive: boolean
  /** Cancel/postpone require a manager (Owner/Admin); enforced in the database too. */
  requiresManager: boolean
}

export function sessionActionFor(target: SessionState): SessionAction {
  switch (target) {
    case 'practice_available':
      return { target, label: 'Open Practice', destructive: false, requiresManager: false }
    case 'qualifying_active':
      return { target, label: 'Start Qualifying', destructive: false, requiresManager: false }
    case 'qualifying_complete':
      return { target, label: 'End / Confirm Qualifying', destructive: false, requiresManager: false }
    case 'race_ready':
      return { target, label: 'Mark Race Ready', destructive: false, requiresManager: false }
    case 'race_active':
      return { target, label: 'Start Race', destructive: false, requiresManager: false }
    case 'race_complete':
      return { target, label: 'End Race', destructive: false, requiresManager: false }
    case 'results_pending':
      return { target, label: 'Move to Results Pending', destructive: false, requiresManager: false }
    case 'scheduled':
      return { target, label: 'Return to Scheduled', destructive: false, requiresManager: false }
    case 'cancelled':
      return { target, label: 'Cancel Event', destructive: true, requiresManager: true }
    case 'postponed':
      return { target, label: 'Postpone Event', destructive: true, requiresManager: true }
  }
}

/**
 * Race-start gating: once qualifying has ended, the race path (Race Ready / Start Race) stays blocked until qualifying results
 * are submitted (Official). An unknown submission state fails closed. Authorized overrides (reason + audited) remain the escape
 * hatch.
 */
export function requiresQualifyingResults(state: SessionState, qualifyingOfficial: boolean | null): boolean {
  if (state !== 'qualifying_complete' && state !== 'race_ready') return false
  return qualifyingOfficial !== true
}

/** Normal actions from the current state, filtered by permission and by qualifying-results gating. */
export function availableSessionActions(args: {
  state: SessionState
  canOperate: boolean
  canOverride: boolean
  qualifyingOfficial: boolean | null
}): SessionAction[] {
  if (!args.canOperate) return []
  let targets = NORMAL_TARGETS[args.state]
  if (requiresQualifyingResults(args.state, args.qualifyingOfficial)) {
    targets = targets.filter((t) => t !== 'race_ready' && t !== 'race_active')
  }
  return targets.map(sessionActionFor).filter((a) => !a.requiresManager || args.canOverride)
}

export const isLiveSession = (state: SessionState): boolean => state === 'qualifying_active' || state === 'race_active'
export const isResultsPhase = (state: SessionState): boolean => state === 'race_complete' || state === 'results_pending'
export const isTerminalForPhase = (state: SessionState): boolean => isResultsPhase(state) || state === 'cancelled'

// ---- Timeline (Practice → Qualifying → Race) --------------------------------------------------

export type WeekendStage = 'practice' | 'qualifying' | 'race'
export type StageStatus = 'upcoming' | 'active' | 'complete'

function progressIndex(state: SessionState): number {
  switch (state) {
    case 'scheduled':
      return 0
    case 'practice_available':
      return 1
    case 'qualifying_active':
      return 2
    case 'qualifying_complete':
      return 3
    case 'race_ready':
      return 4
    case 'race_active':
      return 5
    case 'race_complete':
    case 'results_pending':
      return 6
    default:
      return 0 // cancelled / postponed sit at 0 — callers show a banner
  }
}

/**
 * A stage's status, purely a function of how far the single linear `event_sessions` state has advanced. Practice is the normal
 * starting state of a scheduled race weekend, so it reads as current for the whole pre-qualifying window — whether the session
 * row does not exist yet, sits at `scheduled`, or was explicitly opened. It becomes complete only when the persisted state
 * advances into qualifying. Cancelled/postponed sessions keep every stage neutral.
 */
export function stageStatus(stage: WeekendStage, state: SessionState | null): StageStatus {
  if (state === 'cancelled' || state === 'postponed') return 'upcoming'
  const index = state ? progressIndex(state) : 0
  switch (stage) {
    case 'practice':
      return index >= 2 ? 'complete' : 'active'
    case 'qualifying':
      if (index >= 3) return 'complete'
      return index === 2 ? 'active' : 'upcoming'
    case 'race':
      if (index >= 6) return 'complete'
      return index === 5 ? 'active' : 'upcoming'
  }
}

// ---- Reconciled round status (hero + round list) ----------------------------------------------

export type RoundStatus = 'Cancelled' | 'Postponed' | 'Draft' | 'Completed' | 'Awaiting Results' | 'Current Race' | 'Live' | 'Upcoming'

/**
 * The one reconciled lifecycle status shown for a round anywhere in Race Weekend. `events.status` alone flips to `completed`
 * the moment End Race fires — before results exist — so pass whether the *race* result set is actually official to avoid
 * prematurely marking a round done. Pass `undefined` where results aren't loaded (list rows); the resolver then trusts `status`.
 */
export function roundStatus(event: Pick<EventRow, 'status'>, isCurrent: boolean, raceOfficial?: boolean): RoundStatus {
  switch (event.status) {
    case 'cancelled':
      return 'Cancelled'
    case 'postponed':
      return 'Postponed'
    case 'draft':
      return 'Draft'
    case 'completed':
    case 'archived':
      if (raceOfficial === false) return isCurrent ? 'Current Race' : 'Awaiting Results'
      return 'Completed'
    case 'live':
      return isCurrent ? 'Current Race' : 'Live'
    default:
      return isCurrent ? 'Current Race' : 'Upcoming'
  }
}

/** Whether the active season still has a live or dated-upcoming event (when false, the "current race" fallback is not really current). */
export function hasLiveOrUpcoming(events: Pick<EventRow, 'status' | 'event_date'>[], todayKey: string): boolean {
  return events.some((e) => e.status === 'live' || ((e.event_date ?? '') >= todayKey && e.status !== 'completed' && Boolean(e.event_date)))
}
