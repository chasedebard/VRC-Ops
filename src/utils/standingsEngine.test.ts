import { describe, expect, it } from 'vitest'
import {
  OVERALL_SERIES,
  RFS_DEFAULT_CONFIG,
  SubSeriesPlanner,
  applyDropRounds,
  awardClaim,
  classSeries,
  claimsNeedingSync,
  maxEventPoints,
  outcomeStatusLine,
  outcomeTitle,
  rankedDriverRows,
  regionSeries,
  seriesOutcome,
  seriesRows,
  showsOutIndicators,
  standingRowMarker,
  subSeriesStandings,
  teamStandings,
  type EventScore,
  type StandingsScoringConfig,
  type SubSeriesContext,
  type SubSeriesStatus,
} from './standingsEngine'
import type { RaceResultStatus } from '@/types/database'

// Ported from vrc-platform's VRCSubSeriesStandingsTests / VRCSeriesAwardsTests. The default config is the RFS table
// [25,18,15,12,10,8,6,4,2,1], pole 1, FL 1, so the most a driver can add in one event is 27.
const cfg = RFS_DEFAULT_CONFIG

let counter = 0
const id = (prefix = 'd') => `${prefix}-${++counter}`

function score(
  driverId: string,
  points: number,
  opts: { pos?: number | null; status?: RaceResultStatus; pole?: boolean; fl?: boolean; classId?: string; regionId?: string; teamId?: string } = {},
): EventScore {
  return {
    driverId,
    earnedPoints: points,
    adjustmentPoints: 0,
    totalPoints: points,
    finishPosition: opts.pos ?? null,
    status: opts.status ?? 'fin',
    earnedPole: opts.pole ?? false,
    fastestLap: opts.fl ?? false,
    classId: opts.classId ?? null,
    regionId: opts.regionId ?? null,
    teamId: opts.teamId ?? null,
  }
}

function ctx(remaining: number, eligible: string[]): SubSeriesContext {
  return { remainingEventCount: remaining, eligibleDriverIds: new Set(eligible) }
}

/** One event in which driver i scored points[i] — stands up a table with the exact current points. */
function table(points: number[], remaining: number, opts: { eligible?: number[]; extraRoster?: number; config?: StandingsScoringConfig } = {}) {
  const ids = points.map(() => id())
  const extras = Array.from({ length: opts.extraRoster ?? 0 }, () => id('extra'))
  const eligible = (opts.eligible ?? ids.map((_, i) => i)).map((i) => ids[i]).concat(extras)
  const rows = subSeriesStandings([points.map((p, i) => score(ids[i], p))], new Map(), opts.config ?? cfg, ctx(remaining, eligible), () => true)
  const byId = new Map(rows.map((r) => [r.driverId as string, r]))
  return { ids, status: (i: number): SubSeriesStatus | null | undefined => byId.get(ids[i])?.subSeriesStatus, rows: byId }
}

describe('bounds', () => {
  it('derives max event points from the config, not a constant', () => {
    expect(maxEventPoints(cfg)).toBe(27)
    expect(maxEventPoints({ positionPoints: [30, 20, 10], poleBonus: 2, fastestLapBonus: 3, participationPoints: 1, dropRounds: 0 })).toBe(36)
    expect(maxEventPoints({ ...cfg, positionPoints: [5, 9, 3], poleBonus: 0, fastestLapBonus: 0 })).toBe(9)
    expect(maxEventPoints({ ...cfg, positionPoints: [] })).toBe(2)
  })

  it('applies drop rounds by removing the lowest totals', () => {
    expect(applyDropRounds([10, 20, 5], 1)).toEqual({ counted: 30, dropped: 1 })
    expect(applyDropRounds([10, 20], 2)).toEqual({ counted: 30, dropped: 0 }) // never drops below the round count
    expect(applyDropRounds([10, 20, 5], 0)).toEqual({ counted: 35, dropped: 0 })
  })
})

