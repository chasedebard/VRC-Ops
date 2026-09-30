/**
 * Pit Wall V3 read model. The backend returns canonical JSON from SECURITY DEFINER RPCs
 * (`vrc_pit_wall_v3_weekend_car_programmes`, `…_setup_board_state`, `…_engineering_call_state`). The website is a READ-ONLY viewer of that
 * state: it never evaluates an Engineering Call, proposes a package or derives a conclusion locally — "lack of a result never permits local
 * evaluation" (server contract). Parsers here are defensive: an unexpected shape degrades to an empty section, never a fabricated value.
 */

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const bool = (v: unknown): boolean => v === true
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObject) : [])

export interface PitWallProgramme {
  id: string
  carName: string
  carGtClass: string | null
  competingClassName: string | null
  lifecycleStatus: string
  isActive: boolean
  hasBaseline: boolean
  hasConfirmedCurrent: boolean
  sessionCount: number
  activeSession: { kind: string; displayName: string } | null
  hasOpenManualPackage: boolean
  hasLockedRacePackage: boolean
  runCardCount: number
  reportCount: number
}

export interface PitWallProgrammes {
  activeProgrammeId: string | null
  programmes: PitWallProgramme[]
}

export function parseProgrammes(raw: unknown): PitWallProgrammes {
  const root = isObject(raw) ? raw : {}
  return {
    activeProgrammeId: str(root.active_car_programme_id),
    programmes: arr(root.programmes).map((p) => {
      const session = isObject(p.active_session) ? p.active_session : null
      return {
        id: str(p.id) ?? '',
        carName: str(p.car_name) ?? 'Unknown car',
        carGtClass: str(p.car_gt_class),
        competingClassName: str(p.competing_class_name),
        lifecycleStatus: str(p.lifecycle_status) ?? 'needs_baseline',
        isActive: bool(p.is_active),
        hasBaseline: bool(p.has_baseline),
        hasConfirmedCurrent: bool(p.has_confirmed_current),
        sessionCount: num(p.session_count) ?? 0,
        activeSession: session ? { kind: str(session.kind) ?? 'custom', displayName: str(session.display_name) ?? 'Session' } : null,
        hasOpenManualPackage: bool(p.has_open_manual_package),
        hasLockedRacePackage: bool(p.has_locked_race_package),
        runCardCount: num(p.run_card_count) ?? 0,
        reportCount: num(p.report_count) ?? 0,
      }
    }).filter((p) => p.id !== ''),
  }
}

export interface SnapshotValue {
  parameterKey: string
  value: string | null
  unit: string | null
  availability: string
  minimum: string | null
  maximum: string | null
}

export interface SetupSnapshot {
  id: string
  type: string
  lifecycleStatus: string
  revision: number
  observedAt: string | null
  source: string
  values: SnapshotValue[]
}

export function parseSnapshot(raw: unknown): SetupSnapshot | null {
  if (!isObject(raw)) return null
  const id = str(raw.id)
  if (!id) return null
  return {
    id,
    type: str(raw.snapshot_type) ?? 'current',
    lifecycleStatus: str(raw.lifecycle_status) ?? 'unknown',
    revision: num(raw.revision) ?? 0,
    observedAt: str(raw.observed_at),
    source: str(raw.source) ?? 'unknown',
    values: arr(raw.values).map((v) => ({
      parameterKey: str(v.parameter_key) ?? '',
      value: str(v.numeric_value),
      unit: str(v.unit),
      availability: str(v.availability_status) ?? 'unknown',
      minimum: str(v.applicable_minimum),
      maximum: str(v.applicable_maximum),
    })).filter((v) => v.parameterKey !== ''),
  }
}

export interface PackageChange {
  parameterKey: string
  currentValue: string | null
  targetValue: string | null
  signedDelta: string | null
  unit: string | null
  reason: string | null
  expectedBenefit: string | null
  expectedRisk: string | null
  executionStatus: string | null
  actualConfirmedValue: string | null
}

export interface TestPackage {
  id: string
  kind: string
  status: string
  sourceLabel: string
  manualReason: string | null
  primaryHypothesis: string | null
  expectedBenefit: string | null
  expectedRisk: string | null
  validationRequirement: string | null
  driverModified: boolean
  changes: PackageChange[]
}

export function parsePackage(raw: unknown): TestPackage | null {
  if (!isObject(raw)) return null
  const id = str(raw.id)
  if (!id) return null
  return {
    id,
    kind: str(raw.kind) ?? 'manual',
    status: str(raw.status) ?? 'proposed',
    sourceLabel: str(raw.source_label) ?? 'Driver judgement',
    manualReason: str(raw.manual_reason),
    primaryHypothesis: str(raw.primary_hypothesis),
    expectedBenefit: str(raw.expected_benefit),
    expectedRisk: str(raw.expected_risk),
    validationRequirement: str(raw.validation_requirement),
    driverModified: bool(raw.driver_modified),
    changes: arr(raw.changes).map((c) => ({
      parameterKey: str(c.parameter_key) ?? '',
      currentValue: str(c.current_value),
      targetValue: str(c.target_value),
      signedDelta: str(c.signed_delta),
      unit: str(c.unit),
      reason: str(c.parameter_reason),
      expectedBenefit: str(c.expected_benefit),
      expectedRisk: str(c.expected_risk),
      executionStatus: str(c.execution_status),
      actualConfirmedValue: str(c.actual_confirmed_value),
    })).filter((c) => c.parameterKey !== ''),
  }
}

