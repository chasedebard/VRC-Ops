import { describe, expect, it } from 'vitest'
import { resolveLastCompletedEvent, resolveUpcomingEvent } from './events'
import type { EventRow } from '@/types/database'

function event(overrides: Partial<EventRow> & Pick<EventRow, 'id' | 'round'>): EventRow {
  return {
    league_id: 'league1',
    championship_id: 'champ1',
    season_id: 'season1',
    title: null,
    custom_title: null,
    track_id: null,
    track_layout: null,
    event_date: null,
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
    ...overrides,
  }
}

describe('resolveLastCompletedEvent', () => {
  it('does not let correcting an earlier round become the Last Race after a later round is finalized', () => {
    // Round 5 finalized first (event_date earliest by DB insert order is irrelevant — schedule
    // date/round is what matters). Then round 2's results get resaved, which in the old,
    // buggy behavior would have bumped a `result_sets.finalized_at`-driven sort. This function
    // never reads finalized_at at all, so re-saving round 2 cannot change the outcome.
    const round2 = event({ id: 'e2', round: 2, event_date: '2026-02-01' })
    const round5 = event({ id: 'e5', round: 5, event_date: '2026-05-01' })
    const events = [round2, round5]
    const completedEventIds = new Set(['e2', 'e5'])

    expect(resolveLastCompletedEvent(events, completedEventIds)?.id).toBe('e5')

    // Simulate "round 2 was just re-saved" — nothing about the input events changed (there is
    // no finalized_at on EventRow to bump), so the result must be identical.
    expect(resolveLastCompletedEvent(events, completedEventIds)?.id).toBe('e5')
  })

  it('orders by event_date first, round only as a tiebreak', () => {
    // Round numbers deliberately out of chronological order.
    const earlierByDate = event({ id: 'a', round: 3, event_date: '2026-01-01' })
    const laterByDate = event({ id: 'b', round: 1, event_date: '2026-06-01' })
    const events = [earlierByDate, laterByDate]
    const completedEventIds = new Set(['a', 'b'])
    expect(resolveLastCompletedEvent(events, completedEventIds)?.id).toBe('b')
  })

  it('uses round to break a same-day tie', () => {
    const first = event({ id: 'a', round: 1, event_date: '2026-03-01' })
    const second = event({ id: 'b', round: 2, event_date: '2026-03-01' })
    const events = [second, first]
    const completedEventIds = new Set(['a', 'b'])
    expect(resolveLastCompletedEvent(events, completedEventIds)?.id).toBe('b')
  })

  it('falls back to status/date heuristic when no completed-event-id set is provided', () => {
    const scheduled = event({ id: 'a', round: 1, status: 'scheduled', event_date: '2020-01-01' })
    const completed = event({ id: 'b', round: 2, status: 'completed', event_date: '2020-02-01' })
    expect(resolveLastCompletedEvent([scheduled, completed])?.id).toBe('b')
  })

  it('returns null when there is nothing completed', () => {
    const upcoming = event({ id: 'a', round: 1, status: 'scheduled', event_date: '2099-01-01' })
    expect(resolveLastCompletedEvent([upcoming])).toBeNull()
  })
})

describe('resolveUpcomingEvent', () => {
  it('picks the earliest dated event today or later', () => {
    const past = event({ id: 'past', round: 1, event_date: '2000-01-01' })
    const future1 = event({ id: 'future1', round: 2, event_date: '2999-01-01' })
    const future2 = event({ id: 'future2', round: 3, event_date: '2999-06-01' })
    expect(resolveUpcomingEvent([future2, past, future1])?.id).toBe('future1')
  })
})
