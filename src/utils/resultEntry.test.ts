import { describe, expect, it } from 'vitest'
import {
  blocksSave,
  buildFinalizePayload,
  canonicalGap,
  earnedPointsForRow,
  formatLapMs,
  formatRaceTimeMs,
  lapsDownLabel,
  normalizeQualifyingPole,
  orderQualifyingByLapTime,
  parseLapTimeMs,
  parseLapsDown,
  parseRaceTimeMs,
  resetPoleToQualifying,
  scoreRaceRows,
  selectPoleManually,
  syncPole,
  toSaveRaceRow,
  validateFinalRace,
  validateQualifying,
  validateRace,
  withLapsDown,
  withTimeGap,
  type QualifyingRowDraft,
  type RaceRowDraft,
} from './resultEntry'
import { RFS_DEFAULT_CONFIG, SubSeriesPlanner } from './standingsEngine'

let n = 0
function race(driverId: string, patch: Partial<RaceRowDraft> = {}): RaceRowDraft {
  return {
    key: `r${++n}`,
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
    poleManuallyOverridden: false,
    status: 'fin',
    bonusPoints: 0,
    penaltyPoints: 0,
    teamId: null,
    classId: null,
    regionId: null,
    notes: null,
    ...patch,
  }
}
function qual(driverId: string, patch: Partial<QualifyingRowDraft> = {}): QualifyingRowDraft {
  return { key: `q${++n}`, driverId, position: null, bestLapMs: null, gapMs: null, status: 'set', gridAdjustment: 0, penaltyPositions: 0, earnedPole: false, notes: null, ...patch }
}

describe('lap / race time text', () => {
  it('parses lap times in M:SS.mmm, SS.mmm and rejects implausible values', () => {
    expect(parseLapTimeMs('1:43.208')).toBe(103_208)
    expect(parseLapTimeMs('58.115')).toBe(58_115)
    expect(parseLapTimeMs('1:05,5')).toBe(65_500)
    expect(parseLapTimeMs('0.5')).toBeNull() // under a second
    expect(parseLapTimeMs('1:75.000')).toBeNull() // seconds >= 60 with minutes
    expect(parseLapTimeMs('abc')).toBeNull()
    expect(parseLapTimeMs('1:2:3')).toBeNull()
    expect(parseLapTimeMs('')).toBeNull()
  })

  it('round-trips lap formatting', () => {
    expect(formatLapMs(103_208)).toBe('1:43.208')
    expect(formatLapMs(58_115)).toBe('58.115')
    expect(formatLapMs(0)).toBeNull()
  })

  it('parses race totals and gaps with optional + and s suffix', () => {
    expect(parseRaceTimeMs('43:12.408')).toBe(2_592_408)
    expect(parseRaceTimeMs('1:02:11.004')).toBe(3_731_004)
    expect(parseRaceTimeMs('+12.408')).toBe(12_408)
    expect(parseRaceTimeMs('58.115s')).toBe(58_115)
    expect(parseRaceTimeMs('0')).toBeNull()
    expect(parseRaceTimeMs('1:99.000')).toBeNull()
    expect(parseRaceTimeMs('+')).toBeNull()
    expect(formatRaceTimeMs(3_731_004)).toBe('1:02:11.004')
    expect(formatRaceTimeMs(12_408)).toBe('12.408')
  })

  it('parses laps down as a positive whole number', () => {
    expect(parseLapsDown('2')).toBe(2)
    expect(parseLapsDown('0')).toBeNull()
    expect(parseLapsDown('1.5')).toBeNull()
    expect(parseLapsDown('-1')).toBeNull()
    expect(lapsDownLabel(1)).toBe('+1 Lap')
    expect(lapsDownLabel(3)).toBe('+3 Laps')
    expect(lapsDownLabel(0)).toBeNull()
  })
})