describe('Out / Clinched / Champion / Tied', () => {
  it('is out only when maximum possible points fall short of the leader', () => {
    const t = table([100, 73, 72], 1)
    expect(t.status(1)).not.toBe('out') // 73 + 27 ties 100
    expect(t.status(2)).toBe('out') // 72 + 27 = 99 < 100
  })

  it('is not clinched merely by leading', () => {
    const t = table([100, 80, 10], 1)
    expect(t.status(0)).toBe('active') // 80 + 27 = 107 > 100
    expect(t.status(1)).toBe('active')
    expect(t.status(2)).toBe('out')
  })

  it('clinches before the final round when nobody can catch the leader', () => {
    const t = table([100, 72, 30], 1)
    expect(t.status(0)).toBe('clinched')
    expect(t.status(1)).toBe('out')
    expect(t.status(2)).toBe('out')
  })

  it('names one champion and sends everyone else Out when the series is complete', () => {
    const t = table([82, 75, 61, 0], 0)
    expect(t.status(0)).toBe('champion')
    for (const i of [1, 2, 3]) expect(t.status(i)).toBe('out')
  })

  it('marks a completed series that is level after every tie-break as Tied, never Champion', () => {
    const t = table([60, 60, 20], 0)
    expect(t.status(0)).toBe('tied')
    expect(t.status(1)).toBe('tied')
    expect(t.status(2)).toBe('out')
  })

  it('settles a points tie with the standings tie-break (wins)', () => {
    const a = id()
    const b = id()
    const events = [
      [score(a, 25, { pos: 1 }), score(b, 18, { pos: 2 })],
      [score(a, 18, { pos: 2 }), score(b, 25, { pos: 1 })],
    ]
    const level = subSeriesStandings(events, new Map(), cfg, ctx(0, [a, b]), () => true)
    expect(level.every((r) => r.subSeriesStatus === 'tied')).toBe(true) // 43 each, 1 win + 1 second each

    const decided = [
      [score(a, 25, { pos: 1 }), score(b, 18, { pos: 2 })],
      [score(a, 18, { pos: 2 }), score(b, 18, { pos: 2 })],
      [score(a, 0, { status: 'dns' }), score(b, 7, { pos: 4 })],
    ]
    const result = subSeriesStandings(decided, new Map(), cfg, ctx(0, [a, b]), () => true)
    expect(result.find((r) => r.driverId === a)?.subSeriesStatus).toBe('champion') // 43 pts, 1 win
    expect(result.find((r) => r.driverId === b)?.subSeriesStatus).toBe('out') // 43 pts, 0 wins
  })

  it('never shows Out together with a winner state, and flags mirror the status', () => {
    for (const remaining of [0, 1, 2, 3]) {
      const t = table([100, 90, 75, 40, 0], remaining)
      for (const row of t.rows.values()) {
        expect(row.eliminated).toBe(row.subSeriesStatus === 'out')
        expect(row.clinched).toBe(row.subSeriesStatus === 'clinched' || row.subSeriesStatus === 'champion')
        expect(row.eliminated && row.clinched).toBe(false)
      }
    }
  })

  it.each([1, 2, 3, 6, 12])('moves the Out line with how many events are left (%i)', (remaining) => {
    const leader = 500
    const reach = 27 * remaining
    const t = table([leader, leader - reach - 1, leader - reach + 1], remaining)
    expect(t.status(1)).toBe('out') // one point short even winning everything
    expect(t.status(2)).not.toBe('out')
    expect(t.status(0)).not.toBe('clinched')
  })

  it('lets an unscored active-roster driver block a clinch only while they can still score', () => {
    expect(table([20], 1, { extraRoster: 1 }).status(0)).toBe('active')
    expect(table([20], 1, { extraRoster: 0 }).status(0)).toBe('clinched')
    expect(table([30], 1, { extraRoster: 1 }).status(0)).toBe('clinched') // 0 + 27 < 30
    expect(table([20], 0, { extraRoster: 1 }).status(0)).toBe('champion')
  })

  it('bounds a driver who cannot enter the remaining events by their current points', () => {
    const t = table([30, 55], 1, { eligible: [0] })
    expect(t.status(0)).toBe('active')
    expect(t.status(1)).toBe('active')
    const settled = table([10, 55], 1, { eligible: [0] })
    expect(settled.status(0)).toBe('out')
    expect(settled.status(1)).toBe('clinched')
  })

  it('respects drop rounds when deciding who is Out', () => {
    const leader = id()
    const chaser = id()
    const events = [
      [score(leader, 50, { pos: 1 }), score(chaser, 10, { pos: 4 })],
      [score(leader, 0, { status: 'dns' }), score(chaser, 10, { pos: 4 })],
      [score(leader, 0, { status: 'dns' }), score(chaser, 10, { pos: 4 })],
    ]
    const status = (dropRounds: number) =>
      subSeriesStandings(events, new Map(), { ...cfg, dropRounds }, ctx(1, [leader, chaser]), () => true).find((r) => r.driverId === chaser)
        ?.subSeriesStatus
    expect(status(0)).toBe('active')
    expect(status(1)).toBe('out')
  })

  it('a driver who can only tie and loses the tie-break is Out', () => {
    const tenOnly: StandingsScoringConfig = { positionPoints: [10], poleBonus: 0, fastestLapBonus: 0, participationPoints: 0, dropRounds: 0 }
    const leader = id()
    const chaser = id()
    const events = [
      [score(leader, 10, { pos: 1 }), score(chaser, 10, { pos: 3 })],
      [score(leader, 10, { pos: 1 }), score(chaser, 0, { status: 'dns' })],
    ]
    const rows = subSeriesStandings(events, new Map(), tenOnly, ctx(1, [leader, chaser]), () => true)
    expect(rows.find((r) => r.driverId === chaser)?.subSeriesStatus).toBe('out')
    expect(rows.find((r) => r.driverId === leader)?.subSeriesStatus).toBe('clinched')
  })
})

