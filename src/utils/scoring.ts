import type { RaceResultRow, ScoringOutputRow } from '@/types/database'

/**
 * Ports the points/tiebreak/clinch math from StandingsEngine.swift /
 * VRCScoringEngine.swift so the web app's race-result entry screen can compute
 * the same `scoring_outputs` + `standings_snapshot_rows` payloads the native
 * app sends into `vrc_save_results` / `vrc_finalize_event`. Reading existing
 * standings never needs this file — only entering/saving new results does.
 */
export interface ScoringRule {
  positionPoints: number[]
  poleBonus: number
  fastestLapBonus: number
}

export const DEFAULT_SCORING_RULE: ScoringRule = {
  positionPoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  poleBonus: 1,
  fastestLapBonus: 1,
}

export function pointsForResult(result: RaceResultRow, rule: ScoringRule): number {
  if (result.status !== 'fin' || !result.finish_position || result.finish_position <= 0) return 0
  const idx = result.finish_position - 1
  const base = idx < rule.positionPoints.length ? rule.positionPoints[idx] : 0
  const pole = result.earned_pole ? rule.poleBonus : 0
  const fastest = result.fastest_lap ? rule.fastestLapBonus : 0
  return Math.max(0, base + pole + fastest - result.penalty_points + result.bonus_points)
}

export interface StandingAccumulator {
  driverId: string
  points: number
  wins: number
  seconds: number
  thirds: number
  poles: number
  fastestLaps: number
  starts: number
}

export function emptyAccumulator(driverId: string): StandingAccumulator {
  return { driverId, points: 0, wins: 0, seconds: 0, thirds: 0, poles: 0, fastestLaps: 0, starts: 0 }
}

export function accumulate(
  acc: StandingAccumulator,
  result: RaceResultRow,
  rule: ScoringRule,
): StandingAccumulator {
  const points = pointsForResult(result, rule)
  return {
    driverId: acc.driverId,
    points: acc.points + points,
    wins: acc.wins + (result.finish_position === 1 && result.status === 'fin' ? 1 : 0),
    seconds: acc.seconds + (result.finish_position === 2 && result.status === 'fin' ? 1 : 0),
    thirds: acc.thirds + (result.finish_position === 3 && result.status === 'fin' ? 1 : 0),
    poles: acc.poles + (result.earned_pole ? 1 : 0),
    fastestLaps: acc.fastestLaps + (result.fastest_lap ? 1 : 0),
    starts: acc.starts + (result.status !== 'dns' ? 1 : 0),
  }
}

/** Exact tiebreak order: points > wins > 2nds > 3rds > poles > fastest laps > name (asc). */
export function compareStandings(
  a: StandingAccumulator & { displayName: string },
  b: StandingAccumulator & { displayName: string },
): number {
  return (
    b.points - a.points ||
    b.wins - a.wins ||
    b.seconds - a.seconds ||
    b.thirds - a.thirds ||
    b.poles - a.poles ||
    b.fastestLaps - a.fastestLaps ||
    a.displayName.localeCompare(b.displayName)
  )
}

export interface ClinchInput {
  driverId: string
  points: number
}

export interface ClinchResult {
  driverId: string
  clinched: boolean
  eliminated: boolean
}

/** Leader clinches once no one still mathematically catches them; mirror for elimination. */
export function applyClinching(
  rows: ClinchInput[],
  completedRaceCount: number,
  totalRaceCount: number,
  maxRacePoints: number,
): ClinchResult[] {
  if (rows.length === 0) return []
  const leader = rows[0]
  const remaining = Math.max(0, totalRaceCount - completedRaceCount)
  const available = remaining * maxRacePoints

  return rows.map((row) => ({
    driverId: row.driverId,
    clinched:
      row.driverId === leader.driverId &&
      rows.slice(1).every((other) => leader.points > other.points + available),
    eliminated: row.driverId !== leader.driverId && row.points + available < leader.points,
  }))
}

export interface SeasonStandingsRow {
  driver_id: string
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

/**
 * Rebuilds the season-wide "overall" standings from every event's persisted
 * scoring_outputs (across the whole season, including the event just saved)
 * — this is the payload shape vrc_save_results expects for
 * standings_snapshot_rows. Class/region/team breakdowns follow the same
 * pattern, filtering `outputs` to a single class_id/region_id/team_id first.
 */
export function buildSeasonStandingsRows(
  outputs: ScoringOutputRow[],
  displayNameByDriver: Map<string, string>,
  totalRaceCount: number,
  maxRacePoints = DEFAULT_SCORING_RULE.positionPoints[0] + DEFAULT_SCORING_RULE.poleBonus + DEFAULT_SCORING_RULE.fastestLapBonus,
): SeasonStandingsRow[] {
  const finishesByDriver = new Map<string, number[]>()
  const accByDriver = new Map<string, StandingAccumulator>()

  for (const output of outputs) {
    const acc = accByDriver.get(output.driver_id) ?? emptyAccumulator(output.driver_id)
    accByDriver.set(output.driver_id, {
      driverId: output.driver_id,
      points: acc.points + output.total_points,
      wins: acc.wins + (output.finish_position === 1 && output.status === 'fin' ? 1 : 0),
      seconds: acc.seconds + (output.finish_position === 2 && output.status === 'fin' ? 1 : 0),
      thirds: acc.thirds + (output.finish_position === 3 && output.status === 'fin' ? 1 : 0),
      poles: acc.poles + (output.earned_pole ? 1 : 0),
      fastestLaps: acc.fastestLaps + (output.fastest_lap ? 1 : 0),
      starts: acc.starts + (output.status !== 'dns' ? 1 : 0),
    })
    if (output.finish_position && output.finish_position > 0) {
      const list = finishesByDriver.get(output.driver_id) ?? []
      list.push(output.finish_position)
      finishesByDriver.set(output.driver_id, list)
    }
  }

  const completedRaceCount = new Set(outputs.map((o) => o.event_id)).size

  const sorted = Array.from(accByDriver.values())
    .map((acc) => ({ ...acc, displayName: displayNameByDriver.get(acc.driverId) ?? 'Unknown driver' }))
    .sort(compareStandings)

  const clinching = applyClinching(
    sorted.map((s) => ({ driverId: s.driverId, points: s.points })),
    completedRaceCount,
    totalRaceCount,
    maxRacePoints,
  )
  const clinchByDriver = new Map(clinching.map((c) => [c.driverId, c]))

  return sorted.map((row, index) => {
    const finishes = finishesByDriver.get(row.driverId) ?? []
    return {
      driver_id: row.driverId,
      position: index + 1,
      points: row.points,
      wins: row.wins,
      seconds: row.seconds,
      thirds: row.thirds,
      podiums: row.wins + row.seconds + row.thirds,
      poles: row.poles,
      fastest_laps: row.fastestLaps,
      starts: row.starts,
      average_finish: finishes.length > 0 ? finishes.reduce((a, b) => a + b, 0) / finishes.length : null,
      clinched: clinchByDriver.get(row.driverId)?.clinched ?? false,
      eliminated: clinchByDriver.get(row.driverId)?.eliminated ?? false,
    }
  })
}
