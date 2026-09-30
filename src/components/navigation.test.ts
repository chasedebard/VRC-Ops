import { describe, expect, it } from 'vitest'
import { isItemActive, mainNavigation, subNavigation } from './navigation'
import { resolvePermissions } from '@/permissions/resolver'
import type { VrcRole } from '@/types/database'

const keys = (roles: VrcRole[]) => mainNavigation(resolvePermissions(roles)).map((i) => i.key)

describe('main navigation (mirrors the iOS shell)', () => {
  it('gives a viewer the read-only categories only', () => {
    expect(keys(['viewer'])).toEqual(['home', 'championship', 'results', 'standings', 'predictions', 'drivers', 'settings'])
  })

  it('adds Race Weekend and Pit Wall for drivers and race-control staff', () => {
    for (const role of ['driver', 'marshal', 'admin', 'owner'] as VrcRole[]) {
      expect(keys([role])).toEqual(expect.arrayContaining(['raceWeekend', 'pitWall']))
    }
    expect(keys(['driver'])).not.toContain('administration')
    expect(keys(['marshal'])).not.toContain('administration')
  })

  it('shows Administration only to Owner/Admin, before Settings', () => {
    for (const role of ['owner', 'admin'] as VrcRole[]) {
      const list = keys([role])
      expect(list).toContain('administration')
      expect(list.indexOf('administration')).toBe(list.length - 2)
    }
  })

  it('marks Pit Wall and Predictions as premium', () => {
    const premium = mainNavigation(resolvePermissions(['owner'])).filter((i) => i.premium).map((i) => i.key)
    expect(premium).toEqual(['pitWall', 'predictions'])
  })

  it('keeps an item highlighted for nested paths but not for look-alike prefixes', () => {
    const items = mainNavigation(resolvePermissions(['owner']))
    const results = items.find((i) => i.key === 'results')!
    expect(isItemActive(results, '/results')).toBe(true)
    expect(isItemActive(results, '/results/abc/audit')).toBe(true)
    expect(isItemActive(results, '/results-archive')).toBe(false)
    const championship = items.find((i) => i.key === 'championship')!
    expect(isItemActive(championship, '/seasons/1/teams')).toBe(true)
    expect(isItemActive(championship, '/schedule')).toBe(true)
  })
})

describe('section sub-navigation', () => {
  it('shows management destinations to Owner/Admin only', () => {
    const labels = (roles: VrcRole[]) => subNavigation('championship', resolvePermissions(roles)).map((s) => s.label)
    expect(labels(['viewer'])).toEqual(['Championships & seasons', 'Schedule'])
    expect(labels(['admin'])).toEqual(['Championships & seasons', 'Schedule', 'Tracks', 'Teams', 'Classes', 'Regions'])
  })

  it('offers My driver only to drivers', () => {
    expect(subNavigation('drivers', resolvePermissions(['viewer'])).map((s) => s.to)).toEqual(['/drivers'])
    expect(subNavigation('drivers', resolvePermissions(['driver'])).map((s) => s.to)).toEqual(['/drivers', '/drivers/me'])
  })

  it('has no sub-navigation for single-destination categories', () => {
    expect(subNavigation('home', resolvePermissions(['owner']))).toEqual([])
    expect(subNavigation('standings', resolvePermissions(['owner']))).toEqual([])
  })
})