describe('the Round 11 / Round 12 production scenario', () => {
  it('Asia/Pacific has nothing left, so it is final', () => {
    const t = table([82, 75, 28, 61, 32, 56, 10, 0, 8], 0)
    expect(t.status(0)).toBe('champion')
    for (let i = 1; i < 9; i++) expect(t.status(i)).toBe('out')
  })

  it('Americas keeps only the drivers who can still pass the leader', () => {
    const t = table([73, 61, 34, 31, 27, 20, 8, 0, 0], 1)
    expect(t.status(0)).toBe('active')
    expect(t.status(1)).toBe('active')
    for (let i = 2; i < 9; i++) expect(t.status(i)).toBe('out')
  })

  it('Gr.4 leader has clinched with one Gr.4 event left', () => {
    const t = table([121, 91, 73, 44, 37, 34, 18, 8, 0], 1)
    expect(t.status(0)).toBe('clinched')
    for (let i = 1; i < 9; i++) expect(t.status(i)).toBe('out')
  })

  it('a driver can be clinched in one series and active in another', () => {
    const ambassador = id()
    const james = id()
    const c = ctx(1, [ambassador, james])
    const inGr4 = subSeriesStandings([[score(ambassador, 121), score(james, 91)]], new Map(), cfg, c, () => true)
    const inGr3 = subSeriesStandings([[score(ambassador, 86), score(james, 102)]], new Map(), cfg, c, () => true)
    expect(inGr4.find((r) => r.driverId === ambassador)?.subSeriesStatus).toBe('clinched')
    expect(inGr4.find((r) => r.driverId === james)?.subSeriesStatus).toBe('out')
    expect(inGr3.find((r) => r.driverId === ambassador)?.subSeriesStatus).toBe('active')
    expect(inGr3.find((r) => r.driverId === james)?.subSeriesStatus).toBe('active')
  })
})

