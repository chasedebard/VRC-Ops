import { describe, expect, it } from 'vitest'
import {
  awardEntries,
  championshipTitles,
  milestoneState,
  PODIUM_TIERS,
  raceTrophyStats,
  TROPHY_GEMSTONES,
  trophyCount,
  trophyMilestones,
  type LiveAwardLite,
} from './trophyCase'
import { RFS_DEFAULT_CONFIG } from './standingsEngine'
import type { HistoryEntry } from './driverAnalytics'
import type { EventRow, ScoringOutputRow, SeasonRow } from '@/types/database'

const input = (earnedCount: number, extra: Partial<{ wins: number; secondPlaces: number; thirdPlaces: number }> = {}) => ({
  earnedCount,
  wins: 0,
  secondPlaces: 0,
  thirdPlaces: 0,
  ...extra,
})

describe('trophy milestone engine', () => {
  it('is locked with no progress and reports distance to the first tier', () => {
    const s = milestoneState('firstPlace', input(0))
    expect(s.isClaimed).toBe(false)
    expect(s.currentTierIndex).toBe(-1)
    expect(s.nextMilestone).toBe(1)
    expect(s.remainingToNextMilestone).toBe(1)
    expect(s.progressToNextMilestone).toBe(0)
    expect(s.unlockedGemstones).toEqual([])
  })

  it('claims the base tier without a gemstone, then adds one gemstone per tier cumulatively', () => {
    const base = milestoneState('firstPlace', input(1))
    expect(base.currentTierIndex).toBe(0)
    expect(base.unlockedGemstones).toEqual([])
    const tier2 = milestoneState('firstPlace', input(5))
    expect(tier2.unlockedGemstones).toEqual(['Emerald'])
    const tier4 = milestoneState('firstPlace', input(15))
    expect(tier4.unlockedGemstones).toEqual(['Emerald', 'Sapphire', 'Ruby'])
    expect(tier4.unlockedStructuralUpgrades).toEqual([1, 5, 10, 15])
  })

  it('uses a separate win schedule (tops out at 150) and reaches the maximum tier', () => {
    const max = milestoneState('firstPlace', input(150))
    expect(max.isMaximumPrestigeTier).toBe(true)
    expect(max.nextMilestone).toBeNull()
    expect(max.progressToNextMilestone).toBeNull()
    expect(max.unlockedGemstones).toHaveLength(TROPHY_GEMSTONES.length)
    expect(milestoneState('polePosition', input(150)).isMaximumPrestigeTier).toBe(false)
  })

  it('interpolates progress between the current and next milestone', () => {
    const s = milestoneState('secondPlace', input(7)) // tier at 5, next 10
    expect(s.currentMilestone).toBe(5)
    expect(s.nextMilestone).toBe(10)
    expect(s.progressToNextMilestone).toBeCloseTo(0.4)
    expect(s.remainingToNextMilestone).toBe(3)
  })

  it('gates podium tiers on the mix of wins, seconds and thirds, not just the total', () => {
    expect(PODIUM_TIERS).toHaveLength(9)
    const onlyTotal = milestoneState('podium', input(10, { wins: 10 }))
    expect(onlyTotal.currentTierIndex).toBe(0) // total met, but no 2nd/3rd
    expect(onlyTotal.nextTierRequirementProgress.map((r) => [r.metric, r.isSatisfied])).toEqual([
      ['earnedCount', true],
      ['wins', true],
      ['secondPlaces', false],
      ['thirdPlaces', false],
    ])
    const mixed = milestoneState('podium', input(10, { wins: 4, secondPlaces: 3, thirdPlaces: 3 }))
    expect(mixed.currentTierIndex).toBe(1)
  })

  it('uses the championship schedule for titles', () => {
    expect(milestoneState('champion', input(3)).currentMilestone).toBe(3)
    expect(milestoneState('subseriesChampion', input(2)).nextMilestone).toBe(3)
  })
})

describe('trophy career stats', () => {
  const base = {
    league_id: 'L',
    championship_id: 'C',
    season_id: 'S',
    driver_id: 'me',
    result_kind: 'race' as const,
    track_id: null,
    region_id: null,
    class_id: null,
    team_id: null,
    start_position: null,
    qualifying_position: null,
    best_lap_ms: null,
    result_revision: 1,
    saved_at: null,
    created_at: '',
    points: 0,
    is_team_event: false,
  }
  let n = 0
  const row = (over: Partial<HistoryEntry>): HistoryEntry =>
    ({ id: `r${++n}`, event_id: `e${n}`, finish_position: 1, earned_pole: false, fastest_lap: false, status: 'fin', ...base, ...over }) as HistoryEntry

  it('counts placements from own individual race rows in one championship and excludes cancelled events', () => {
    const history = [
      row({ event_id: 'e1', finish_position: 1, fastest_lap: true, earned_pole: true }),
      row({ event_id: 'e2', finish_position: 2 }),
      row({ event_id: 'e3', finish_position: 3 }),
      row({ event_id: 'e4', finish_position: 1, is_team_event: true }),
      row({ event_id: 'e5', finish_position: 1, championship_id: 'OTHER' }),
      row({ event_id: 'e6', finish_position: 1, status: 'dsq', earned_pole: true }),
      row({ event_id: 'e7', finish_position: 1 }),
    ]
    const events = new Map<string, Pick<EventRow, 'status'>>([
      ['e1', { status: 'completed' }],
      ['e2', { status: 'completed' }],
      ['e3', { status: 'completed' }],
      ['e6', { status: 'completed' }],
      ['e7', { status: 'cancelled' }],
    ])
    const stats = raceTrophyStats(history, 'C', events)
    expect(stats).toMatchObject({ firstPlaceFinishes: 1, secondPlaceFinishes: 1, thirdPlaceFinishes: 1, fastestLaps: 1, polePositions: 1 })
    expect(trophyCount('podium', stats)).toBe(3)
    // Without an event set nothing is filtered by event status.
    expect(raceTrophyStats(history, 'C').firstPlaceFinishes).toBe(2) // e1 + e7; team, other-championship and DSQ rows never count
  })

  it('builds one milestone state per trophy type', () => {
    const states = trophyMilestones({ championshipTitles: 1, subseriesTitles: 0, firstPlaceFinishes: 5, secondPlaceFinishes: 0, thirdPlaceFinishes: 0, fastestLaps: 0, polePositions: 0 })
    expect(states).toHaveLength(8)
    expect(states.find((s) => s.type === 'champion')?.isClaimed).toBe(true)
    expect(states.find((s) => s.type === 'podium')?.earnedCount).toBe(5)
  })
})

