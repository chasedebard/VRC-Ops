import { describe, expect, it } from 'vitest'
import { sessionAssuranceLevel } from './auth'
import { sortLeaguesByName } from './leagues'

const token = (payload: unknown) => `h.${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`

describe('sessionAssuranceLevel', () => {
  it('reads the aal claim from the access token', () => {
    expect(sessionAssuranceLevel({ access_token: token({ aal: 'aal2' }) })).toBe('aal2')
    expect(sessionAssuranceLevel({ access_token: token({ aal: 'aal1', sub: 'x' }) })).toBe('aal1')
  })

  it('is null when there is no usable claim', () => {
    expect(sessionAssuranceLevel(null)).toBeNull()
    expect(sessionAssuranceLevel({ access_token: '' })).toBeNull()
    expect(sessionAssuranceLevel({ access_token: 'not-a-jwt' })).toBeNull()
    expect(sessionAssuranceLevel({ access_token: token({ sub: 'x' }) })).toBeNull()
    expect(sessionAssuranceLevel({ access_token: 'h.%%%.s' })).toBeNull()
  })
})

describe('sortLeaguesByName', () => {
  it('orders memberships by league name, case-insensitively, without mutating the input', () => {
    const input = [{ league: { name: 'zeta' } }, { league: { name: 'Alpha' } }, { league: { name: 'beta' } }]
    expect(sortLeaguesByName(input).map((m) => m.league.name)).toEqual(['Alpha', 'beta', 'zeta'])
    expect(input[0].league.name).toBe('zeta')
  })
})