describe('which events are still to run (SubSeriesPlanner)', () => {
  const americas = 'americas'
  const europe = 'europe'
  const asia = 'asia'
  const gr3 = 'gr3'
  const gr4 = 'gr4'
  const ev = (round: number, status: string, region: string | null, classId: string | null, eventId = `e${round}`) => ({
    id: eventId,
    round,
    status: status as 'scheduled',
    region_id: region,
    class_id: classId,
  })
  const season = [
    ev(1, 'scheduled', americas, gr4),
    ev(2, 'scheduled', asia, gr3),
    ev(3, 'scheduled', europe, gr4),
    ev(4, 'completed', americas, gr3),
    ev(11, 'scheduled', americas, gr4),
    ev(12, 'scheduled', europe, gr3),
  ]
  const planner = (official: string[]) =>
    new SubSeriesPlanner({ seasonEvents: season, officialEventIds: new Set(official), eventClassIds: new Map(), eligibleDriverIds: new Set() })

  it('treats a scheduled event with an official result as completed, not remaining', () => {
    expect(planner(['e1', 'e2', 'e3', 'e4']).remainingEvents.map((e) => e.round)).toEqual([11, 12])
  })

  it('counts a finalized race result set as official, but never a draft/reopened or qualifying-only set', () => {
    const official = SubSeriesPlanner.officialEventIds(new Set(), [
      { event_id: 'a', state: 'finalized' },
      { event_id: 'b', state: 'draft' },
      { event_id: 'c', state: 'reopened' },
    ])
    expect(official.has('a')).toBe(true)
    expect(official.has('b')).toBe(false)
    expect(official.has('c')).toBe(false)
  })

  it('never counts draft, cancelled, archived or completed events as remaining', () => {
    const events = ['draft', 'cancelled', 'archived', 'completed'].map((s, i) => ev(i + 1, s, europe, gr3))
    expect(SubSeriesPlanner.unfinishedEvents(events, new Set())).toHaveLength(0)
    const live = ['scheduled', 'live', 'postponed'].map((s, i) => ev(i + 1, s, europe, gr3))
    expect(SubSeriesPlanner.unfinishedEvents(live, new Set())).toHaveLength(3)
  })

  it('counts each region and class only its own remaining events', () => {
    const p = planner(['e1', 'e2', 'e3', 'e4'])
    expect(p.regionContext(americas).remainingEventCount).toBe(1)
    expect(p.regionContext(europe).remainingEventCount).toBe(1)
    expect(p.regionContext(asia).remainingEventCount).toBe(0)
    expect(p.classContext(gr4).remainingEventCount).toBe(1)
    expect(p.classContext(gr3).remainingEventCount).toBe(1)
    expect(p.overallContext().remainingEventCount).toBe(2)
  })

  it('counts a multi-class event toward every class it has, overriding the legacy column', () => {
    const e = ev(7, 'scheduled', europe, gr4)
    const multi = new SubSeriesPlanner({ seasonEvents: [e], officialEventIds: new Set(), eventClassIds: new Map([[e.id, [gr3, gr4]]]), eligibleDriverIds: new Set() })
    expect(multi.classContext(gr3).remainingEventCount).toBe(1)
    expect(multi.classContext(gr4).remainingEventCount).toBe(1)
    const narrowed = new SubSeriesPlanner({ seasonEvents: [e], officialEventIds: new Set(), eventClassIds: new Map([[e.id, [gr3]]]), eligibleDriverIds: new Set() })
    expect(narrowed.classContext(gr4).remainingEventCount).toBe(0)
  })

  it('over-counts every remaining event for every class when class membership is unknown', () => {
    const e = ev(12, 'scheduled', europe, gr4)
    const unknown = new SubSeriesPlanner({ seasonEvents: [e], officialEventIds: new Set(), eventClassIds: null, eligibleDriverIds: new Set(), isReliable: false })
    expect(unknown.classContext(gr3).remainingEventCount).toBe(1)
    expect(unknown.isReliable).toBe(false)
  })

  it('completes a series when its last event is cancelled or moved away', () => {
    const scheduled = ev(12, 'scheduled', europe, gr3)
    const before = new SubSeriesPlanner({ seasonEvents: [scheduled], officialEventIds: new Set(), eventClassIds: new Map(), eligibleDriverIds: new Set() })
    const after = new SubSeriesPlanner({ seasonEvents: [{ ...scheduled, status: 'cancelled' }], officialEventIds: new Set(), eventClassIds: new Map(), eligibleDriverIds: new Set() })
    const moved = new SubSeriesPlanner({ seasonEvents: [{ ...scheduled, region_id: asia }], officialEventIds: new Set(), eventClassIds: new Map(), eligibleDriverIds: new Set() })
    expect(before.regionContext(europe).remainingEventCount).toBe(1)
    expect(after.regionContext(europe).remainingEventCount).toBe(0)
    expect(moved.regionContext(europe).remainingEventCount).toBe(0)
    expect(moved.regionContext(asia).remainingEventCount).toBe(1)
  })
})

