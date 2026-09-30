import type { RaceResultStatus } from '@/types/database'
import type { SaveQualifyingRowPayload, SaveRaceRowPayload } from '@/services/results'
import {
  OVERALL_SERIES,
  awardClaim,
  classSeries,
  regionSeries,
  seriesOutcome,
  seriesRows,
  teamStandings,
  type DriverInfo,
  type EventScore,
  type SeriesAwardClaim,
  type SeriesEventScores,
  type SeriesKey,
  type StandingRow,
  type StandingsScoringConfig,
  type SubSeriesPlanner,
} from '@/utils/standingsEngine'

/**
 * Pure result-entry logic for the web, ported from iOS (VRCResultModels.swift, VRCResultValidation.swift, the
 * `VRCResultEntryStore` finalize pipeline). Everything here is deterministic and network-free so the rules the backend
 * enforces (`vrc_save_results`, `private.validate_final_race_result_set`) can be checked in the browser before a save, and
 * the scoring/standings payload the server stores is built exactly the way iOS builds it.
 */

// ---- Result set lifecycle ----------------------------------------------------------------------

const EDITABLE_STATES = new Set(['draft', 'submitted', 'returned', 'reopened'])

/**
 * Entry rows are editable while a result set has never been saved (draft) or was unlocked for correction (reopened) — mirrors
 * `vrc_result_set_editable`. A saved (Official) set is `finalized` + locked until an Owner/Admin unlocks it, and the last saved
 * official outputs stay live while it is unlocked so standings never blank out mid-edit.
 */
export const isResultSetEditable = (set: { state: string } | null | undefined): boolean => !set || EDITABLE_STATES.has(set.state)

// ---- Time text ----------------------------------------------------------------------------------

/** Lap-time entry: "M:SS.mmm", "MM:SS.mmm" or "SS.mmm". Implausible values (under 1s / over an hour) are rejected. */
export const LAP_MIN_MS = 1_000
export const LAP_MAX_MS = 3_600_000

export function parseLapTimeMs(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, '.')
  if (!trimmed) return null
  const minuteParts = trimmed.split(':')
  if (minuteParts.length > 2) return null
  let minutes = 0
  let secondsText = trimmed
  if (minuteParts.length === 2) {
    if (!/^\d{1,3}$/.test(minuteParts[0])) return null
    minutes = Number(minuteParts[0])
    secondsText = minuteParts[1]
  }
  const secondParts = secondsText.split('.')
  if (secondParts.length > 2 || !/^\d+$/.test(secondParts[0])) return null
  const seconds = Number(secondParts[0])
  if (minuteParts.length === 2 && (secondParts[0].length > 2 || seconds >= 60)) return null
  let fractionMs = 0
  if (secondParts.length === 2) {
    const fraction = secondParts[1]
    if (!/^\d{1,3}$/.test(fraction)) return null
    fractionMs = Number(fraction) * 10 ** (3 - fraction.length)
  }
  const total = (minutes * 60 + seconds) * 1000 + fractionMs
  return total >= LAP_MIN_MS && total <= LAP_MAX_MS ? total : null
}

export function lapTimeValidationMessage(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || parseLapTimeMs(trimmed) !== null) return null
  return 'Enter a valid lap time such as 1:43.208 (M:SS.mmm) or 58.115 (SS.mmm).'
}

export function formatLapMs(ms: number | null | undefined): string | null {
  if (ms == null || ms <= 0) return null
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const millis = ms % 1000
  const s = String(seconds).padStart(2, '0')
  const m3 = String(millis).padStart(3, '0')
  return minutes > 0 ? `${minutes}:${s}.${m3}` : `${seconds}.${m3}`
}

const MAX_RACE_TIME_MS = 24 * 3_600_000

