import type { DriverRow, QualifyingResultRow, RaceResultRow, SeasonDriverRow } from '@/types/database'
import { canonicalGap, normalizeQualifyingPole, type QualifyingRowDraft, type RaceRowDraft } from '@/utils/resultEntry'

let keyCounter = 0
const nextKey = (prefix: string) => `${prefix}-${++keyCounter}`

/** Maps the canonical season-roster assignment into a new result row (the legacy global-driver fields are never the source). */
export function assignmentDefaults(
  assignment: Pick<SeasonDriverRow, 'team_id' | 'class_id' | 'region_id'> | undefined,
  flags: { teamsEnabled: boolean; classesEnabled: boolean; regionsEnabled: boolean },
): { teamId: string | null; classId: string | null; regionId: string | null } {
  return {
    teamId: flags.teamsEnabled ? (assignment?.team_id ?? null) : null,
    classId: flags.classesEnabled ? (assignment?.class_id ?? null) : null,
    regionId: flags.regionsEnabled ? (assignment?.region_id ?? null) : null,
  }
}

export function raceRowToDraft(row: RaceResultRow): RaceRowDraft {
  // A pre-`gap_type` row carries only `gap_ms`; canonicalize it to a time gap so downstream reads never re-guess the encoding.
  const gap = canonicalGap(row.gap_type, row.gap_value, row.gap_ms)
  return {
    key: row.id,
    driverId: row.driver_id,
    finishPosition: row.finish_position,
    startPosition: row.start_position,
    lapsCompleted: row.laps_completed,
    totalTimeMs: row.total_time_ms,
    gapType: gap.type,
    gapValue: gap.value,
    bestLapMs: row.best_lap_ms,
    fastestLap: row.fastest_lap,
    earnedPole: row.earned_pole,
    poleManuallyOverridden: row.pole_manually_overridden,
    status: row.status,
    bonusPoints: row.bonus_points ?? 0,
    penaltyPoints: row.penalty_points ?? 0,
    teamId: row.team_id,
    classId: row.class_id,
    regionId: row.region_id,
    notes: row.notes,
  }
}

export function qualifyingRowToDraft(row: QualifyingResultRow): QualifyingRowDraft {
  return {
    key: row.id,
    driverId: row.driver_id,
    position: row.position,
    bestLapMs: row.best_lap_ms,
    gapMs: row.gap_ms,
    status: row.status,
    gridAdjustment: row.grid_adjustment ?? 0,
    penaltyPositions: row.penalty_positions ?? 0,
    earnedPole: row.earned_pole,
    notes: row.notes,
  }
}

export function newRaceDraft(
  driverId: string,
  opts: { isDns: boolean; poleManual: boolean; defaults: { teamId: string | null; classId: string | null; regionId: string | null } },
): RaceRowDraft {
  return {
    key: nextKey('race'),
    driverId,
    finishPosition: null,
    startPosition: null,
    lapsCompleted: null,
    totalTimeMs: null,
    gapType: null,
    gapValue: null,
    bestLapMs: null,
    fastestLap: false,
    earnedPole: false,
    poleManuallyOverridden: opts.poleManual,
    status: opts.isDns ? 'dns' : 'fin',
    bonusPoints: 0,
    penaltyPoints: 0,
    teamId: opts.defaults.teamId,
    classId: opts.defaults.classId,
    regionId: opts.defaults.regionId,
    notes: null,
  }
}

export function newQualifyingDraft(driverId: string, isDns: boolean): QualifyingRowDraft {
  return {
    key: nextKey('qual'),
    driverId,
    position: null,
    bestLapMs: null,
    gapMs: null,
    status: isDns ? 'dns' : 'set',
    gridAdjustment: 0,
    penaltyPositions: 0,
    earnedPole: false,
    notes: null,
  }
}

/** Adds every missing active season driver to an editable draft while preserving existing rows exactly as entered. */
export function seedMissingRaceDrafts(
  rows: RaceRowDraft[],
  active: DriverRow[],
  ctx: {
    dnsDriverIds: Set<string>
    roster: Pick<SeasonDriverRow, 'driver_id' | 'team_id' | 'class_id' | 'region_id'>[]
    flags: { teamsEnabled: boolean; classesEnabled: boolean; regionsEnabled: boolean }
  },
): RaceRowDraft[] {
  const existing = new Set(rows.map((r) => r.driverId))
  const poleManual = rows.some((r) => r.poleManuallyOverridden)
  const added = active
    .filter((d) => !existing.has(d.id))
    .map((d) =>
      newRaceDraft(d.id, {
        isDns: ctx.dnsDriverIds.has(d.id),
        poleManual,
        defaults: assignmentDefaults(ctx.roster.find((r) => r.driver_id === d.id), ctx.flags),
      }),
    )
  return [...rows, ...added]
}

export function seedMissingQualifyingDrafts(rows: QualifyingRowDraft[], active: DriverRow[], dnsDriverIds: Set<string>): QualifyingRowDraft[] {
  const existing = new Set(rows.map((r) => r.driverId))
  const added = active.filter((d) => !existing.has(d.id)).map((d) => newQualifyingDraft(d.id, dnsDriverIds.has(d.id)))
  return normalizeQualifyingPole([...rows, ...added])
}