describe('ranking', () => {
  it('ranks by points, wins, seconds, thirds, poles, fastest laps, then name', () => {
    const a = id()
    const b = id()
    const info = new Map([
      [a, { name: 'Zed', number: '1' }],
      [b, { name: 'Amy', number: '2' }],
    ])
    const events = [[score(a, 25, { pos: 1 }), score(b, 25, { pos: 1 })]]
    const { rows } = rankedDriverRows(events, info, cfg)
    expect(rows.map((r) => r.name)).toEqual(['Amy', 'Zed']) // dead heat → alphabetical display order
  })

  it('counts poles only for drivers who started and were not disqualified, and fastest laps only for finishers', () => {
    const a = id()
    const events = [
      [score(a, 0, { status: 'dsq', pole: true, fl: true })],
      [score(a, 10, { pos: 5, status: 'fin', pole: true, fl: true })],
      [score(a, 0, { status: 'dns', pole: true })],
    ]
    const { rows } = rankedDriverRows(events, new Map(), cfg)
    expect(rows[0].poles).toBe(1)
    expect(rows[0].fastestLaps).toBe(1)
    expect(rows[0].starts).toBe(2) // dsq + fin started; dns did not
  })

  it('sub-series ranking matches the shared ranking', () => {
    const ids = [id(), id(), id(), id(), id()]
    const events = [[40, 90, 65, 65, 12].map((p, i) => score(ids[i], p))]
    const { rows: plain } = rankedDriverRows(events, new Map(), cfg)
    const sub = subSeriesStandings(events, new Map(), cfg, ctx(1, ids), () => true)
    expect(sub.map((r) => r.driverId)).toEqual(plain.map((r) => r.driverId))
    expect(sub.map((r) => r.points)).toEqual(plain.map((r) => r.points))
  })

  it('applies drop rounds to counted points while keeping gross points', () => {
    const a = id()
    const events = [[score(a, 25, { pos: 1 })], [score(a, 2, { pos: 9 })], [score(a, 18, { pos: 2 })]]
    const { rows } = rankedDriverRows(events, new Map(), { ...cfg, dropRounds: 1 })
    expect(rows[0].points).toBe(43)
    expect(rows[0].grossPoints).toBe(45)
    expect(rows[0].droppedRounds).toBe(1)
  })

  it('builds team standings from member totals and skips drivers without a team', () => {
    const a = id()
    const b = id()
    const c = id()
    const events = [[score(a, 25, { pos: 1, teamId: 'T1' }), score(b, 18, { pos: 2, teamId: 'T1' }), score(c, 15, { pos: 3 })]]
    const rows = teamStandings(events, new Map([['T1', 'Team One']]))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ teamId: 'T1', name: 'Team One', points: 43, wins: 1, seconds: 1 })
  })
})