describe('championship titles', () => {
  const season = (id: string, status: SeasonRow['status']): SeasonRow => ({ id, name: id, status, drop_rounds: 0 }) as SeasonRow
  const output = (eventId: string, driverId: string, points: number, classId: string | null = null): ScoringOutputRow =>
    ({
      event_id: eventId,
      driver_id: driverId,
      earned_points: points,
      adjustment_points: 0,
      total_points: points,
      finish_position: points > 10 ? 1 : 2,
      status: 'fin',
      earned_pole: false,
      fastest_lap: false,
      class_id: classId,
      region_id: null,
      team_id: null,
    }) as ScoringOutputRow
  const eventById = new Map<string, EventRow>()
  const driverInfo = new Map([['me', { name: 'Me', number: '1' }], ['you', { name: 'You', number: '2' }]])
  const configFor = () => RFS_DEFAULT_CONFIG

  it('credits overall and class titles for a completed season, counting each series once', () => {
    const outputs = new Map([
      ['S1', [output('e1', 'me', 25, 'GT3'), output('e1', 'you', 18, 'GT3'), output('e2', 'me', 25, 'GT4'), output('e2', 'you', 30, 'GT4')]],
    ])
    const titles = championshipTitles({ driverId: 'me', completedSeasons: [season('S1', 'completed')], outputsBySeason: outputs, eventById, driverInfo, configFor })
    // Overall: me 50 vs you 48 → title. Class GT3: me. Class GT4: you.
    expect(titles).toEqual({ championships: 1, subseries: 1 })
  })

  it('never counts a provisional leader and de-duplicates a live award for the same series', () => {
    const awards: LiveAwardLite[] = [
      { id: 'a1', season_id: 'S1', driver_id: 'me', scope: 'overall', scope_id: null, status: 'champion', points: 50, clinched_round: 1, final_round: 2, awarded_at: '2026-01-01' },
      { id: 'a2', season_id: 'S2', driver_id: 'me', scope: 'class', scope_id: 'GT3', status: 'clinched', points: 40, clinched_round: 3, final_round: null, awarded_at: '2026-02-01' },
      { id: 'a3', season_id: 'S3', driver_id: 'me', scope: 'region', scope_id: 'EU', status: 'revoked', points: 1, clinched_round: null, final_round: null, awarded_at: '2026-02-02' },
    ]
    const outputs = new Map([['S1', [output('e1', 'me', 25), output('e1', 'you', 10)]]])
    const titles = championshipTitles({
      driverId: 'me',
      completedSeasons: [season('S1', 'completed')],
      outputsBySeason: outputs,
      eventById,
      driverInfo,
      configFor,
      awards,
    })
    expect(titles).toEqual({ championships: 1, subseries: 1 }) // S1 overall counted once; S2 class clinched; revoked S3 ignored
    const none = championshipTitles({ driverId: 'me', completedSeasons: [], outputsBySeason: new Map(), eventById, driverInfo, configFor })
    expect(none).toEqual({ championships: 0, subseries: 0 })
  })

  it('formats award rows exactly like the app', () => {
    const entries = awardEntries({
      awards: [
        { id: 'a1', season_id: 'S1', driver_id: 'me', scope: 'overall', scope_id: null, status: 'champion', points: 50, clinched_round: 8, final_round: 10, awarded_at: '2026-03-01' },
        { id: 'a2', season_id: 'S1', driver_id: 'me', scope: 'class', scope_id: 'GT4', status: 'clinched', points: 40, clinched_round: 7, final_round: null, awarded_at: '2026-02-01' },
        { id: 'a3', season_id: 'S1', driver_id: 'me', scope: 'region', scope_id: 'EU', status: 'champion', points: 30, clinched_round: 10, final_round: 10, awarded_at: '2026-01-01' },
      ],
      seasonNames: new Map([['S1', '2026']]),
      classNames: new Map([['GT4', 'Gr.4']]),
      regionNames: new Map(),
      championshipName: 'RFS Championship Series',
    })
    expect(entries.map((e) => e.title)).toEqual(['RFS Championship Series Champion', 'Gr.4 Clinched', 'Region Champion'])
    expect(entries[0].roundText).toBe('Secured after Round 8 · Final after Round 10')
    expect(entries[1].roundText).toBe('Clinched after Round 7')
    expect(entries[2].roundText).toBe('Final after Round 10')
    expect(entries[0].type).toBe('champion')
    expect(entries[1].type).toBe('subseriesChampion')
  })
})
