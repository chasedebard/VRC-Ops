import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCORING_RULE,
  SEASON_BONUS_POINTS_DEFAULT,
  buildSeasonScoringRule,
  buildTeamStandingsRows,
  clampSeasonBonusPoints,
  hasEffectiveScoringConfigChanged,
  isValidSeasonBonusPoints,
  pointsForResult,
  type SeasonBonusConfig,
  type SeasonStandingsRow,
} from './scoring'
import type { RaceResultRow, RaceResultStatus } from '@/types/database'

function raceResult(overrides: Partial<RaceResultRow> = {}): RaceResultRow {
  return {
    id: 'r1',
    result_set_id: 'rs1',
    league_id: 'league1',
    driver_id: 'driver1',
    finish_position: 1,
    start_position: 1,
    laps_completed: 20,
    total_time_ms: null,
    gap_ms: null,
    best_lap_ms: null,
    fastest_lap: false,
    earned_pole: false,
    pole_manually_overridden: false,
    status: 'fin',
    bonus_points: 0,
    penalty_points: 0,
    team_id: null,
    class_id: null,
    region_id: null,
    notes: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function seasonConfig(overrides: Partial<SeasonBonusConfig> = {}): SeasonBonusConfig {
  return {
    pole_bonus_enabled: false,
    pole_bonus_points: 1,
    fastest_lap_bonus_enabled: false,
    fastest_lap_bonus_points: 1,
    ...overrides,
  }
}

describe('buildSeasonScoringRule', () => {
  it('is 0/0 when both bonuses are disabled', () => {
    const rule = buildSeasonScoringRule(seasonConfig())
    expect(rule.poleBonus).toBe(0)
    expect(rule.fastestLapBonus).toBe(0)
  })

  it('uses the stored point value only while enabled', () => {
    const rule = buildSeasonScoringRule(
      seasonConfig({ pole_bonus_enabled: true, pole_bonus_points: 2, fastest_lap_bonus_enabled: true, fastest_lap_bonus_points: 3 }),
    )
    expect(rule.poleBonus).toBe(2)
    expect(rule.fastestLapBonus).toBe(3)
  })

  it('retains the stored point value while disabled but derives 0', () => {
    const rule = buildSeasonScoringRule(seasonConfig({ pole_bonus_enabled: false, pole_bonus_points: 3 }))
    expect(rule.poleBonus).toBe(0)
  })

  it('falls back to safe defaults for null/undefined season (old cache)', () => {
    expect(buildSeasonScoringRule(null)).toEqual({ ...DEFAULT_SCORING_RULE, poleBonus: 0, fastestLapBonus: 0 })
    expect(buildSeasonScoringRule(undefined)).toEqual({ ...DEFAULT_SCORING_RULE, poleBonus: 0, fastestLapBonus: 0 })
  })

  it('clamps an out-of-range or missing stored point value to the default', () => {
    const rule = buildSeasonScoringRule(seasonConfig({ pole_bonus_enabled: true, pole_bonus_points: 99 }))
    expect(rule.poleBonus).toBe(3)
    const rule2 = buildSeasonScoringRule(seasonConfig({ pole_bonus_enabled: true, pole_bonus_points: null as unknown as number }))
    expect(rule2.poleBonus).toBe(SEASON_BONUS_POINTS_DEFAULT)
  })
})

describe('clampSeasonBonusPoints / isValidSeasonBonusPoints', () => {
  it('accepts exactly 1, 2, 3', () => {
    expect(isValidSeasonBonusPoints(1)).toBe(true)
    expect(isValidSeasonBonusPoints(2)).toBe(true)
    expect(isValidSeasonBonusPoints(3)).toBe(true)
  })

  it('rejects out-of-range or non-integer values', () => {
    expect(isValidSeasonBonusPoints(0)).toBe(false)
    expect(isValidSeasonBonusPoints(4)).toBe(false)
    expect(isValidSeasonBonusPoints(1.5)).toBe(false)
  })

  it('clamps to the nearest valid bound', () => {
    expect(clampSeasonBonusPoints(0)).toBe(1)
    expect(clampSeasonBonusPoints(10)).toBe(3)
    expect(clampSeasonBonusPoints(null)).toBe(1)
    expect(clampSeasonBonusPoints(undefined)).toBe(1)
  })
})

describe('hasEffectiveScoringConfigChanged', () => {
  it('is false when toggling a disabled bonus point value (no effective change)', () => {
    const before = seasonConfig({ pole_bonus_enabled: false, pole_bonus_points: 1 })
    const after = seasonConfig({ pole_bonus_enabled: false, pole_bonus_points: 3 })
    expect(hasEffectiveScoringConfigChanged(before, after)).toBe(false)
  })

  it('is true when enabling a bonus', () => {
    const before = seasonConfig({ pole_bonus_enabled: false })
    const after = seasonConfig({ pole_bonus_enabled: true, pole_bonus_points: 1 })
    expect(hasEffectiveScoringConfigChanged(before, after)).toBe(true)
  })

  it('is true when changing the enabled point value (1 -> 3)', () => {
    const before = seasonConfig({ pole_bonus_enabled: true, pole_bonus_points: 1 })
    const after = seasonConfig({ pole_bonus_enabled: true, pole_bonus_points: 3 })
    expect(hasEffectiveScoringConfigChanged(before, after)).toBe(true)
  })

  it('is false for an unchanged save', () => {
    const config = seasonConfig({ pole_bonus_enabled: true, pole_bonus_points: 2, fastest_lap_bonus_enabled: true, fastest_lap_bonus_points: 1 })
    expect(hasEffectiveScoringConfigChanged(config, { ...config })).toBe(false)
  })
})

describe('pointsForResult eligibility', () => {
  const rule = { positionPoints: [25, 18, 15], poleBonus: 2, fastestLapBonus: 3 }

  it.each<RaceResultStatus>(['dns', 'dnf', 'dsq', 'nc'])('awards zero points (incl. bonuses) for status %s', (status) => {
    const result = raceResult({ status, finish_position: status === 'dns' || status === 'dsq' || status === 'nc' ? null : 1, earned_pole: true, fastest_lap: true })
    expect(pointsForResult(result, rule)).toBe(0)
  })

  it('awards base + bonus points for a classified pole winner with fastest lap', () => {
    const result = raceResult({ status: 'classified', finish_position: 1, earned_pole: true, fastest_lap: true })
    expect(pointsForResult(result, rule)).toBe(25 + 2 + 3)
  })

  it('awards base + bonus points for a fin winner', () => {
    const result = raceResult({ status: 'fin', finish_position: 1, earned_pole: true, fastest_lap: true })
    expect(pointsForResult(result, rule)).toBe(25 + 2 + 3)
  })

  it('does not award pole/fastest-lap bonus unless earned', () => {
    const result = raceResult({ status: 'fin', finish_position: 2, earned_pole: false, fastest_lap: false })
    expect(pointsForResult(result, rule)).toBe(18)
  })
})

describe('buildTeamStandingsRows', () => {
  function driverRow(overrides: Partial<SeasonStandingsRow>): SeasonStandingsRow {
    return {
      driver_id: 'd',
      position: 1,
      points: 0,
      wins: 0,
      seconds: 0,
      thirds: 0,
      podiums: 0,
      poles: 0,
      fastest_laps: 0,
      starts: 1,
      average_finish: null,
      clinched: false,
      eliminated: false,
      ...overrides,
    }
  }

  it('sums each team driver\'s already-bonused total exactly once (no double-counting)', () => {
    const driverA = driverRow({ driver_id: 'a', points: 120, wins: 3, poles: 2 })
    const driverB = driverRow({ driver_id: 'b', points: 95, wins: 1 })
    const teamIdByDriver = new Map([
      ['a', 'team-red'],
      ['b', 'team-red'],
    ])
    const teamNameById = new Map([['team-red', 'Team Red']])
    const rows = buildTeamStandingsRows([driverA, driverB], teamIdByDriver, teamNameById)
    expect(rows).toHaveLength(1)
    expect(rows[0].points).toBe(215)
    expect(rows[0].wins).toBe(4)
    expect(rows[0].poles).toBe(2)
  })

  it('excludes drivers with no team assignment from every team total', () => {
    const teamed = driverRow({ driver_id: 'a', points: 50 })
    const untamed = driverRow({ driver_id: 'unassigned', points: 999 })
    const teamIdByDriver = new Map([['a', 'team-red']])
    const rows = buildTeamStandingsRows([teamed, untamed], teamIdByDriver, new Map())
    expect(rows).toHaveLength(1)
    expect(rows[0].points).toBe(50)
  })

  it('orders teams by points, then wins/seconds/thirds/poles/fastestLaps, then name', () => {
    const a = driverRow({ driver_id: 'a', points: 100, wins: 2 })
    const b = driverRow({ driver_id: 'b', points: 100, wins: 3 })
    const teamIdByDriver = new Map([
      ['a', 'alpha'],
      ['b', 'bravo'],
    ])
    const teamNameById = new Map([
      ['alpha', 'Alpha'],
      ['bravo', 'Bravo'],
    ])
    const rows = buildTeamStandingsRows([a, b], teamIdByDriver, teamNameById)
    expect(rows.map((r) => r.team_id)).toEqual(['bravo', 'alpha'])
    expect(rows[0].position).toBe(1)
    expect(rows[1].position).toBe(2)
  })

  it('falls back to team id for name-based tiebreak when no name is known', () => {
    const a = driverRow({ driver_id: 'a', points: 10 })
    const b = driverRow({ driver_id: 'b', points: 10 })
    const teamIdByDriver = new Map([
      ['a', 'zzz'],
      ['b', 'aaa'],
    ])
    const rows = buildTeamStandingsRows([a, b], teamIdByDriver, new Map())
    expect(rows.map((r) => r.team_id)).toEqual(['aaa', 'zzz'])
  })
})
