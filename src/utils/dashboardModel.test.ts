import { describe, expect, it } from 'vitest'
import {
  adminAttention,
  cardRows,
  championshipBattle,
  composeCards,
  deriveUserContext,
  eventPhaseLabel,
  formTrendLabel,
  heroMetadataText,
  heroRoundLabel,
  isEventConcluded,
  lastFinalizedRace,
  performanceGap,
  racePhase,
  raceCountdown,
  setupWarnings,
  stableHash,
  stableSpotlightDriver,
  timeOfDayGreeting,
  upcomingEvent,
  NO_SIGNALS,
  pointsTrend,
} from './dashboardModel'
import type { StandingRow } from './standingsEngine'
import type { DriverRow, EventRow, ResultSetRow, VrcRole } from '@/types/database'

const ev = (id: string, round: number, over: Partial<EventRow> = {}): EventRow =>
  ({ id, round, title: `R${round}`, custom_title: null, status: 'scheduled', event_date: `2026-06-${String(10 + round).padStart(2, '0')}`, race_value: null, race_distance_type: null, ...over }) as EventRow

const set = (event_id: string, kind: 'race' | 'qualifying', state: string, finalized_at: string | null = null): ResultSetRow =>
  ({ event_id, kind, state, finalized_at }) as ResultSetRow

const ctx = (roles: VrcRole[], driver: string | null = null) => deriveUserContext(new Set(roles), driver)

describe('dashboard composer', () => {
  it('derives steward from marshal, driver from a linked driver, and viewer when nothing applies', () => {
    expect([...ctx(['marshal']).roles]).toEqual(['steward'])
    expect([...ctx(['viewer']).roles]).toEqual(['viewer'])
    expect([...ctx(['driver'], 'd1').roles]).toEqual(['driver'])
    // Driver role without a linked driver profile is not a dashboard driver.
    expect([...ctx(['driver']).roles]).toEqual(['viewer'])
  })

  it('shows management cards only to owners/admins and never duplicates a card for a multi-role user', () => {
    const cards = composeCards(ctx(['owner', 'admin', 'marshal'], 'd1'))
    expect(new Set(cards).size).toBe(cards.length)
    expect(cards).toEqual(expect.arrayContaining(['raceLeaders', 'seasonProgress', 'driverSpotlight', 'recentActivity', 'stewardReviewQueue', 'stewardPenalties', 'myRating']))
    // A driver (even Driver + Owner) gets the premium quick actions in the driver section, never the generic grid too.
    expect(cards).not.toContain('quickActions')
    const viewer = composeCards(ctx(['viewer']))
    expect(viewer).toEqual(expect.arrayContaining(['quickActions', 'lastRace', 'announcements', 'pointsTrend']))
    expect(viewer).not.toContain('raceLeaders')
    expect(viewer).not.toContain('myRating')
  })

  it('floats the steward review queue to the top only while reviews are pending', () => {
    const idle = composeCards(ctx(['marshal']), NO_SIGNALS)
    const busy = composeCards(ctx(['marshal']), { ...NO_SIGNALS, stewardReviewCount: 2 })
    expect(busy[0]).toBe('stewardReviewQueue')
    expect(idle[0]).not.toBe('stewardReviewQueue')
  })

  it('groups adjacent compact cards into one row', () => {
    const rows = cardRows(['raceLeaders', 'myRating', 'lastRace', 'announcements', 'stewardPenalties'])
    expect(rows).toEqual([['raceLeaders'], ['myRating', 'lastRace'], ['announcements'], ['stewardPenalties']])
  })
})

