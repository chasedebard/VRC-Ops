import { describe, expect, it } from 'vitest'
import {
  buildMovement,
  buildSpotlight,
  buildTopStory,
  orderedRaceMarkets,
  percentText,
  previousProbability,
  resolveAccuracy,
} from './predictionPresentation'
import { parsePredictionSet } from '@/services/predictions'
import type {
  PredictionEntry,
  PredictionMarketKey,
  PredictionMarketResult,
  PredictionSet,
  StoredPredictionEvaluation,
  StoredPredictionRun,
} from '@/types/predictions'

function entry(id: string, name: string, probability: number, rank = 1): PredictionEntry {
  return {
    driver_id: id,
    driver_name: name,
    driver_number: '',
    probability,
    rank,
    confidence: 'medium',
    data_quality: 0.5,
    reasons: [`${name} reason`],
    key_stat: '',
  }
}

function market(key: PredictionMarketKey, entries: PredictionEntry[], groupId: string | null = null): PredictionMarketResult {
  return {
    market: key,
    group_id: groupId,
    group_name: null,
    entries,
    confidence: 'medium',
    data_quality: 0.5,
    basis_summary: '',
    inputs_used: [],
    inputs_missing: [],
  }
}

function set(markets: PredictionMarketResult[], overrides: Partial<PredictionSet> = {}): PredictionSet {
  return {
    model_version: 'VRC-Odds-v3-hybrid',
    phase: 'championship',
    championship_id: 'c',
    season_id: 's',
    event_id: null,
    generated_at: '2026-09-01T00:00:00Z',
    markets,
    inputs_summary: '',
    official_round_count: 3,
    remaining_round_count: 4,
    forecast: null,
    ...overrides,
  }
}

function run(
  id: string,
  category: string,
  signature: string,
  payload: PredictionSet | null,
  generatedAt: string,
  eventId: string | null = null,
): StoredPredictionRun {
  return {
    id,
    league_id: 'l',
    championship_id: 'c',
    season_id: 's',
    event_id: eventId,
    category,
    model_version: 'VRC-Odds-v3-hybrid',
    source_signature: signature,
    official_race_count: 0,
    payload,
    generated_at: generatedAt,
  }
}

describe('percentText', () => {
  it('uses <1% and >99% sentinels and rounds otherwise', () => {
    expect(percentText(0.004)).toBe('<1%')
    expect(percentText(0.995)).toBe('>99%')
    expect(percentText(0.385)).toBe('39%')
    expect(percentText(0)).toBe('0%')
    expect(percentText(1)).toBe('100%')
  })
})

describe('orderedRaceMarkets', () => {
  it('orders pole, fastest lap, podium, then winner', () => {
    const ordered = orderedRaceMarkets([
      market('race_win', []),
      market('podium', []),
      market('pole', []),
      market('fastest_lap', []),
    ])
    expect(ordered.map((m) => m.market)).toEqual(['pole', 'fastest_lap', 'podium', 'race_win'])
  })
})

describe('buildMovement', () => {
  const current = set([market('championship', [entry('a', 'Ann', 0.6), entry('b', 'Bo', 0.3), entry('c', 'Cy', 0.1)])])
  const previousPayload = set([market('championship', [entry('a', 'Ann', 0.5), entry('b', 'Bo', 0.3), entry('c', 'Cy', 0.25)])])

  it('compares against the newest stored run with a different source signature', () => {
    const runs = [
      run('r1', 'championship', 'sig-now', current, '2026-09-02T00:00:00Z'),
      run('r2', 'championship', 'sig-old', previousPayload, '2026-09-01T00:00:00Z'),
    ]
    const moves = buildMovement(current, runs, 'sig-now')
    // Largest absolute move first.
    expect(moves.map((m) => m.driverId)).toEqual(['c', 'a'])
    expect(moves[0].delta).toBeCloseTo(-0.15)
    expect(moves[1].delta).toBeCloseTo(0.1)
  })

  it('returns nothing without a comparable earlier run', () => {
    expect(buildMovement(current, [run('r1', 'championship', 'sig-now', current, 'x')], 'sig-now')).toEqual([])
  })

  it('ignores moves under half a percentage point', () => {
    const tiny = set([market('championship', [entry('a', 'Ann', 0.602)])])
    const before = set([market('championship', [entry('a', 'Ann', 0.6)])])
    expect(buildMovement(tiny, [run('r2', 'championship', 'old', before, 'x')], 'now')).toEqual([])
  })
})