/** Race-time entry (total race time or a time gap): "1:02:11.004", "43:12.408", "58.115", "+0.312", "58.115s". */
export function parseRaceTimeMs(text: string): number | null {
  let t = text.trim().replace(/,/g, '.')
  if (!t) return null
  if (t.startsWith('+')) t = t.slice(1)
  if (/\d[sS]$/.test(t)) t = t.slice(0, -1)
  if (!/^[\d:.]+$/.test(t)) return null
  const parts = t.split(':')
  if (parts.length < 1 || parts.length > 3 || parts.some((p) => p === '')) return null
  if (parts.slice(0, -1).some((p) => !/^\d+$/.test(p))) return null
  const secondParts = parts[parts.length - 1].split('.')
  if (secondParts.length < 1 || secondParts.length > 2 || !/^\d+$/.test(secondParts[0])) return null
  const seconds = Number(secondParts[0])
  if (parts.length > 1 && (secondParts[0].length > 2 || seconds >= 60)) return null
  let fractionMs = 0
  if (secondParts.length === 2) {
    const fraction = secondParts[1]
    if (!/^\d{1,3}$/.test(fraction)) return null
    fractionMs = Number(fraction) * 10 ** (3 - fraction.length)
  }
  let totalSeconds = seconds
  if (parts.length === 2) {
    if (!/^\d{1,3}$/.test(parts[0])) return null
    totalSeconds += Number(parts[0]) * 60
  } else if (parts.length === 3) {
    if (!/^\d{1,2}$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1]) || Number(parts[1]) >= 60) return null
    totalSeconds += Number(parts[0]) * 3600 + Number(parts[1]) * 60
  }
  const total = totalSeconds * 1000 + fractionMs
  return total > 0 && total <= MAX_RACE_TIME_MS ? total : null
}

export function raceTimeValidationMessage(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed || parseRaceTimeMs(trimmed) !== null) return null
  return 'Enter a valid time such as 1:43.208, 58.115, or +0.312.'
}

