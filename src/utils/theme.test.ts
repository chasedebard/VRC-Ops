import { beforeEach, describe, expect, it } from 'vitest'
import {
  ACCENT_PRESETS,
  accentForeground,
  applyAppearance,
  contrastRatio,
  isReadableAccent,
  loadAppearance,
  normalizeHex,
  readableAccentFor,
  resolveAccent,
  saveAppearance,
  DEFAULT_APPEARANCE,
} from './theme'

describe('hex helpers', () => {
  it('normalizes 3- and 6-digit hex and rejects junk', () => {
    expect(normalizeHex('#abc')).toBe('#AABBCC')
    expect(normalizeHex('0a66ff')).toBe('#0A66FF')
    expect(normalizeHex('  #0A66FF ')).toBe('#0A66FF')
    expect(normalizeHex('#12')).toBeNull()
    expect(normalizeHex('#GGGGGG')).toBeNull()
    expect(normalizeHex('')).toBeNull()
    expect(normalizeHex(null)).toBeNull()
  })

  it('computes WCAG contrast', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5)
    expect(contrastRatio('nope', '#FFFFFF')).toBeNull()
  })

  it('nudges a low-contrast accent until it is visible on the active surface, keeping a passing colour untouched', () => {
    // Indigo is fine on the light page but too dark on the dark page.
    expect(isReadableAccent('#4F46E5', false)).toBe(true)
    expect(isReadableAccent('#4F46E5', true)).toBe(false)
    expect(readableAccentFor('#4F46E5', false)).toBe('#4F46E5')
    const lightened = readableAccentFor('#4F46E5', true)
    expect(lightened).not.toBe('#4F46E5')
    expect(isReadableAccent(lightened, true)).toBe(true)
    // A near-white accent is invisible on the light page until darkened.
    expect(isReadableAccent(readableAccentFor('#F5F5F5', false), false)).toBe(true)
    for (const preset of ACCENT_PRESETS) {
      expect(isReadableAccent(readableAccentFor(preset.hex, true), true)).toBe(true)
      expect(isReadableAccent(readableAccentFor(preset.hex, false), false)).toBe(true)
    }
  })

  it('picks a readable foreground for a fill', () => {
    expect(accentForeground('#FFFF00')).toBe('#0B0B0F')
    expect(accentForeground('#0A66FF')).toBe('#FFFFFF')
  })
})

describe('resolveAccent', () => {
  const settings = (over = {}) => ({ ...DEFAULT_APPEARANCE, ...over })
  it('keeps the default for VRC Default', () => {
    expect(resolveAccent(settings(), '#FF0000')).toEqual({ hex: null, foreground: null, fellBack: false, adjusted: false })
  })
  it('uses a valid personal accent, adjusts it per mode, and falls back (flagged) for an invalid one', () => {
    const personal = settings({ source: 'personalAccent', personalAccentHex: '#4F46E5' })
    expect(resolveAccent(personal, null, false)).toMatchObject({ hex: '#4F46E5', fellBack: false, adjusted: false })
    const dark = resolveAccent(personal, null, true)
    expect(dark.adjusted).toBe(true)
    expect(dark.hex).not.toBe('#4F46E5')
    expect(resolveAccent(settings({ source: 'personalAccent', personalAccentHex: 'banana' }), null)).toMatchObject({ hex: null, fellBack: true })
    expect(resolveAccent(settings({ source: 'personalAccent', personalAccentHex: null }), null)).toMatchObject({ hex: null, fellBack: false })
  })
  it('uses the championship colour when readable', () => {
    expect(resolveAccent(settings({ source: 'championshipColors' }), '#4f46e5')).toMatchObject({ hex: '#4F46E5' })
    expect(resolveAccent(settings({ source: 'championshipColors' }), null).hex).toBeNull()
  })
})

describe('persistence and application', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.removeAttribute('style')
  })

  it('round-trips settings and keeps the legacy theme key in step', () => {
    saveAppearance({ source: 'personalAccent', personalAccentHex: '#0a66ff', mode: 'dark' })
    expect(loadAppearance()).toEqual({ source: 'personalAccent', personalAccentHex: '#0A66FF', mode: 'dark' })
    expect(localStorage.getItem('vrc-theme')).toBe('dark')
    saveAppearance({ ...DEFAULT_APPEARANCE, mode: 'system' })
    expect(localStorage.getItem('vrc-theme')).toBeNull()
  })

  it('honours the pre-existing dark-mode key when no appearance settings exist', () => {
    localStorage.setItem('vrc-theme', 'dark')
    expect(loadAppearance().mode).toBe('dark')
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('vrc-appearance', '{not json')
    expect(loadAppearance()).toEqual(DEFAULT_APPEARANCE)
  })

  it('applies and clears the accent on the document', () => {
    applyAppearance({ source: 'personalAccent', personalAccentHex: '#0A66FF', mode: 'light' }, null)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('#0A66FF')
    expect(document.documentElement.style.getPropertyValue('--color-accent-contrast')).toBe('#FFFFFF')
    applyAppearance({ source: 'personalAccent', personalAccentHex: '#0A66FF', mode: 'dark' }, null)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    applyAppearance(DEFAULT_APPEARANCE, null)
    expect(document.documentElement.style.getPropertyValue('--color-accent')).toBe('')
  })
})
