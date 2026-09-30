/**
 * Appearance model — port of iOS `VRCColorValidator` / `VRCThemePalette` / `VRCThemeSource`. The accent personalises the app bar, active
 * navigation, primary controls, links and focus states; status colours (success / warning / danger) and the VRC logo never change.
 * A colour is only applied if it is readable against both the light and dark surfaces (3:1), otherwise the VRC default is used.
 */

export type ThemeSource = 'vrcDefault' | 'personalAccent' | 'championshipColors'
export type ThemeMode = 'system' | 'light' | 'dark'

export const THEME_SOURCE_LABEL: Record<ThemeSource, string> = {
  vrcDefault: 'VRC Default',
  personalAccent: 'Personal Accent',
  championshipColors: 'Championship Colors',
}

/** The website's brand accent (light / dark variants), used for "VRC Default". */
export const DEFAULT_ACCENT_LIGHT = '#F97316'
export const DEFAULT_ACCENT_DARK = '#FB923C'

export const ACCENT_PRESETS = [
  { id: 'electricBlue', name: 'Electric Blue', hex: '#0A66FF' },
  { id: 'indigo', name: 'Indigo', hex: '#4F46E5' },
  { id: 'teal', name: 'Teal', hex: '#0E8C84' },
  { id: 'cyan', name: 'Cyan', hex: '#0891B2' },
  { id: 'violet', name: 'Violet', hex: '#7C3AED' },
  { id: 'pink', name: 'Pink', hex: '#DB2777' },
] as const

/** `#abc` / `abc` / `#AABBCC` → `#AABBCC`; anything else → null. */
export function normalizeHex(input: string | null | undefined): string | null {
  let text = (input ?? '').trim()
  if (!text) return null
  if (text.startsWith('#')) text = text.slice(1)
  if (text.length === 3) text = [...text].map((c) => c + c).join('')
  return /^[0-9a-fA-F]{6}$/.test(text) ? `#${text.toUpperCase()}` : null
}

const channel = (value: number): number => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)

export function relativeLuminance(hex: string): number | null {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const int = parseInt(normalized.slice(1), 16)
  const r = channel(((int >> 16) & 0xff) / 255)
  const g = channel(((int >> 8) & 0xff) / 255)
  const b = channel((int & 0xff) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  if (la === null || lb === null) return null
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Page backgrounds the accent has to stand out against (links, focus rings and outlines use it as a foreground colour). */
export const LIGHT_SURFACE = '#F8FAFC'
export const DARK_SURFACE = '#0B1220'

/** WCAG non-text contrast: the accent must reach 3:1 against the surface of the active mode. */
export function isReadableAccent(hex: string, dark: boolean): boolean {
  const ratio = contrastRatio(hex, dark ? DARK_SURFACE : LIGHT_SURFACE)
  return ratio !== null && ratio >= 3
}

function mix(hex: string, target: number, amount: number): string {
  const int = parseInt(hex.slice(1), 16)
  const channelMix = (shift: number) => Math.round(((int >> shift) & 0xff) * (1 - amount) + target * amount)
  return `#${[16, 8, 0].map((shift) => channelMix(shift).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

/**
 * Keeps the chosen hue but nudges its lightness (toward white in dark mode, toward black in light mode) until it reaches 3:1 against the
 * surface — so "Indigo" stays indigo yet is never invisible on a dark page. The original colour is returned when it already passes.
 */
export function readableAccentFor(hex: string, dark: boolean): string {
  const normalized = normalizeHex(hex)
  if (!normalized) return hex
  let candidate = normalized
  for (let step = 1; step <= 20 && !isReadableAccent(candidate, dark); step++) candidate = mix(normalized, dark ? 255 : 0, step * 0.05)
  return candidate
}

/** Black or white text, whichever reads better on the accent fill. */
export function accentForeground(hex: string): string {
  const onWhite = contrastRatio(hex, '#FFFFFF') ?? 0
  const onDark = contrastRatio(hex, '#0B0B0F') ?? 0
  return onWhite >= onDark ? '#FFFFFF' : '#0B0B0F'
}

export interface AppearanceSettings {
  source: ThemeSource
  personalAccentHex: string | null
  mode: ThemeMode
}

export const DEFAULT_APPEARANCE: AppearanceSettings = { source: 'vrcDefault', personalAccentHex: null, mode: 'system' }

export interface ResolvedAccent {
  /** null = keep the stylesheet's default accent for the current light/dark mode. */
  hex: string | null
  foreground: string | null
  /** True when a chosen colour was invalid and the default is being used instead. */
  fellBack: boolean
  /** True when the colour was lightened/darkened to stay visible in the current mode. */
  adjusted: boolean
}

/** Picks the accent for the current settings and mode; an invalid colour falls back to the default, a low-contrast one is adjusted. */
export function resolveAccent(settings: AppearanceSettings, championshipHex: string | null | undefined, dark = false): ResolvedAccent {
  if (settings.source === 'vrcDefault') return { hex: null, foreground: null, fellBack: false, adjusted: false }
  const raw = settings.source === 'personalAccent' ? settings.personalAccentHex : championshipHex
  const candidate = normalizeHex(raw)
  if (!candidate) return { hex: null, foreground: null, fellBack: settings.source === 'personalAccent' && Boolean(raw?.trim()), adjusted: false }
  const hex = readableAccentFor(candidate, dark)
  return { hex, foreground: accentForeground(hex), fellBack: false, adjusted: hex !== candidate }
}

const STORAGE_KEY = 'vrc-appearance'

export function loadAppearance(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_APPEARANCE, mode: legacyMode() }
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings>
    const source: ThemeSource = parsed.source === 'personalAccent' || parsed.source === 'championshipColors' ? parsed.source : 'vrcDefault'
    const mode: ThemeMode = parsed.mode === 'light' || parsed.mode === 'dark' ? parsed.mode : 'system'
    return { source, personalAccentHex: normalizeHex(parsed.personalAccentHex) ?? null, mode }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

/** The pre-existing `vrc-theme` key (dark toggle) keeps working for people who set it before the Appearance settings existed. */
function legacyMode(): ThemeMode {
  try {
    const stored = localStorage.getItem('vrc-theme')
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function saveAppearance(settings: AppearanceSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    // Keep the pre-paint script in index.html in step.
    if (settings.mode === 'system') localStorage.removeItem('vrc-theme')
    else localStorage.setItem('vrc-theme', settings.mode)
  } catch {
    // Storage blocked (private mode) — the setting simply doesn't persist.
  }
}

/** Applies mode + accent to the document. Safe to call repeatedly. */
export function applyAppearance(settings: AppearanceSettings, championshipHex: string | null | undefined): ResolvedAccent {
  const root = document.documentElement
  const systemDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = settings.mode === 'dark' || (settings.mode === 'system' && systemDark)
  root.classList.toggle('dark', dark)
  const accent = resolveAccent(settings, championshipHex, dark)
  if (accent.hex && accent.foreground) {
    root.style.setProperty('--color-accent', accent.hex)
    root.style.setProperty('--color-accent-contrast', accent.foreground)
  } else {
    root.style.removeProperty('--color-accent')
    root.style.removeProperty('--color-accent-contrast')
  }
  return accent
}
