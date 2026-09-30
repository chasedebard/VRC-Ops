import { describe, expect, it } from 'vitest'
import { eventDisplayTitle, eventRoundLabel, raceTemporality, resolveCurrentRace } from './currentRace'
import type { EventRow } from '@/types/database'

function ev(id: string, round: number, patch: Partial<EventRow> = {}): EventRow {
  return { id, round, title: `T${round}`, custom_title: null, event_date: null, status: 'scheduled', ...patch } as EventRow
}

const NOW = new Date(2026, 8, 15, 12) // 2026-09-15 local

describe('resolveCurrentRace', () => {
  it('prefers a live event', () => {
    const events = [ev('a', 1, { event_date: '2026-09-20' }), ev('b', 2, { status: 'live', event_date: '2026-09-01' })]
    expect(resolveCurrentRace(events, NOW)?.id).toBe('b')
  })

  it('picks the nearest upcoming dated, non-completed event', () => {
    const events = [
      ev('a', 1, { event_date: '2026-09-01' }),
      ev('b', 2, { event_date: '2026-09-22' }),
      ev('c', 3, { event_date: '2026-09-18' }),
      ev('d', 4, { event_date: '2026-09-16', status: 'cancelled' }),
    ]
    expect(resolveCurrentRace(events, NOW)?.id).toBe('c')
  })

  it('falls back to the most recent past event, then the first round', () => {
    expect(resolveCurrentRace([ev('a', 1, { event_date: '2026-08-01' }), ev('b', 2, { event_date: '2026-09-01' })], NOW)?.id).toBe('b')
    expect(resolveCurrentRace([ev('x', 2), ev('y', 1)], NOW)?.id).toBe('y')
    expect(resolveCurrentRace([], NOW)).toBeNull()
  })
})

describe('labels', () => {
  it('prefers a custom title and labels unscheduled rounds', () => {
    expect(eventDisplayTitle({ title: 'Generated', custom_title: '  Finale  ' })).toBe('Finale')
    expect(eventDisplayTitle({ title: 'Generated', custom_title: '   ' })).toBe('Generated')
    expect(eventRoundLabel({ round: 0 })).toBe('Unscheduled')
    expect(eventRoundLabel({ round: 3 })).toBe('Round 3')
  })

  it('classifies temporality', () => {
    expect(raceTemporality(ev('a', 1, { status: 'live' }), NOW)).toBe('Current')
    expect(raceTemporality(ev('a', 1, { status: 'completed' }), NOW)).toBe('Completed')
    expect(raceTemporality(ev('a', 1, { event_date: '2026-09-01' }), NOW)).toBe('Completed')
    expect(raceTemporality(ev('a', 1, { event_date: '2026-09-30' }), NOW)).toBe('Upcoming')
    expect(raceTemporality(ev('a', 1), NOW)).toBe('Upcoming')
  })
})
