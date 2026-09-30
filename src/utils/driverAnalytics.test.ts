import { describe, expect, it } from 'vitest'
import {
  biggestRival,
  careerDetail,
  careerProgression,
  careerSummary,
  classStrengths,
  driverRecords,
  milestones,
  mostImprovedSeasonText,
  recentForm,
  scopedStats,
  seasonTrend,
  trackHistory,
  trendSummary,
  type HistoryEntry,
} from './driverAnalytics'
import type { EventRow, SeasonRow } from '@/types/database'

let counter = 0
function entry(over: Partial<HistoryEntry> & { event_id: string }): HistoryEntry {
  counter += 1
  return {
    id: `h${counter}`,
    league_id: 'L',
    championship_id: 'C',
    season_id: 'S1',
    driver_id: 'me',
    result_kind: 'race',
    track_id: null,
    region_id: null,
    class_id: null,
    team_id: null,
    finish_position: 1,
    start_position: null,
    qualifying_position: null,
    best_lap_ms: null,
    earned_pole: false,
    fastest_lap: false,
    status: 'fin',
    points: 25,
    is_team_event: false,
    result_revision: 1,
    saved_at: `2026-01-${String(counter).padStart(2, '0')}T00:00:00Z`,
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function event(id: string, round: number, over: Partial<EventRow> = {}): EventRow {
  return {
    id,
    league_id: 'L',
    championship_id: 'C',
    season_id: 'S1',
    round,
    title: `Race ${round}`,
    custom_title: null,
    track_id: `T${round}`,
    track_layout: null,
    event_date: `2026-02-${String(round).padStart(2, '0')}`,
    start_time: null,
    time_zone: null,
    class_id: null,
    region_id: null,
    practice_config: null,
    qualifying_minutes: null,
    race_distance_type: null,
    race_value: null,
    tire_rules: null,
    fuel_rules: null,
    weather_notes: null,
    penalty_notes: null,
    notes: null,
    status: 'completed',
    is_published: true,
    is_team_event: false,
    created_at: '',
    updated_at: '',
    ...over,
  } as EventRow
}

function season(id: string, name: string, status: SeasonRow['status'], end: string | null, start = '2025-01-01'): SeasonRow {
  return { id, name, status, end_date: end, start_date: start } as SeasonRow
}

describe('scopedStats', () => {
  it('never counts DNS as a start and keeps DNF/DSQ out of finish averages', () => {
    const rows = [
      entry({ event_id: 'e1', finish_position: 1, earned_pole: true, fastest_lap: true }),
      entry({ event_id: 'e2', finish_position: 3, points: 15 }),
      entry({ event_id: 'e3', finish_position: null, status: 'dnf', points: 0 }),
      entry({ event_id: 'e4', finish_position: null, status: 'dns', points: 0 }),
      entry({ event_id: 'e5', finish_position: 2, status: 'dsq', earned_pole: true, points: 0 }),
    ]
    const stats = scopedStats(rows)
    expect(stats.entries).toBe(5)
    expect(stats.starts).toBe(4)
    expect(stats.wins).toBe(1)
    expect(stats.podiums).toBe(2)
    expect(stats.poles).toBe(1) // the DSQ pole never counts
    expect(stats.averageFinish).toBe(2)
    expect(stats.dnfCount).toBe(1)
    expect(stats.dnsCount).toBe(1)
    expect(stats.dsqCount).toBe(1)
    expect(stats.finishRate).toBeCloseTo(0.5)
    expect(stats.winRate).toBeCloseTo(0.25)
  })

  it('returns empty stats for no race rows and ignores qualifying rows', () => {
    expect(scopedStats([]).starts).toBe(0)
    expect(scopedStats([entry({ event_id: 'e1', result_kind: 'qualifying' })]).entries).toBe(0)
  })
})

describe('recent form and trend', () => {
  const events = new Map([1, 2, 3, 4].map((r) => [`e${r}`, event(`e${r}`, r)]))
  it('orders newest first and labels the trend', () => {
    const rows = [
      entry({ event_id: 'e1', finish_position: 9 }),
      entry({ event_id: 'e2', finish_position: 6 }),
      entry({ event_id: 'e3', finish_position: 3 }),
      entry({ event_id: 'e4', finish_position: 2 }),
    ]
    const recent = recentForm(rows, events)
    expect(recent.map((r) => r.label)).toEqual(['P2', 'P3', 'P6'])
    expect(trendSummary(recent)).toEqual({ label: 'Rising', subtitle: 'Improving' })
  })

  it('reports limited data under three races and labels a decline', () => {
    expect(trendSummary([])).toEqual({ label: 'New', subtitle: 'Limited data' })
    const two = recentForm([entry({ event_id: 'e1' }), entry({ event_id: 'e2' })], events)
    expect(trendSummary(two).label).toBe('Limited Data')
    const falling = recentForm(
      [entry({ event_id: 'e2', finish_position: 1 }), entry({ event_id: 'e3', finish_position: 4 }), entry({ event_id: 'e4', finish_position: 8 })],
      events,
    )
    expect(trendSummary(falling)).toEqual({ label: 'Falling', subtitle: 'Declining' })
  })

  it('labels non-finishing results by status, not position', () => {
    const recent = recentForm([entry({ event_id: 'e1', status: 'dnf', finish_position: null })], events)
    expect(recent[0].label).toBe('DNF')
  })
})

describe('career detail', () => {
  const seasons = [season('S1', '2025', 'completed', '2025-12-01'), season('S2', '2026', 'active', null, '2026-01-01')]
  const history = [
    entry({ event_id: 'a', season_id: 'S1', driver_id: 'me', points: 50 }),
    entry({ event_id: 'a', season_id: 'S1', driver_id: 'rival', points: 30 }),
    entry({ event_id: 'b', season_id: 'S2', driver_id: 'me', points: 10 }),
    entry({ event_id: 'b', season_id: 'S2', driver_id: 'rival', points: 40 }),
    entry({ event_id: 'x', season_id: 'FOREIGN', driver_id: 'me', points: 999 }),
  ]

  it('ranks by summed points, credits only completed-season wins, and drops foreign seasons', () => {
    const detail = careerDetail('me', history, seasons)
    expect(detail.seasonsParticipated).toBe(2)
    expect(detail.placements.map((p) => [p.seasonName, p.rank, p.isChampionship])).toEqual([
      ['2026', 2, false],
      ['2025', 1, true],
    ])
    expect(detail.championshipsWon).toBe(1)
    expect(detail.bestChampionshipFinish).toBe(1)
    expect(detail.stats.points).toBe(60) // the foreign-league row never leaks in
  })

  it('finds the most improved season from newest-first placements', () => {
    const text = mostImprovedSeasonText([
      { seasonId: 'c', seasonName: '2027', rank: 1, fieldSize: 10, points: 1, isCompleted: true, isChampionship: true },
      { seasonId: 'b', seasonName: '2026', rank: 4, fieldSize: 10, points: 1, isCompleted: true, isChampionship: false },
      { seasonId: 'a', seasonName: '2025', rank: 5, fieldSize: 10, points: 1, isCompleted: true, isChampionship: false },
    ])
    expect(text).toBe('2027: up 3 positions')
    expect(mostImprovedSeasonText([])).toBeNull()
  })
})

describe('tracks, classes and records', () => {
  const events = new Map([
    ['e1', event('e1', 1, { track_id: 'T1' })],
    ['e2', event('e2', 2, { track_id: 'T1' })],
    ['e3', event('e3', 3, { track_id: 'T1' })],
    ['e4', event('e4', 4, { track_id: 'T2', class_id: 'K1' })],
    ['e5', event('e5', 5, { track_id: 'T1', track_layout: 'Reverse' })],
  ])
  const rows = [
    entry({ event_id: 'e1', finish_position: 1 }),
    entry({ event_id: 'e2', finish_position: 3 }),
    entry({ event_id: 'e3', finish_position: 5 }),
    entry({ event_id: 'e4', finish_position: 2, class_id: 'K1' }),
    entry({ event_id: 'e5', finish_position: 8 }),
  ]

  it('separates layouts and sorts by starts then average finish', () => {
    const tracks = trackHistory(rows, events, new Map([['T1', 'Suzuka'], ['T2', 'Spa']]))
    expect(tracks[0]).toMatchObject({ trackName: 'Suzuka', starts: 3, wins: 1, podiums: 2, bestFinish: 1 })
    expect(tracks).toHaveLength(3)
  })

  it('derives class strengths, favourite and most successful track', () => {
    const strengths = classStrengths(rows, events, new Map([['K1', 'GT3']]))
    expect(strengths).toHaveLength(1)
    expect(strengths[0]).toMatchObject({ className: 'GT3', starts: 1, podiums: 1, isLimitedData: true })
    const tracks = trackHistory(rows, events, new Map([['T1', 'Suzuka']]))
    const records = driverRecords(rows, tracks, null)
    expect(records).toMatchObject({ bestFinish: 1, worstFinish: 8, favoriteTrack: 'Suzuka', mostSuccessfulTrack: 'Suzuka' })
  })

  it('only credits a most-successful track with at least three starts', () => {
    const tracks = trackHistory([rows[3]], events)
    expect(driverRecords([rows[3]], tracks, null).mostSuccessfulTrack).toBeNull()
  })

  it('summarises a career with the union of assigned and raced seasons', () => {
    const summary = careerSummary(rows, ['S9'])
    expect(summary).toMatchObject({ seasons: 2, starts: 5, wins: 1, podiums: 3, totalPoints: 125 })
  })
})

describe('progression, milestones and rival', () => {
  const events = new Map([1, 2, 3].map((r) => [`e${r}`, event(`e${r}`, r)]))

  it('accumulates points and rates race by race', () => {
    const rows = [
      entry({ event_id: 'e1', finish_position: 1, points: 25 }),
      entry({ event_id: 'e2', finish_position: 6, points: 8 }),
      entry({ event_id: 'e3', finish_position: null, status: 'dns', points: 0 }),
    ]
    const progression = careerProgression(rows, events)
    expect(progression).toHaveLength(2) // DNS is not a start
    expect(progression[1]).toMatchObject({ round: 2, cumulativePoints: 33, winRate: 0.5, podiumRate: 0.5 })
  })

  it('builds dated milestones in order, including championships', () => {
    const races = [entry({ event_id: 'e1', finish_position: 4 }), entry({ event_id: 'e2', finish_position: 2 }), entry({ event_id: 'e3', finish_position: 1 })]
    const qualifying = [entry({ event_id: 'e2', result_kind: 'qualifying', earned_pole: true })]
    const seasons = new Map([['S1', season('S1', '2025', 'completed', '2025-12-01')]])
    const career = careerDetail('me', [entry({ event_id: 'a', season_id: 'S1', points: 5 })], [seasons.get('S1') as SeasonRow])
    const list = milestones({ races, qualifying, joinedAt: '2025-01-05T00:00:00Z', career, seasons, eventById: events })
    expect(list.map((m) => m.kind)).toEqual(['joinedLeague', 'championship', 'firstRace', 'firstPole', 'firstPodium', 'firstWin'])
    expect(list.find((m) => m.kind === 'firstPodium')?.detail).toBe('Race 2')
  })

  it('picks the closest rival with at least three shared finishes', () => {
    const rows: HistoryEntry[] = []
    for (let i = 1; i <= 3; i++) {
      rows.push(entry({ event_id: `r${i}`, driver_id: 'me', finish_position: 2 }))
      rows.push(entry({ event_id: `r${i}`, driver_id: 'near', finish_position: i === 3 ? 1 : 3 }))
      rows.push(entry({ event_id: `r${i}`, driver_id: 'far', finish_position: 10 }))
    }
    rows.push(entry({ event_id: 'r1', driver_id: 'once', finish_position: 2 }))
    const rival = biggestRival('me', rows)
    expect(rival).toMatchObject({ driverId: 'near', sharedRaces: 3, aheadCount: 2 })
    expect(rival?.record).toBe('Finished ahead in 2 of 3 shared races')
    expect(biggestRival('me', rows.slice(0, 4))).toBeNull()
  })
})

describe('seasonTrend', () => {
  it('accumulates points across scored events and carries finish and qualifying positions', () => {
    const events = [event('e1', 1), event('e2', 2), event('e3', 3)]
    const trend = seasonTrend(
      'me',
      'S1',
      events,
      new Map([['e1', 25], ['e3', 10]]),
      [entry({ event_id: 'e1', finish_position: 1 }), entry({ event_id: 'e3', finish_position: 7 })],
      [entry({ event_id: 'e1', result_kind: 'qualifying', qualifying_position: 2 })],
    )
    expect(trend).toEqual([
      { round: 1, points: 25, finish: 1, qualifying: 2 },
      { round: 3, points: 35, finish: 7, qualifying: null },
    ])
  })
})