describe('phase and events', () => {
  const base = { hasActiveSeason: true, hasSchedule: true, hasRoster: true, upcomingEvent: null, isUpcomingEventLive: false, lastFinalizedEvent: null }
  const now = new Date(2026, 5, 10, 12)
  it('classifies the weekend cycle', () => {
    expect(racePhase({ ...base, hasRoster: false })).toBe('preSeason')
    expect(racePhase({ ...base, isUpcomingEventLive: true })).toBe('raceWeekend')
    expect(racePhase({ ...base, upcomingEvent: ev('a', 0, { event_date: '2026-06-10' }), now })).toBe('raceWeekend')
    expect(racePhase({ ...base, upcomingEvent: ev('a', 0, { event_date: '2026-06-15' }), now })).toBe('raceWeek')
    expect(racePhase({ ...base, upcomingEvent: ev('a', 0, { event_date: '2026-06-30' }), now })).toBe('offSeason')
    expect(racePhase({ ...base, lastFinalizedEvent: ev('a', 0, { event_date: '2026-06-08' }), now })).toBe('postRace')
    expect(racePhase({ ...base, lastFinalizedEvent: ev('a', 0, { event_date: '2026-06-01' }), now })).toBe('offSeason')
  })

  it('never treats a status alone as proof an event is over', () => {
    const e = ev('a', 1, { status: 'live' })
    expect(isEventConcluded(e, [])).toBe(false)
    expect(isEventConcluded(e, [set('a', 'race', 'finalized')])).toBe(true)
    expect(isEventConcluded(e, [set('a', 'qualifying', 'finalized')])).toBe(false)
    expect(isEventConcluded(ev('b', 2, { status: 'completed' }), [])).toBe(true)
  })

  it('picks a live event first, then the nearest upcoming one', () => {
    const now2 = new Date(2026, 5, 10)
    const events = [ev('done', 1, { event_date: '2026-06-01', status: 'completed' }), ev('later', 3, { event_date: '2026-06-30' }), ev('soon', 2, { event_date: '2026-06-12' })]
    expect(upcomingEvent(events, [], now2)?.id).toBe('soon')
    expect(upcomingEvent([...events, ev('live', 4, { status: 'live' })], [], now2)?.id).toBe('live')
    expect(upcomingEvent(events.slice(0, 1), [], now2)).toBeNull()
  })

  it('finds the last race by schedule, not by latest save', () => {
    const events = [ev('r1', 1, { event_date: '2026-05-01' }), ev('r2', 2, { event_date: '2026-05-15' })]
    const sets = [set('r1', 'race', 'finalized', '2026-06-09T00:00:00Z'), set('r2', 'race', 'finalized', '2026-05-16T00:00:00Z')]
    expect(lastFinalizedRace(events, sets.map((s) => s as ResultSetRow))?.event.id).toBe('r2')
    expect(lastFinalizedRace([ev('x', 1, { status: 'cancelled' })], [set('x', 'race', 'finalized')])).toBeNull()
  })

  it('lists exactly the missing setup items', () => {
    const warnings = setupWarnings({
      championship: { status: 'draft', classes_enabled: true, regions_enabled: true },
      season: { is_active: false, status: 'draft', year: null },
      eventCount: 0,
      activeRosterCount: 0,
      trackCount: 0,
      seasonClassCount: 0,
      seasonRegionCount: 0,
    } as never)
    expect(warnings).toEqual(['active championship', 'active season', 'season year', 'season drivers', 'tracks', 'schedule', 'season classes', 'season regions'])
    expect(
      setupWarnings({
        championship: { status: 'active', classes_enabled: false, regions_enabled: false },
        season: { is_active: true, status: 'active', year: 2026 },
        eventCount: 5,
        activeRosterCount: 10,
        trackCount: 3,
        seasonClassCount: 0,
        seasonRegionCount: 0,
      } as never),
    ).toEqual([])
  })
})

describe('hero', () => {
  it('labels the phase from the session state, not the event status', () => {
    expect(eventPhaseLabel('live', 'practice_available')).toBe('Practice is live')
    expect(eventPhaseLabel('live', 'qualifying_active')).toBe('Qualifying is live')
    expect(eventPhaseLabel('live', 'race_active')).toBe('Race is live')
    expect(eventPhaseLabel('live', null)).toBeNull()
    expect(eventPhaseLabel('postponed', 'race_active')).toBe('Postponed')
  })

  it('counts whole days and never invents an hour-level countdown', () => {
    const now = new Date(2026, 5, 10, 23, 59)
    expect(raceCountdown('2026-06-13', false, now)).toMatchObject({ primaryText: '3', unitText: 'DAYS' })
    expect(raceCountdown('2026-06-11', false, now)).toMatchObject({ primaryText: '1', unitText: 'DAY' })
    expect(raceCountdown('2026-06-10', false, now)).toMatchObject({ primaryText: 'TODAY', isToday: true })
    expect(raceCountdown('2026-06-10', true, now)).toMatchObject({ primaryText: 'LIVE', isLive: true })
    expect(raceCountdown(null, false, now).primaryText).toBe('—')
  })

  it('degrades missing fields to N/A and omits the class segment when classes are off', () => {
    expect(heroRoundLabel(9)).toBe('ROUND 9')
    expect(heroRoundLabel(0)).toBe('ROUND —')
    expect(heroMetadataText({ classesEnabled: true, className: null, dateText: 'Jun 13', timeText: null })).toBe('N/A · Jun 13 · N/A')
    expect(heroMetadataText({ classesEnabled: false, className: 'GT3', dateText: 'Jun 13', timeText: '19:00' })).toBe('Jun 13 · 19:00')
  })

  it('greets by time of day', () => {
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 8))).toBe('Good Morning')
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 13))).toBe('Good Afternoon')
    expect(timeOfDayGreeting(new Date(2026, 0, 1, 20))).toBe('Good Evening')
  })
})