export interface SetupBoard {
  baseline: SetupSnapshot | null
  current: SetupSnapshot | null
  activePackage: TestPackage | null
}

export function parseSetupBoard(raw: unknown): SetupBoard {
  const root = isObject(raw) ? raw : {}
  return {
    baseline: parseSnapshot(root.baseline_snapshot),
    current: parseSnapshot(root.current_snapshot),
    activePackage: parsePackage(root.active_manual_package),
  }
}

export interface EngineeringCall {
  id: string
  status: string
  nextActionType: string | null
  nextActionDetail: string | null
  confidence: string | null
  primaryHypothesis: string | null
  expectedBenefit: string | null
  expectedRisk: string | null
  validationRequirement: string | null
  changes: PackageChange[]
  supportingEvidence: { label: string; provenance: string | null; comparability: string | null }[]
  contradictingEvidence: { label: string; provenance: string | null; comparability: string | null }[]
}

export interface EngineeringQuestion {
  id: string
  question: string
  requiredEvidence: string | null
  nextActionType: string | null
}

export interface EngineeringState {
  pace: { value: string; source: string | null } | null
  call: EngineeringCall | null
  activePackage: TestPackage | null
  questions: EngineeringQuestion[]
}

function evidence(raw: unknown) {
  return arr(raw).map((e) => ({
    label: str(e.source_label) ?? str(e.original_driver_text) ?? str(e.behavior_key) ?? 'Evidence',
    provenance: str(e.provenance),
    comparability: str(e.comparability_state),
  }))
}

export function parseEngineeringState(raw: unknown): EngineeringState {
  const root = isObject(raw) ? raw : {}
  const pace = isObject(root.pace) ? root.pace : null
  const call = isObject(root.engineering_call) ? root.engineering_call : null
  return {
    pace: pace && str(pace.engineering_pace) ? { value: str(pace.engineering_pace) as string, source: str(pace.source) } : null,
    call:
      call && str(call.id)
        ? {
            id: str(call.id) as string,
            status: str(call.status) ?? 'unknown',
            nextActionType: str(call.next_action_type),
            nextActionDetail: str(call.next_action_detail),
            confidence: str(call.confidence),
            primaryHypothesis: str(call.primary_hypothesis),
            expectedBenefit: str(call.expected_benefit),
            expectedRisk: str(call.expected_risk),
            validationRequirement: str(call.validation_requirement),
            changes: parsePackage({ id: 'call', changes: call.changes })?.changes ?? [],
            supportingEvidence: evidence(call.supporting_evidence),
            contradictingEvidence: evidence(call.contradicting_evidence),
          }
        : null,
    activePackage: parsePackage(root.active_package),
    questions: arr(root.unresolved_questions).map((q) => ({
      id: str(q.id) ?? '',
      question: str(q.question) ?? '',
      requiredEvidence: str(q.required_evidence),
      nextActionType: str(q.next_action_type),
    })).filter((q) => q.id !== '' && q.question !== ''),
  }
}

// ---- Presentation ---------------------------------------------------------------------------------

/** `front_anti_roll_bar` / `frontAntiRollBar` → "Front Anti Roll Bar". Unknown vocabulary is shown verbatim, never invented. */
export function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim()
  return spaced.replace(/\b\w/g, (c) => c.toUpperCase())
}

export const PROGRAMME_STATUS_LABEL: Record<string, string> = {
  needs_baseline: 'Needs baseline',
  active: 'Active',
  race_package_locked: 'Race package locked',
  completed: 'Completed',
  archived: 'Archived',
}

export const PACKAGE_STATUS_LABEL: Record<string, string> = {
  proposed: 'Proposed',
  partially_applied_or_modified: 'Partially applied / modified',
  deferred: 'Deferred',
  validation_ready: 'Ready to validate',
  applied: 'Applied',
  superseded: 'Superseded',
}

export const RUN_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  active: 'Recording',
  processing: 'Processing',
  awaiting_debrief: 'Awaiting debrief',
  complete: 'Complete',
  partial: 'Partial',
  interrupted: 'Interrupted',
  invalid: 'Invalid',
  failed: 'Failed',
  duplicate: 'Duplicate',
}

export function statusLabel(table: Record<string, string>, value: string): string {
  return table[value] ?? humanizeKey(value)
}

/** "value + unit", or an explicit unavailable marker — a missing reading is never shown as 0. */
export function formatSetupValue(value: string | null, unit: string | null): string {
  if (value === null) return 'Not available'
  return unit ? `${value} ${unit}` : value
}

/** Friendly copy for the Pit Wall RPC error vocabulary (server messages are SQL exception codes). */
export function pitWallErrorMessage(error: unknown): string {
  const raw = String((error as { message?: string })?.message ?? error ?? '')
  if (/PIT_WALL_PRO_REQUIRED/.test(raw)) return 'Pit Wall is included with VRC Ops Pro and League Plus.'
  if (/V3_WEEKEND_NOT_FOUND_OR_NOT_OWNED|CAR_PROGRAMME_NOT_FOUND_OR_NOT_OWNED/.test(raw)) return 'No Pit Wall weekend was found for this event on your account.'
  if (/AUTHENTICATION_REQUIRED/.test(raw)) return 'Sign in again to view Pit Wall.'
  return 'Could not load Pit Wall right now. Try again in a moment.'
}