export function formatRaceTimeMs(ms: number | null | undefined): string | null {
  if (ms == null || ms <= 0) return null
  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const millis = String(ms % 1000).padStart(3, '0')
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${millis}`
  if (minutes > 0) return `${minutes}:${String(seconds).padStart(2, '0')}.${millis}`
  return `${seconds}.${millis}`
}

/** Laps Down is a positive whole number, minimum 1. */
export function parseLapsDown(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const laps = Number(trimmed)
  return laps >= 1 ? laps : null
}

export function lapsDownValidationMessage(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  return parseLapsDown(trimmed) === null ? 'Enter a whole number of laps, 1 or more.' : null
}

export function lapsDownLabel(laps: number | null | undefined): string | null {
  if (laps == null || laps < 1) return null
  return `+${laps} ${laps === 1 ? 'Lap' : 'Laps'}`
}

/** "+12.408s" style gap label for a time gap. */
export function timeGapLabel(ms: number | null | undefined): string | null {
  const text = formatRaceTimeMs(ms)
  return text ? `+${text}` : null
}

// ---- Row drafts ---------------------------------------------------------------------------------

export type GapType = 'time' | 'laps'

export interface RaceRowDraft {
  key: string
  driverId: string
  finishPosition: number | null
  startPosition: number | null
  lapsCompleted: number | null
  totalTimeMs: number | null
  gapType: GapType | null
  gapValue: number | null
  bestLapMs: number | null
  fastestLap: boolean
  earnedPole: boolean
  /** Race-level manual mode replicated on every row once any admin changes Pole. */
  poleManuallyOverridden: boolean
  status: RaceResultStatus
  bonusPoints: number
  penaltyPoints: number
  teamId: string | null
  classId: string | null
  regionId: string | null
  notes: string | null
}

export interface QualifyingRowDraft {
  key: string
  driverId: string
  position: number | null
  bestLapMs: number | null
  gapMs: number | null
  status: 'set' | 'dns' | 'dsq'
  gridAdjustment: number
  penaltyPositions: number
  earnedPole: boolean
  notes: string | null
}

/** Normalizes `(gap_type, gap_value, gap_ms)` into the one shape the database stores (mirror of `canonicalGap`). */
export function canonicalGap(
  type: GapType | null,
  value: number | null,
  milliseconds: number | null,
): { type: GapType | null; value: number | null; ms: number | null } {
  if (type === 'time') {
    const resolved = value ?? milliseconds
    return resolved != null && resolved > 0 ? { type: 'time', value: resolved, ms: resolved } : { type: null, value: null, ms: null }
  }
  if (type === 'laps') {
    return value != null && value > 0 ? { type: 'laps', value, ms: null } : { type: null, value: null, ms: null }
  }
  if (milliseconds != null && milliseconds > 0) return { type: 'time', value: milliseconds, ms: milliseconds }
  return { type: null, value: null, ms: null }
}

export function withTimeGap(row: RaceRowDraft, milliseconds: number | null): RaceRowDraft {
  return milliseconds != null && milliseconds > 0
    ? { ...row, gapType: 'time', gapValue: milliseconds }
    : { ...row, gapType: null, gapValue: null }
}

export function withLapsDown(row: RaceRowDraft, laps: number | null): RaceRowDraft {
  return laps != null && laps >= 1 ? { ...row, gapType: 'laps', gapValue: laps } : { ...row, gapType: null, gapValue: null }
}

export const timeGapMs = (row: RaceRowDraft): number | null => (row.gapType === 'time' ? row.gapValue : null)
export const lapsDown = (row: RaceRowDraft): number | null => (row.gapType === 'laps' ? row.gapValue : null)

/** A status that counts as having started (everything except DNS). */
export const didStart = (status: RaceResultStatus): boolean => status !== 'dns'
/** A classified finisher carries race timing; DNS/DNF/DSQ/NC never do (the server strips these fields). */
export const isClassifiedFinisher = (status: RaceResultStatus): boolean => status === 'fin' || status === 'classified'

export const RESULT_STATUS_LABEL: Record<RaceResultStatus, string> = {
  fin: 'Finished',
  dnf: 'DNF',
  dns: 'DNS',
  dsq: 'DSQ',
  classified: 'Classified',
  nc: 'Not Classified',
}

// ---- Pole sync ----------------------------------------------------------------------------------

export const isPoleManuallyOverridden = (rows: RaceRowDraft[]): boolean => rows.some((r) => r.poleManuallyOverridden)

/** Qualifying P1 is classification-derived: keep the persisted marker aligned with the classification. */
export function normalizeQualifyingPole(rows: QualifyingRowDraft[]): QualifyingRowDraft[] {
  return rows.map((row) => {
    const shouldHavePole = row.status === 'set' && row.position === 1
    return row.earnedPole === shouldHavePole ? row : { ...row, earnedPole: shouldHavePole }
  })
}

export const qualifyingPoleDriverId = (rows: QualifyingRowDraft[]): string | null =>
  rows.find((r) => r.status === 'set' && r.position === 1)?.driverId ?? null

/**
 * Set exactly one Pole from qualifying while the result is editable and in automatic mode. No qualifying P1 clears an
 * auto-derived Pole. Manual mode preserves the complete selection, including an intentional "no Pole".
 */
export function syncPole(rows: RaceRowDraft[], poleDriverId: string | null, editable = true): RaceRowDraft[] {
  if (!editable || isPoleManuallyOverridden(rows)) return rows
  return rows.map((row) => {
    const shouldHavePole = poleDriverId !== null && row.driverId === poleDriverId
    if (row.earnedPole === shouldHavePole && !row.poleManuallyOverridden) return row
    return { ...row, earnedPole: shouldHavePole, poleManuallyOverridden: false }
  })
}

/** A user action switches the entire result to manual mode and atomically selects one driver — or none. */
export function selectPoleManually(rows: RaceRowDraft[], poleDriverId: string | null): RaceRowDraft[] {
  return rows.map((row) => ({ ...row, earnedPole: poleDriverId !== null && row.driverId === poleDriverId, poleManuallyOverridden: true }))
}

/** Return to qualifying-derived behavior; a no-op when qualifying has no P1. */
export function resetPoleToQualifying(rows: RaceRowDraft[], poleDriverId: string | null): RaceRowDraft[] {
  if (poleDriverId === null) return rows
  return syncPole(
    rows.map((r) => ({ ...r, poleManuallyOverridden: false })),
    poleDriverId,
  )
}

/** Assigns qualifying positions from best lap times: timed drivers rank ascending, untimed follow in existing order; DNS/DSQ get none. */
export function orderQualifyingByLapTime(rows: QualifyingRowDraft[]): QualifyingRowDraft[] {
  const classified = rows.filter((r) => r.status === 'set')
  const timed = classified
    .filter((r) => r.bestLapMs != null)
    .sort((a, b) => (a.bestLapMs ?? Infinity) - (b.bestLapMs ?? Infinity) || (a.position ?? Infinity) - (b.position ?? Infinity))
  const untimed = classified.filter((r) => r.bestLapMs == null).sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity))
  const assigned = new Map<string, number>()
  ;[...timed, ...untimed].forEach((r, i) => assigned.set(r.key, i + 1))
  return normalizeQualifyingPole(rows.map((r) => ({ ...r, position: r.status === 'set' ? (assigned.get(r.key) ?? null) : null })))
}

// ---- Validation ---------------------------------------------------------------------------------

export interface ValidationIssue {
  severity: 'error' | 'warning'
  message: string
}

export const blocksSave = (issues: ValidationIssue[]): boolean => issues.some((i) => i.severity === 'error')

export function validateRace(rows: RaceRowDraft[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (rows.length === 0) {
    return [{ severity: 'error', message: 'At least one driver is required before results can be made Official.' }]
  }
  const seen = new Set<string>()
  if (rows.some((r) => (seen.has(r.driverId) ? true : (seen.add(r.driverId), false)))) {
    issues.push({ severity: 'error', message: 'A driver appears more than once.' })
  }
  const finishers = rows.filter((r) => r.status === 'fin')
  const positions = finishers.map((r) => r.finishPosition).filter((p): p is number => p != null)
  if (positions.some((p) => p < 1) || finishers.length !== positions.length) {
    issues.push({ severity: 'error', message: 'Every finisher needs a finishing position of 1 or higher.' })
  }
  if (new Set(positions).size !== positions.length) {
    issues.push({ severity: 'error', message: 'Two finishers share the same finishing position.' })
  }
  if (rows.filter((r) => r.fastestLap).length > 1) issues.push({ severity: 'error', message: 'Only one driver may hold the fastest lap.' })
  if (rows.filter((r) => r.earnedPole).length > 1) issues.push({ severity: 'error', message: 'Only one driver may hold pole.' })
  if (rows.some((r) => r.status === 'dns' && (r.finishPosition ?? 0) > 0)) {
    issues.push({ severity: 'warning', message: 'A DNS driver has a finishing position set.' })
  }
  if (rows.some((r) => lapsDown(r) !== null && (lapsDown(r) as number) < 1)) {
    issues.push({ severity: 'error', message: 'Laps down must be a whole number of 1 or more.' })
  }
  return issues
}

/**
 * The server-side finalization rules (`private.validate_final_race_result_set`) checked up front so the editor can say
 * exactly which row needs what instead of surfacing a rejected save. Per class: exactly one classified P1, the winner
 * carries total race time and no gap, and every other classified finisher carries a positive gap and no total time.
 */
export function validateFinalRace(rows: RaceRowDraft[], multiClass: boolean, singleClassId: string | null): ValidationIssue[] {
  if (rows.length === 0) return [{ severity: 'error', message: 'Add at least one result row before saving.' }]
  const issues: ValidationIssue[] = []
  const classOf = (r: RaceRowDraft) => (multiClass ? r.classId : (singleClassId ?? r.classId))
  const classes = new Set(rows.map(classOf))
  for (const cls of classes) {
    const inClass = rows.filter((r) => classOf(r) === cls)
    const winners = inClass.filter((r) => r.finishPosition === 1 && isClassifiedFinisher(r.status))
    if (winners.length !== 1) {
      issues.push({ severity: 'error', message: 'Each class needs exactly one classified P1 winner.' })
    }
    for (const r of inClass) {
      if (!isClassifiedFinisher(r.status) || r.finishPosition == null) continue
      if (r.finishPosition === 1) {
        if (!r.totalTimeMs || r.totalTimeMs <= 0 || r.gapType !== null || r.gapValue !== null) {
          issues.push({ severity: 'error', message: 'Enter a total race time for each class winner (the class winner carries no gap).' })
        }
      } else if (r.finishPosition > 1) {
        if (r.totalTimeMs != null || r.gapType === null || r.gapValue === null || r.gapValue <= 0) {
          issues.push({
            severity: 'error',
            message: 'Every classified finisher except the class winner needs a gap to the leader — a time behind or laps down.',
          })
        }
      }
    }
  }
  // De-duplicate identical messages.
  const seen = new Set<string>()
  return issues.filter((i) => (seen.has(i.message) ? false : (seen.add(i.message), true)))
}

export function validateQualifying(rows: QualifyingRowDraft[]): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (rows.length === 0) {
    return [{ severity: 'error', message: 'At least one driver is required before qualifying can be made Official.' }]
  }
  const seen = new Set<string>()
  if (rows.some((r) => (seen.has(r.driverId) ? true : (seen.add(r.driverId), false)))) {
    issues.push({ severity: 'error', message: 'A driver appears more than once.' })
  }
  if (rows.some((r) => !['set', 'dns', 'dsq'].includes(r.status))) {
    issues.push({ severity: 'error', message: 'Every driver needs a valid qualifying status.' })
  }
  const classified = rows.filter((r) => r.status === 'set')
  const positions = classified.map((r) => r.position).filter((p): p is number => p != null)
  if (classified.length !== positions.length || positions.some((p) => p < 1)) {
    issues.push({ severity: 'error', message: 'Set a qualifying position of 1 or higher for every classified driver.' })
  }
  if (new Set(positions).size !== positions.length) issues.push({ severity: 'error', message: 'Two drivers share the same qualifying position.' })
  if (rows.some((r) => r.status !== 'set' && r.position != null)) {
    issues.push({ severity: 'error', message: 'DNS and DSQ drivers cannot have a qualifying position.' })
  }
  if (rows.some((r) => (r.gapMs ?? 0) < 0)) issues.push({ severity: 'error', message: 'Gap to pole cannot be negative.' })
  if (rows.filter((r) => r.earnedPole).length > 1) issues.push({ severity: 'error', message: 'Only one driver may hold pole.' })
  return issues
}

// ---- Scoring ------------------------------------------------------------------------------------

/**
 * Earned points = position points + bonuses + participation − penalties, floored at zero. Eligible statuses are `fin` and
 * `classified` (both valid finishes per the database's finalization rules and Android); dns/dnf/dsq/nc always score zero.
 * NOTE: iOS (main) only awards position points to `fin`; see docs/IOS_PARITY.md.
 */
export function earnedPointsForRow(row: RaceRowDraft, config: StandingsScoringConfig): number {
  if (!isClassifiedFinisher(row.status) || !row.finishPosition || row.finishPosition <= 0) return 0
  const idx = row.finishPosition - 1
  const base = idx < config.positionPoints.length ? config.positionPoints[idx] : 0
  const bonuses =
    (row.earnedPole ? config.poleBonus : 0) + (row.fastestLap ? config.fastestLapBonus : 0) + row.bonusPoints + config.participationPoints
  return Math.max(0, base + bonuses - row.penaltyPoints)
}

export function scoreRaceRows(
  rows: RaceRowDraft[],
  config: StandingsScoringConfig,
  adjustmentsByDriver: Map<string, number> = new Map(),
): EventScore[] {
  return rows.map((row) => {
    const earned = earnedPointsForRow(row, config)
    const adjustment = adjustmentsByDriver.get(row.driverId) ?? 0
    return {
      driverId: row.driverId,
      earnedPoints: earned,
      adjustmentPoints: adjustment,
      totalPoints: earned + adjustment,
      finishPosition: row.finishPosition,
      status: row.status,
      earnedPole: row.earnedPole,
      fastestLap: row.fastestLap,
      classId: row.classId,
      regionId: row.regionId,
      teamId: row.teamId,
    }
  })
}

// ---- Save payloads ------------------------------------------------------------------------------

export function toSaveRaceRow(row: RaceRowDraft): SaveRaceRowPayload {
  const gap = canonicalGap(row.gapType, row.gapValue, null)
  const classified = isClassifiedFinisher(row.status)
  return {
    driver_id: row.driverId,
    finish_position: row.finishPosition,
    start_position: row.startPosition,
    laps_completed: row.lapsCompleted,
    // Only a classified finisher carries race timing; the leader carries a total time and no gap, everyone else a gap.
    total_time_ms: classified && row.finishPosition === 1 ? row.totalTimeMs : null,
    gap_ms: classified && row.finishPosition !== 1 ? gap.ms : null,
    gap_type: classified && row.finishPosition !== 1 ? gap.type : null,
    gap_value: classified && row.finishPosition !== 1 ? gap.value : null,
    best_lap_ms: row.bestLapMs,
    fastest_lap: row.fastestLap,
    earned_pole: row.earnedPole,
    pole_manually_overridden: row.poleManuallyOverridden,
    status: row.status,
    bonus_points: row.bonusPoints,
    penalty_points: row.penaltyPoints,
    team_id: row.teamId,
    class_id: row.classId,
    region_id: row.regionId,
    notes: row.notes,
  }
}

export function toSaveQualifyingRow(row: QualifyingRowDraft): SaveQualifyingRowPayload {
  return {
    driver_id: row.driverId,
    position: row.status === 'set' ? row.position : null,
    best_lap_ms: row.bestLapMs,
    gap_ms: row.gapMs,
    status: row.status,
    grid_adjustment: row.gridAdjustment,
    penalty_positions: row.penaltyPositions,
    earned_pole: row.status === 'set' && row.position === 1,
    notes: row.notes,
  }
}

export interface FinalizeOutput {
  driver_id: string
  earned_points: number
  adjustment_points: number
  total_points: number
  finish_position: number | null
  status: string
  earned_pole: boolean
  fastest_lap: boolean
  class_id: string | null
  region_id: string | null
  team_id: string | null
}

export interface FinalizeSnapshotRow {
  driver_id: string | null
  team_id: string | null
  position: number
  points: number
  wins: number
  seconds: number
  thirds: number
  podiums: number
  poles: number
  fastest_laps: number
  starts: number
  average_finish: number | null
  clinched: boolean
  eliminated: boolean
}

export interface FinalizeSnapshot {
  standings_type: 'overall' | 'class' | 'regional' | 'team'
  group_key: string | null
  rows: FinalizeSnapshotRow[]
}

function snapshotRow(r: StandingRow): FinalizeSnapshotRow {
  return {
    driver_id: r.driverId,
    team_id: r.teamId,
    position: r.position,
    points: r.points,
    wins: r.wins,
    seconds: r.seconds,
    thirds: r.thirds,
    podiums: r.podiums,
    poles: r.poles,
    fastest_laps: r.fastestLaps,
    starts: r.starts,
    average_finish: r.averageFinish,
    clinched: r.clinched,
    eliminated: r.eliminated,
  }
}

/**
 * The scoring payload iOS sends into `vrc_save_results` (mirror of `buildFinalizePayload`): this event's outputs, plus the
 * cumulative standings snapshots for Overall, every Class, every Region and (when teams are enabled) Team — computed with the
 * same series evaluator that drives the Standings screen — and the award claims for the series ledger. The event being saved
 * is official the moment the save commits, so it is never "remaining" (callers pass a planner that already treats it as official).
 */
export function buildFinalizePayload(args: {
  eventId: string
  eventRound: number
  thisScores: EventScore[]
  priorEvents: SeriesEventScores[]
  driverInfo: Map<string, DriverInfo>
  teamInfo: Map<string, string>
  config: StandingsScoringConfig
  planner: SubSeriesPlanner
  championshipName: string
  classes: { id: string; name: string }[]
  regions: { id: string; name: string }[]
  teamsEnabled: boolean
  scheduleKnown: boolean
}): { outputs: FinalizeOutput[]; snapshots: FinalizeSnapshot[]; awardClaims: SeriesAwardClaim[] } {
  const outputs: FinalizeOutput[] = args.thisScores.map((s) => ({
    driver_id: s.driverId,
    earned_points: s.earnedPoints,
    adjustment_points: s.adjustmentPoints,
    total_points: s.totalPoints,
    finish_position: s.finishPosition,
    status: s.status,
    earned_pole: s.earnedPole,
    fastest_lap: s.fastestLap,
    class_id: s.classId,
    region_id: s.regionId,
    team_id: s.teamId,
  }))

  const eventScores: SeriesEventScores[] = [
    { eventId: args.eventId, round: args.eventRound, scores: args.thisScores },
    ...args.priorEvents.filter((e) => e.eventId !== args.eventId),
  ]

  const snapshots: FinalizeSnapshot[] = []
  const claims: SeriesAwardClaim[] = []
  function addSeries(key: SeriesKey, name: string, type: FinalizeSnapshot['standings_type'], groupKey: string | null) {
    const rows = seriesRows({ key, events: eventScores, driverInfo: args.driverInfo, config: args.config, planner: args.planner })
    // A class/region with no scored results has no standings (and no award to sync).
    if (key.scope !== 'overall' && rows.length === 0) return
    snapshots.push({ standings_type: type, group_key: groupKey, rows: rows.map(snapshotRow) })
    const outcome = seriesOutcome({ key, name, rows, events: eventScores, driverInfo: args.driverInfo, config: args.config, planner: args.planner })
    claims.push(awardClaim(key, outcome))
  }
  addSeries(OVERALL_SERIES, args.championshipName, 'overall', null)
  for (const c of args.classes) addSeries(classSeries(c.id), c.name, 'class', c.id)
  for (const r of args.regions) addSeries(regionSeries(r.id), r.name, 'regional', r.id)
  if (args.teamsEnabled) {
    const teamRows = teamStandings(eventScores.map((e) => e.scores), args.teamInfo)
    if (teamRows.length > 0) snapshots.push({ standings_type: 'team', group_key: null, rows: teamRows.map(snapshotRow) })
  }

  // Awards only ever come from a complete read of the schedule: an empty schedule (a failed fetch) or a degraded plan would
  // make series look decided that are not.
  return { outputs, snapshots, awardClaims: args.scheduleKnown ? claims : [] }
}