describe('previousProbability', () => {
  it('scopes to the same event and market', () => {
    const before = set([market('race_win', [entry('a', 'Ann', 0.4)])], { event_id: 'e1' })
    const runs = [
      run('r1', 'race', 'old', before, 'x', 'e1'),
      run('r2', 'race', 'old2', set([market('race_win', [entry('a', 'Ann', 0.9)])]), 'y', 'e2'),
    ]
    expect(
      previousProbability({ market: 'race_win', driverId: 'a', eventId: 'e1', storedRuns: runs, currentSignature: 'now' }),
    ).toBe(0.4)
    expect(
      previousProbability({ market: 'race_win', driverId: 'zz', eventId: 'e1', storedRuns: runs, currentSignature: 'now' }),
    ).toBeNull()
  })
})

describe('buildTopStory', () => {
  const champ = (p: number) => set([market('championship', [entry('a', 'Ann', p)])])
  const race = set([market('race_win', [entry('b', 'Bo', 0.4), entry('c', 'Cy', 0.36)])])

  it('prefers a dominant title favorite while rounds remain', () => {
    expect(buildTopStory({ race, championship: champ(0.8), eventTitle: 'Suzuka', remaining: 3 })?.title).toBe('Closing in on the title')
  })

  it('flags a tight race when the top two are within 8 points', () => {
    const story = buildTopStory({ race, championship: champ(0.5), eventTitle: 'Suzuka', remaining: 3 })
    expect(story?.title).toBe('Tight battle for the win')
    expect(story?.contextLine).toBe('Suzuka')
  })

  it('falls back to championship wording, and to "decided" at zero remaining', () => {
    expect(buildTopStory({ race: null, championship: champ(0.5), eventTitle: null, remaining: 2 })?.contextLine).toBe('2 rounds remaining')
    expect(buildTopStory({ race: null, championship: champ(0.5), eventTitle: null, remaining: 0 })?.title).toBe('Championship decided')
    expect(buildTopStory({ race: null, championship: null, eventTitle: null, remaining: 0 })).toBeNull()
  })
})

describe('buildSpotlight', () => {
  it('picks the driver with the most combined probability mass and reports trend', () => {
    const race = set([market('race_win', [entry('a', 'Ann', 0.5), entry('b', 'Bo', 0.2)]), market('podium', [entry('a', 'Ann', 0.8)])])
    const championship = set([market('championship', [entry('a', 'Ann', 0.6)])])
    const spotlight = buildSpotlight({
      race,
      championship,
      movement: [{ driverId: 'a', driverName: 'Ann', currentProbability: 0.6, previousProbability: 0.5, delta: 0.1 }],
    })
    expect(spotlight?.driverName).toBe('Ann')
    expect(spotlight?.bestMarket).toBe('podium')
    expect(spotlight?.weakestMarket).toBe('race_win')
    expect(spotlight?.trend).toBe('Title odds up 10% since the last update')
  })
})

describe('resolveAccuracy', () => {
  it('reshapes server evaluations into per-event reviews, newest first', () => {
    const evaluation = (
      id: string,
      eventId: string,
      category: string,
      hit: number,
      sample: number,
      at: string,
    ): StoredPredictionEvaluation => ({
      id,
      prediction_run_id: null,
      event_id: eventId,
      category,
      score: 0,
      hit_count: hit,
      sample_count: sample,
      summary: `${category} summary`,
      predicted_driver_ids: ['a'],
      actual_driver_ids: ['b'],
      evaluated_at: at,
    })
    const reviews = resolveAccuracy({
      events: [
        { id: 'e1', title: 'One' },
        { id: 'e2', title: 'Two' },
      ],
      storedRuns: [],
      evaluations: [
        evaluation('1', 'e1', 'race_win', 1, 1, '2026-09-01T00:00:00Z'),
        evaluation('2', 'e2', 'podium', 2, 3, '2026-09-08T00:00:00Z'),
        evaluation('3', 'e2', 'pole', 0, 1, '2026-09-08T00:00:00Z'),
        evaluation('4', 'e2', 'not_a_market', 1, 1, '2026-09-08T00:00:00Z'),
      ],
      driverNames: new Map([
        ['a', 'Ann'],
        ['b', 'Bo'],
      ]),
    })
    expect(reviews.map((r) => r.eventId)).toEqual(['e2', 'e1'])
    const two = reviews[0].reviews
    expect(two.map((r) => [r.market, r.outcome])).toEqual([
      ['podium', 'met_odds'],
      ['pole', 'miss'],
    ])
    expect(two[0].predictedDriverName).toBe('Ann')
    expect(two[0].actualDriverNames).toEqual(['Bo'])
  })
})

describe('parsePredictionSet', () => {
  it('tolerates payloads from other model versions', () => {
    expect(parsePredictionSet(null)).toBeNull()
    expect(parsePredictionSet({ pole: [] })).toBeNull() // the legacy web-written "vrc-ops-web-v1" shape
    expect(parsePredictionSet({ model_version: 'x', phase: 'post_race', markets: [{ market: 'pole', entries: [] }, { nope: true }] })?.markets).toHaveLength(1)
  })
})
