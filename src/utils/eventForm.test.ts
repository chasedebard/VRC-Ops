import { describe, expect, it } from 'vitest'
import {
  emptyEventForm,
  eventFormFromRow,
  eventPayload,
  generatedEventTitle,
  nextSuggestedRound,
  plannedEventClassSync,
  selectableStatuses,
  validateEventForm,
  type EventFormContext,
} from './eventForm'
import type { EventRow } from '@/types/database'

const ctx = (over: Partial<EventFormContext> = {}): EventFormContext => ({ classesEnabled: false, regionsEnabled: false, game: 'gran_turismo_7', existingRounds: new Set([1, 2]), ...over })
const valid = () => ({ ...emptyEventForm(3), trackId: 't1', distanceValue: '20' })

describe('generated event title', () => {
  it('merges track and layout, and falls back sensibly', () => {
    expect(generatedEventTitle({ name: 'Suzuka Circuit', layout: 'Grand Prix' })).toBe('Suzuka Circuit — Grand Prix')
    expect(generatedEventTitle({ name: 'Spa', layout: null })).toBe('Spa')
    expect(generatedEventTitle({ name: '  ', layout: 'Sprint' })).toBe('Sprint')
    expect(generatedEventTitle(null)).toBe('Untitled Race')
  })
})

describe('validateEventForm', () => {
  it('accepts a minimal valid race', () => {
    expect(validateEventForm(valid(), ctx())).toEqual([])
  })

  it('requires the fields the database triggers require', () => {
    const errors = validateEventForm({ ...emptyEventForm(3) }, ctx({ classesEnabled: true }))
    expect(errors).toEqual(['Choose a track.', 'Enter the number of laps.', 'Choose a class.'])
    expect(validateEventForm({ ...valid(), distanceType: 'endurance', distanceValue: '' }, ctx())).toEqual(['Enter the race length in minutes.'])
    expect(validateEventForm({ ...valid(), distanceValue: '0' }, ctx())).toEqual(['Enter the number of laps.'])
  })

  it('flags a round conflict, but not for the event being edited', () => {
    expect(validateEventForm({ ...valid(), round: '2' }, ctx())).toEqual(['Round 2 is already used in this season.'])
    expect(validateEventForm({ ...valid(), round: '2' }, ctx({ editingRound: 2 }))).toEqual([])
    expect(validateEventForm({ ...valid(), round: 'x' }, ctx())).toEqual(['Enter a round number of 1 or more.'])
  })

  it('needs a region for non-GT7 games only, since GT7 derives it from the track country', () => {
    expect(validateEventForm(valid(), ctx({ regionsEnabled: true }))).toEqual([])
    expect(validateEventForm(valid(), ctx({ regionsEnabled: true, game: 'iracing' }))).toEqual(['Choose a region.'])
  })

  it('validates the optional fields when present', () => {
    expect(validateEventForm({ ...valid(), qualifyingMinutes: 'abc' }, ctx())).toEqual(['Qualifying length must be a whole number of minutes.'])
    expect(validateEventForm({ ...valid(), time: '7pm' }, ctx())).toEqual(['Enter a valid start time.'])
  })
})

describe('eventPayload', () => {
  it('builds the write payload with the generated title and cleaned optionals', () => {
    const form = { ...valid(), date: '2026-07-04', time: '19:30', customTitle: '  ', notes: ' bring snacks ', classId: 'c1', regionId: 'r1', qualifyingMinutes: '15' }
    const payload = eventPayload(form, { name: 'Suzuka', layout: 'East' }, { classesEnabled: true, regionsEnabled: false, game: 'gran_turismo_7' }, 'Europe/London')
    expect(payload).toMatchObject({
      round: 3,
      title: 'Suzuka — East',
      custom_title: null,
      track_layout: 'East',
      event_date: '2026-07-04',
      start_time: '19:30:00',
      time_zone: 'Europe/London',
      class_id: 'c1',
      region_id: null, // regions are off for this championship
      qualifying_minutes: 15,
      race_distance_type: 'laps',
      race_value: 20,
      notes: 'bring snacks',
    })
  })

  it('omits the time zone when there is no start time and never sends a class the championship does not use', () => {
    const payload = eventPayload({ ...valid(), classId: 'stale' }, { name: 'Spa', layout: null }, { classesEnabled: false, regionsEnabled: false, game: 'gran_turismo_7' }, 'UTC')
    expect(payload.time_zone).toBeNull()
    expect(payload.class_id).toBeNull()
    expect(payload.track_layout).toBeNull()
  })
})

describe('form helpers', () => {
  it('round-trips a row into the form', () => {
    const row = { round: 4, track_id: 't', event_date: '2026-01-02', start_time: '18:00:00', race_distance_type: 'endurance', race_value: 60, class_id: 'c', region_id: null, custom_title: 'Finale', qualifying_minutes: null, status: 'scheduled', is_published: true } as EventRow
    expect(eventFormFromRow(row)).toMatchObject({ round: '4', trackId: 't', date: '2026-01-02', time: '18:00', distanceType: 'endurance', distanceValue: '60', classId: 'c', customTitle: 'Finale', isPublished: true })
  })

  it('keeps race-control-driven statuses visible but not selectable for others', () => {
    expect(selectableStatuses('scheduled')).toEqual(['draft', 'scheduled', 'cancelled', 'postponed', 'archived'])
    expect(selectableStatuses('live')).toContain('live')
    expect(selectableStatuses('completed')).toContain('completed')
  })

  it('suggests the next round', () => {
    expect(nextSuggestedRound([])).toBe(1)
    expect(nextSuggestedRound([1, 2, 5])).toBe(6)
  })
})

describe('plannedEventClassSync', () => {
  it('mirrors the chosen class into event_classes only when needed', () => {
    expect(plannedEventClassSync([], 'k1')).toEqual(['k1'])
    expect(plannedEventClassSync(['k1'], 'k1')).toBeNull()
    expect(plannedEventClassSync(['k1'], 'k2')).toEqual(['k2'])
    expect(plannedEventClassSync([], null)).toBeNull()
  })

  it('leaves a multi-class event alone while it still contains the chosen class', () => {
    expect(plannedEventClassSync(['k1', 'k2'], 'k2')).toBeNull()
    expect(plannedEventClassSync(['k1', 'k2'], 'k3')).toEqual(['k3'])
  })
})