describe('driver section', () => {
  const row = (driverId: string, position: number, points: number) => ({ driverId, position, points }) as StandingRow
  const rows = [row('a', 1, 100), row('b', 2, 90), row('c', 3, 70)]

  it('computes gaps and the gap tile for leader, mid-pack and last', () => {
    const leader = championshipBattle(rows, 'a')
    expect(performanceGap(leader)).toEqual({ tone: 'cushion', value: 10 })
    const mid = championshipBattle(rows, 'b')
    expect(mid.gapToLeader).toBe(10)
    expect(mid.gapBehind).toBe(20)
    expect(performanceGap(mid)).toEqual({ tone: 'contested', value: 10 })
    const last = championshipBattle(rows, 'c')
    expect(performanceGap(last)).toEqual({ tone: 'atBack', value: 30 })
    expect(performanceGap(championshipBattle(rows, 'zzz')).tone).toBe('unavailable')
    expect(performanceGap(championshipBattle([row('a', 1, 10)], 'a')).tone).toBe('unavailable')
  })

  it('labels form from newest-first finishes', () => {
    expect(formTrendLabel([1])).toBe('Not enough races yet')
    expect(formTrendLabel([2, 3])).toBe('Improving') // two finishes already split into newer/older halves
    expect(formTrendLabel([2, 3, 8, 9])).toBe('Improving')
    expect(formTrendLabel([9, 8, 3, 2])).toBe('Slipping')
    expect(formTrendLabel([5, 5, 5, 6])).toBe('Steady')
    expect(formTrendLabel([null, 4, null, 5])).toBe(formTrendLabel([4, 5]))
  })
})

describe('admin attention and spotlight', () => {
  it('reports only events that have happened as missing results', () => {
    const events = [ev('done', 1, { status: 'completed' }), ev('live', 2, { status: 'live' }), ev('future', 3)]
    const result = adminAttention({
      events,
      resultSets: [set('done', 'qualifying', 'finalized')],
      roster: [{ is_active: true }, { is_active: true }, { is_active: false }],
      seasonClassCount: 1,
      seasonRegionCount: 2,
      upcomingEvent: events[2],
      pendingInvitationCount: 3,
    })
    expect(result.missingQualifyingEvents).toEqual(['R2'])
    expect(result.missingRaceEvents).toEqual(['R1', 'R2'])
    expect(result.healthSummaryText).toBe('2 active drivers · 1 class · 2 regions')
    expect(result.hasAnything).toBe(true)
    expect(adminAttention({ events: [], resultSets: [], roster: [], seasonClassCount: 0, seasonRegionCount: 0, upcomingEvent: null, pendingInvitationCount: 0 }).hasAnything).toBe(false)
  })

  it('matches the app FNV-1a hash and picks a stable driver for a period', () => {
    // FNV-1a 64-bit of "a" (offset basis ^ 0x61, times prime) — a fixed vector shared with the iOS implementation.
    expect(stableHash('')).toBe(14695981039346656037n)
    expect(stableHash('a')).toBe(0xaf63dc4c8601ec8cn)
    const drivers = ['Zed', 'Amy', 'Bob', 'Cat'].map((name, i) => ({ id: `d${i}`, display_name: name, is_active: true }) as DriverRow)
    const roster = drivers.map((d) => ({ driver_id: d.id, is_active: true }))
    const args = { roster, drivers, seasonId: 'S1', upcomingEventId: 'E1' }
    const first = stableSpotlightDriver(args)
    expect(first).not.toBeNull()
    expect(stableSpotlightDriver(args)?.id).toBe(first?.id)
    // Inactive roster rows and inactive drivers never qualify.
    expect(stableSpotlightDriver({ ...args, roster: roster.map((r) => ({ ...r, is_active: false })) })).toBeNull()
    // Preferred drivers (those with forecasts) narrow the pool.
    expect(stableSpotlightDriver({ ...args, preferredDriverIds: new Set(['d2']) })?.id).toBe('d2')
  })
})

describe('pointsTrend', () => {
  const score = (driverId: string, totalPoints: number, classId: string | null = null) => ({ driverId, totalPoints, classId }) as never
  const events = [
    { eventId: 'e2', round: 2, scores: [score('a', 10, 'K1'), score('b', 25, 'K2')] },
    { eventId: 'e1', round: 1, scores: [score('a', 25, 'K1'), score('b', 10, 'K2'), score('c', 5, 'K1')] },
  ]
  const names = new Map([['a', 'Ann'], ['b', 'Bo'], ['c', 'Cy']])

  it('orders rounds, accumulates, and keeps the top drivers', () => {
    const trend = pointsTrend(events, () => true, names, 2)
    expect(trend.xLabels).toEqual(['R1', 'R2'])
    expect(trend.series.map((s) => [s.label, s.values])).toEqual([
      ['Ann', [25, 35]],
      ['Bo', [10, 35]],
    ])
  })

  it('filters to one series and skips rounds with no scores in it', () => {
    const trend = pointsTrend(events, (s) => s.classId === 'K2', names)
    expect(trend.xLabels).toEqual(['R1', 'R2'])
    expect(trend.series.map((s) => s.label)).toEqual(['Bo'])
    expect(pointsTrend(events, () => false, names).series).toEqual([])
  })
})