describe('gap handling', () => {
  it('canonicalizes the (type, value, ms) triple into one stored shape', () => {
    expect(canonicalGap('time', 5000, null)).toEqual({ type: 'time', value: 5000, ms: 5000 })
    expect(canonicalGap('laps', 2, 999)).toEqual({ type: 'laps', value: 2, ms: null })
    expect(canonicalGap(null, null, 1500)).toEqual({ type: 'time', value: 1500, ms: 1500 }) // legacy bare gap_ms
    expect(canonicalGap('laps', 0, null)).toEqual({ type: null, value: null, ms: null })
  })

  it('keeps time and laps gaps mutually exclusive', () => {
    const a = withLapsDown(withTimeGap(race('a'), 12_000), 2)
    expect(a.gapType).toBe('laps')
    expect(a.gapValue).toBe(2)
    expect(withTimeGap(a, null).gapType).toBeNull()
  })

  it('serializes timing exactly as the server validates it: winner has total time only, others have a gap only', () => {
    const winner = toSaveRaceRow(race('a', { finishPosition: 1, totalTimeMs: 2_592_408, gapType: 'time', gapValue: 100 }))
    expect(winner).toMatchObject({ total_time_ms: 2_592_408, gap_type: null, gap_value: null, gap_ms: null })
    const second = toSaveRaceRow(race('b', { finishPosition: 2, totalTimeMs: 99, gapType: 'time', gapValue: 12_408 }))
    expect(second).toMatchObject({ total_time_ms: null, gap_type: 'time', gap_value: 12_408, gap_ms: 12_408 })
    const lapped = toSaveRaceRow(race('c', { finishPosition: 3, gapType: 'laps', gapValue: 1 }))
    expect(lapped).toMatchObject({ gap_type: 'laps', gap_value: 1, gap_ms: null })
    const dnf = toSaveRaceRow(race('d', { status: 'dnf', finishPosition: null, gapType: 'time', gapValue: 5 }))
    expect(dnf).toMatchObject({ total_time_ms: null, gap_type: null, gap_value: null })
  })
})

describe('validation', () => {
  it('requires at least one driver, unique drivers and sane finishing positions', () => {
    expect(validateRace([]).map((i) => i.severity)).toEqual(['error'])
    const dup = validateRace([race('a', { finishPosition: 1 }), race('a', { finishPosition: 2 })])
    expect(dup.some((i) => i.message === 'A driver appears more than once.')).toBe(true)
    const shared = validateRace([race('a', { finishPosition: 1 }), race('b', { finishPosition: 1 })])
    expect(shared.some((i) => i.message === 'Two finishers share the same finishing position.')).toBe(true)
    const missing = validateRace([race('a', { finishPosition: null })])
    expect(missing.some((i) => i.message.includes('finishing position of 1 or higher'))).toBe(true)
    expect(blocksSave(validateRace([race('a', { finishPosition: 1 }), race('b', { finishPosition: 2 })]))).toBe(false)
  })

  it('allows only one fastest lap and one pole, and warns about a DNS with a position', () => {
    const issues = validateRace([
      race('a', { finishPosition: 1, fastestLap: true, earnedPole: true }),
      race('b', { finishPosition: 2, fastestLap: true, earnedPole: true }),
      race('c', { status: 'dns', finishPosition: 3 }),
    ])
    expect(issues.filter((i) => i.severity === 'error').map((i) => i.message)).toEqual(
      expect.arrayContaining(['Only one driver may hold the fastest lap.', 'Only one driver may hold pole.']),
    )
    expect(issues.some((i) => i.severity === 'warning')).toBe(true)
  })

  it('checks the server finalization rules per class (P1 total time, everyone else a gap)', () => {
    const good = [
      race('a', { finishPosition: 1, totalTimeMs: 2_000_000 }),
      race('b', { finishPosition: 2, gapType: 'time', gapValue: 5_000 }),
      race('c', { finishPosition: 3, gapType: 'laps', gapValue: 1 }),
      race('d', { status: 'dnf' }),
    ]
    expect(validateFinalRace(good, false, 'k1')).toEqual([])

    const missingTime = [race('a', { finishPosition: 1 }), race('b', { finishPosition: 2, gapType: 'time', gapValue: 5_000 })]
    expect(validateFinalRace(missingTime, false, 'k1').map((i) => i.message)).toContain(
      'Enter a total race time for each class winner (the class winner carries no gap).',
    )

    const missingGap = [race('a', { finishPosition: 1, totalTimeMs: 1 }), race('b', { finishPosition: 2 })]
    expect(validateFinalRace(missingGap, false, 'k1').some((i) => i.message.includes('needs a gap to the leader'))).toBe(true)

    const twoWinners = [race('a', { finishPosition: 1, totalTimeMs: 1 }), race('b', { finishPosition: 1, totalTimeMs: 1 })]
    expect(validateFinalRace(twoWinners, false, 'k1').map((i) => i.message)).toContain('Each class needs exactly one classified P1 winner.')
  })

  it('validates each class independently on a multi-class event', () => {
    const rows = [
      race('a', { classId: 'gr3', finishPosition: 1, totalTimeMs: 1 }),
      race('b', { classId: 'gr3', finishPosition: 2, gapType: 'time', gapValue: 1 }),
      race('c', { classId: 'gr4', finishPosition: 1, totalTimeMs: 1 }),
      race('d', { classId: 'gr4', finishPosition: 2, gapType: 'time', gapValue: 1 }),
    ]
    expect(validateFinalRace(rows, true, null)).toEqual([])
    rows[2] = { ...rows[2], finishPosition: 2 }
    expect(validateFinalRace(rows, true, null).length).toBeGreaterThan(0)
  })

  it('validates qualifying classification', () => {
    expect(validateQualifying([]).length).toBe(1)
    const ok = [qual('a', { position: 1 }), qual('b', { position: 2 }), qual('c', { status: 'dns' })]
    expect(blocksSave(validateQualifying(ok))).toBe(false)
    expect(blocksSave(validateQualifying([qual('a', { position: 1 }), qual('b', { position: 1 })]))).toBe(true)
    expect(blocksSave(validateQualifying([qual('a', { status: 'dsq', position: 3 })]))).toBe(true)
    expect(blocksSave(validateQualifying([qual('a', { position: null })]))).toBe(true)
    expect(blocksSave(validateQualifying([qual('a', { position: 1, gapMs: -5 })]))).toBe(true)
  })
})

