import { describe, expect, it } from 'vitest'
import { identityIssues, identityPatch, normalizeHexColor, type ChampionshipIdentityForm } from './championshipForm'

const form = (over: Partial<ChampionshipIdentityForm> = {}): ChampionshipIdentityForm => ({
  name: 'RFS Series',
  seriesName: '',
  description: '',
  primary: '',
  secondary: '',
  accent: '',
  status: 'active',
  ...over,
})

describe('normalizeHexColor', () => {
  it('normalizes valid colors, treats blank as unset and rejects everything else', () => {
    expect(normalizeHexColor('#087bff')).toBe('#087BFF')
    expect(normalizeHexColor('087bff')).toBe('#087BFF')
    expect(normalizeHexColor('   ')).toBeNull()
    expect(normalizeHexColor('#fff')).toBeUndefined()
    expect(normalizeHexColor('#GGGGGG')).toBeUndefined()
  })
})

describe('championship identity', () => {
  it('reports each problem once', () => {
    expect(identityIssues(form({ name: ' ', primary: 'nope', accent: '#12' }))).toEqual([
      'Enter a championship name.',
      'Primary color must be a hex value like #087BFF.',
      'Accent color must be a hex value like #087BFF.',
    ])
    expect(identityIssues(form())).toEqual([])
  })

  it('builds a patch with trimmed text and null for blanks', () => {
    expect(identityPatch(form({ name: ' Gold Cup ', seriesName: ' GC ', description: ' ', primary: 'ff0000' }))).toEqual({
      name: 'Gold Cup',
      series_name: 'GC',
      description: null,
      primary_color_hex: '#FF0000',
      secondary_color_hex: null,
      accent_color_hex: null,
      status: 'active',
    })
  })
})