describe('series outcome, markers and award claims', () => {
  const leader = 'lead'
  const chaser = 'chase'
  const info = new Map([
    [leader, { name: 'Leader', number: '7' }],
    [chaser, { name: 'Chaser', number: '9' }],
  ])
  const events = [
    { eventId: 'e1', round: 1, scores: [score(leader, 100, { pos: 1, classId: 'gr4' }), score(chaser, 20, { pos: 2, classId: 'gr4' })] },
    { eventId: 'e2', round: 2, scores: [score(leader, 27, { pos: 1, classId: 'gr4' }), score(chaser, 18, { pos: 2, classId: 'gr4' })] },
  ]
  const plannerFor = (remaining: number) =>
    new SubSeriesPlanner({
      seasonEvents: Array.from({ length: remaining }, (_, i) => ({ id: `r${i}`, round: 10 + i, status: 'scheduled' as const, region_id: null, class_id: 'gr4' })),
      officialEventIds: new Set(['e1', 'e2']),
      eventClassIds: new Map(),
      eligibleDriverIds: new Set([leader, chaser]),
    })

  function outcomeFor(remaining: number) {
    const planner = plannerFor(remaining)
    const key = classSeries('gr4')
    const rows = seriesRows({ key, events, driverInfo: info, config: cfg, planner })
    return { rows, outcome: seriesOutcome({ key, name: 'Gr.4', rows, events, driverInfo: info, config: cfg, planner }) }
  }

  it('announces a clinched series with the round it was secured and the remaining events', () => {
    const { outcome } = outcomeFor(1)
    expect(outcome?.kind).toBe('clinched')
    expect(outcome && outcomeTitle(outcome)).toBe('Gr.4 Clinched')
    expect(outcome?.securedRound).toBe(1)
    expect(outcome && outcomeStatusLine(outcome)).toBe('Clinched after Round 1 · 1 event remaining')
  })

  it('announces a champion once the series is complete', () => {
    const { outcome } = outcomeFor(0)
    expect(outcome?.kind).toBe('champion')
    expect(outcome && outcomeStatusLine(outcome)).toContain('Series complete')
  })

  it('announces nothing while a series is open', () => {
    const planner = plannerFor(5) // 38 + 5 x 27 still beats the leader's 127
    const key = classSeries('gr4')
    const rows = seriesRows({ key, events, driverInfo: info, config: cfg, planner })
    expect(seriesOutcome({ key, name: 'Gr.4', rows, events, driverInfo: info, config: cfg, planner })).toBeNull()
  })

  it('shows one trophy and suppresses Out indicators once a winner is named', () => {
    const { rows, outcome } = outcomeFor(1)
    expect(showsOutIndicators(outcome)).toBe(false)
    expect(standingRowMarker(rows.find((r) => r.driverId === leader)!, outcome)).toBe('trophy')
    expect(standingRowMarker(rows.find((r) => r.driverId === chaser)!, outcome)).toBe('none') // Out is hidden
  })

  it('shows Out indicators while the series is open', () => {
    const planner = plannerFor(3)
    const key = classSeries('gr4')
    const rows = seriesRows({ key, events: [{ eventId: 'x', round: 1, scores: [score(leader, 500, { classId: 'gr4' }), score(chaser, 10, { classId: 'gr4' })] }], driverInfo: info, config: cfg, planner })
    expect(showsOutIndicators(null)).toBe(true)
    expect(standingRowMarker(rows.find((r) => r.driverId === chaser)!, null)).toBe('out')
  })

  it('reports the series state as an award claim, and only syncs claims that differ from the live ledger', () => {
    const { outcome } = outcomeFor(1)
    const claim = awardClaim(classSeries('gr4'), outcome)
    expect(claim).toMatchObject({ scope: 'class', scope_id: 'gr4', status: 'clinched', driver_id: leader, clinched_event_id: 'e1' })
    expect(awardClaim(OVERALL_SERIES, null)).toMatchObject({ scope: 'overall', scope_id: null, status: 'active', driver_id: null })

    const live = [{ scope: 'class', scope_id: 'gr4', driver_id: leader, status: 'clinched' }]
    expect(claimsNeedingSync([claim], live)).toHaveLength(0) // already recorded correctly
    expect(claimsNeedingSync([{ ...claim, status: 'champion' }], live)).toHaveLength(1) // finalize in place
    expect(claimsNeedingSync([{ ...claim, driver_id: chaser }], live)).toHaveLength(1) // supersede
    expect(claimsNeedingSync([awardClaim(classSeries('gr4'), null)], live)).toHaveLength(1) // revoke
    expect(claimsNeedingSync([awardClaim(regionSeries('eu'), null)], live)).toHaveLength(0) // open + nothing recorded
  })
})