describe('pole sync', () => {
  it('follows qualifying P1 while in automatic mode and clears it when there is none', () => {
    const rows = [race('a'), race('b')]
    const synced = syncPole(rows, 'a')
    expect(synced.map((r) => r.earnedPole)).toEqual([true, false])
    expect(syncPole(synced, null).map((r) => r.earnedPole)).toEqual([false, false])
  })

  it('never stomps a manual selection, including an intentional "no pole"', () => {
    const manual = selectPoleManually([race('a'), race('b')], 'b')
    expect(syncPole(manual, 'a').map((r) => r.earnedPole)).toEqual([false, true])
    const none = selectPoleManually([race('a'), race('b')], null)
    expect(syncPole(none, 'a').map((r) => r.earnedPole)).toEqual([false, false])
  })

  it('resets to qualifying only when a P1 exists', () => {
    const manual = selectPoleManually([race('a'), race('b')], 'b')
    expect(resetPoleToQualifying(manual, null)).toBe(manual)
    const reset = resetPoleToQualifying(manual, 'a')
    expect(reset.map((r) => r.earnedPole)).toEqual([true, false])
    expect(reset.some((r) => r.poleManuallyOverridden)).toBe(false)
  })

  it('keeps the persisted qualifying pole marker aligned with classification', () => {
    const rows = normalizeQualifyingPole([qual('a', { position: 1 }), qual('b', { position: 2, earnedPole: true }), qual('c', { status: 'dns', earnedPole: true })])
    expect(rows.map((r) => r.earnedPole)).toEqual([true, false, false])
  })

  it('orders qualifying by best lap, leaving untimed drivers after and DNS/DSQ unranked', () => {
    const rows = orderQualifyingByLapTime([
      qual('a', { bestLapMs: 90_000 }),
      qual('b', { bestLapMs: 88_000 }),
      qual('c', { position: 7 }),
      qual('d', { status: 'dsq', position: 2 }),
    ])
    expect(rows.map((r) => [r.driverId, r.position])).toEqual([
      ['a', 2],
      ['b', 1],
      ['c', 3],
      ['d', null],
    ])
    expect(rows.find((r) => r.driverId === 'b')?.earnedPole).toBe(true)
  })
})

