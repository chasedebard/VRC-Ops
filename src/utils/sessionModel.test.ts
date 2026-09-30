import { describe, expect, it } from 'vitest'
import {
  NORMAL_TARGETS,
  availableSessionActions,
  hasLiveOrUpcoming,
  requiresQualifyingResults,
  roundStatus,
  stageStatus,
} from './sessionModel'
import type { SessionState } from '@/types/database'

describe('session actions', () => {
  it('offers only legal normal transitions, hiding cancel/postpone from non-managers', () => {
    const operator = availableSessionActions({ state: 'scheduled', canOperate: true, canOverride: false, qualifyingOfficial: null })
    expect(operator.map((a) => a.target)).toEqual(['practice_available', 'qualifying_active'])
    const manager = availableSessionActions({ state: 'scheduled', canOperate: true, canOverride: true, qualifyingOfficial: null })
    expect(manager.map((a) => a.target)).toEqual(['practice_available', 'qualifying_active', 'cancelled', 'postponed'])
    expect(availableSessionActions({ state: 'scheduled', canOperate: false, canOverride: true, qualifyingOfficial: null })).toEqual([])
  })

  it('has no further transition after End Race (results are entered on the Results screen)', () => {
    expect(NORMAL_TARGETS.race_active).toEqual(['race_complete'])
    expect(NORMAL_TARGETS.race_complete).toEqual([])
    expect(NORMAL_TARGETS.cancelled).toEqual([])
    expect(NORMAL_TARGETS.postponed).toEqual(['scheduled'])
  })

  it('blocks the race path until qualifying results are official, failing closed when unknown', () => {
    expect(requiresQualifyingResults('qualifying_complete', false)).toBe(true)
    expect(requiresQualifyingResults('qualifying_complete', null)).toBe(true)
    expect(requiresQualifyingResults('qualifying_complete', true)).toBe(false)
    expect(requiresQualifyingResults('scheduled', null)).toBe(false)
    const gated = availableSessionActions({ state: 'race_ready', canOperate: true, canOverride: false, qualifyingOfficial: false })
    expect(gated.map((a) => a.target)).toEqual(['qualifying_complete'])
    const open = availableSessionActions({ state: 'qualifying_complete', canOperate: true, canOverride: false, qualifyingOfficial: true })
    expect(open.map((a) => a.target)).toEqual(['race_ready'])
  })
})

describe('timeline', () => {
  const at = (state: SessionState | null) => ['practice', 'qualifying', 'race'].map((s) => stageStatus(s as never, state))
  it('treats practice as the current session for the whole pre-qualifying window', () => {
    expect(at(null)).toEqual(['active', 'upcoming', 'upcoming'])
    expect(at('scheduled')).toEqual(['active', 'upcoming', 'upcoming'])
    expect(at('practice_available')).toEqual(['active', 'upcoming', 'upcoming'])
  })
  it('advances stage by stage and completes after results are in', () => {
    expect(at('qualifying_active')).toEqual(['complete', 'active', 'upcoming'])
    expect(at('qualifying_complete')).toEqual(['complete', 'complete', 'upcoming'])
    expect(at('race_active')).toEqual(['complete', 'complete', 'active'])
    expect(at('race_complete')).toEqual(['complete', 'complete', 'complete'])
  })
  it('keeps every stage neutral for cancelled/postponed sessions', () => {
    expect(at('cancelled')).toEqual(['upcoming', 'upcoming', 'upcoming'])
    expect(at('postponed')).toEqual(['upcoming', 'upcoming', 'upcoming'])
  })
})

describe('reconciled round status', () => {
  it('never marks a round Completed before its race result is official', () => {
    expect(roundStatus({ status: 'completed' }, false, false)).toBe('Awaiting Results')
    expect(roundStatus({ status: 'completed' }, true, false)).toBe('Current Race')
    expect(roundStatus({ status: 'completed' }, false, true)).toBe('Completed')
    expect(roundStatus({ status: 'completed' }, false)).toBe('Completed') // list rows trust events.status
    expect(roundStatus({ status: 'archived' }, false, true)).toBe('Completed')
  })
  it('maps the other event statuses', () => {
    expect(roundStatus({ status: 'cancelled' }, true)).toBe('Cancelled')
    expect(roundStatus({ status: 'postponed' }, false)).toBe('Postponed')
    expect(roundStatus({ status: 'draft' }, false)).toBe('Draft')
    expect(roundStatus({ status: 'live' }, true)).toBe('Current Race')
    expect(roundStatus({ status: 'live' }, false)).toBe('Live')
    expect(roundStatus({ status: 'scheduled' }, true)).toBe('Current Race')
    expect(roundStatus({ status: 'scheduled' }, false)).toBe('Upcoming')
  })
  it('knows when a season has nothing live or upcoming left', () => {
    expect(hasLiveOrUpcoming([{ status: 'completed', event_date: '2026-01-01' }], '2026-09-15')).toBe(false)
    expect(hasLiveOrUpcoming([{ status: 'scheduled', event_date: '2026-10-01' }], '2026-09-15')).toBe(true)
    expect(hasLiveOrUpcoming([{ status: 'live', event_date: null }], '2026-09-15')).toBe(true)
    expect(hasLiveOrUpcoming([{ status: 'scheduled', event_date: null }], '2026-09-15')).toBe(false)
  })
})