describe('scoring + finalize payload', () => {
  it('scores position points plus bonuses minus penalties, floored at zero, for finishers only', () => {
    const cfg = { ...RFS_DEFAULT_CONFIG }
    expect(earnedPointsForRow(race('a', { finishPosition: 1, earnedPole: true, fastestLap: true }), cfg)).toBe(27)
    expect(earnedPointsForRow(race('a', { finishPosition: 2, penaltyPoints: 30 }), cfg)).toBe(0)
    expect(earnedPointsForRow(race('a', { finishPosition: 3, bonusPoints: 2 }), cfg)).toBe(17)
    expect(earnedPointsForRow(race('a', { status: 'dnf', finishPosition: 1 }), cfg)).toBe(0)
    expect(earnedPointsForRow(race('a', { status: 'classified', finishPosition: 4 }), cfg)).toBe(12)
  })

  it('adds manual adjustments separately from earned points', () => {
    const scores = scoreRaceRows([race('a', { finishPosition: 1 })], RFS_DEFAULT_CONFIG, new Map([['a', -3]]))
    expect(scores[0]).toMatchObject({ earnedPoints: 25, adjustmentPoints: -3, totalPoints: 22 })
  })

  it('builds outputs, overall/class/region/team snapshots and award claims from the same evaluator the screen uses', () => {
    const cfg = { ...RFS_DEFAULT_CONFIG, poleBonus: 0, fastestLapBonus: 0 }
    const rows = [
      race('a', { finishPosition: 1, classId: 'gr3', regionId: 'eu', teamId: 't1' }),
      race('b', { finishPosition: 2, classId: 'gr3', regionId: 'eu', teamId: 't1' }),
    ]
    const planner = new SubSeriesPlanner({ seasonEvents: [], officialEventIds: new Set(['e1']), eventClassIds: new Map(), eligibleDriverIds: new Set(['a', 'b']) })
    const payload = buildFinalizePayload({
      eventId: 'e1',
      eventRound: 1,
      thisScores: scoreRaceRows(rows, cfg),
      priorEvents: [],
      driverInfo: new Map([
        ['a', { name: 'Ann', number: '1' }],
        ['b', { name: 'Bo', number: '2' }],
      ]),
      teamInfo: new Map([['t1', 'Team One']]),
      config: cfg,
      planner,
      championshipName: 'Champ',
      classes: [{ id: 'gr3', name: 'Gr.3' }, { id: 'gr4', name: 'Gr.4' }],
      regions: [{ id: 'eu', name: 'Europe' }],
      teamsEnabled: true,
      scheduleKnown: true,
    })
    expect(payload.outputs.map((o) => [o.driver_id, o.total_points, o.class_id])).toEqual([
      ['a', 25, 'gr3'],
      ['b', 18, 'gr3'],
    ])
    expect(payload.snapshots.map((s) => [s.standings_type, s.group_key])).toEqual([
      ['overall', null],
      ['class', 'gr3'], // Gr.4 has no scored results, so it has no snapshot
      ['regional', 'eu'],
      ['team', null],
    ])
    // No events remain, so the series is complete: Ann is champion in every series.
    const overall = payload.snapshots[0].rows
    expect(overall[0]).toMatchObject({ driver_id: 'a', position: 1, clinched: true })
    expect(overall[1]).toMatchObject({ driver_id: 'b', eliminated: true })
    expect(payload.awardClaims.filter((c) => c.status === 'champion').map((c) => c.scope)).toEqual(['overall', 'class', 'region'])
    expect(payload.snapshots[3].rows[0]).toMatchObject({ team_id: 't1', points: 43 })
  })

  it('reports no award claims when the schedule could not be read reliably', () => {
    const planner = new SubSeriesPlanner({ seasonEvents: [], officialEventIds: new Set(), eventClassIds: null, eligibleDriverIds: new Set(), isReliable: false })
    const payload = buildFinalizePayload({
      eventId: 'e1',
      eventRound: 1,
      thisScores: scoreRaceRows([race('a', { finishPosition: 1 })], RFS_DEFAULT_CONFIG),
      priorEvents: [],
      driverInfo: new Map(),
      teamInfo: new Map(),
      config: RFS_DEFAULT_CONFIG,
      planner,
      championshipName: 'Champ',
      classes: [],
      regions: [],
      teamsEnabled: false,
      scheduleKnown: false,
    })
    expect(payload.awardClaims).toEqual([])
    expect(payload.snapshots).toHaveLength(1)
  })
})
