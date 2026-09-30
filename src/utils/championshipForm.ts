import type { ChampionshipRow, ChampionshipStatus } from '@/types/database'

/** Championship editor model (iOS `VRCChampionshipView` Identity + Feature settings). */

export const CHAMPIONSHIP_STATUS_LABEL: Record<ChampionshipStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
}

const HEX = /^#[0-9A-Fa-f]{6}$/

/** `#RRGGBB` (case-insensitive, `#` optional) → upper-case `#RRGGBB`; empty → null (unset); anything else → `undefined` (invalid). */
export function normalizeHexColor(input: string): string | null | undefined {
  const trimmed = input.trim()
  if (!trimmed) return null
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`
  return HEX.test(withHash) ? withHash.toUpperCase() : undefined
}

export interface ChampionshipIdentityForm {
  name: string
  seriesName: string
  description: string
  primary: string
  secondary: string
  accent: string
  status: ChampionshipStatus
}

export const identityFormFromRow = (c: ChampionshipRow): ChampionshipIdentityForm => ({
  name: c.name,
  seriesName: c.series_name ?? '',
  description: c.description ?? '',
  primary: c.primary_color_hex ?? '',
  secondary: c.secondary_color_hex ?? '',
  accent: c.accent_color_hex ?? '',
  status: c.status,
})

export function identityIssues(form: ChampionshipIdentityForm): string[] {
  const issues: string[] = []
  if (!form.name.trim()) issues.push('Enter a championship name.')
  for (const [label, value] of [['Primary', form.primary], ['Secondary', form.secondary], ['Accent', form.accent]] as const) {
    if (normalizeHexColor(value) === undefined) issues.push(`${label} color must be a hex value like #087BFF.`)
  }
  return issues
}

export function identityPatch(form: ChampionshipIdentityForm): Partial<ChampionshipRow> {
  return {
    name: form.name.trim(),
    series_name: form.seriesName.trim() || null,
    description: form.description.trim() || null,
    primary_color_hex: normalizeHexColor(form.primary) ?? null,
    secondary_color_hex: normalizeHexColor(form.secondary) ?? null,
    accent_color_hex: normalizeHexColor(form.accent) ?? null,
    status: form.status,
  }
}

export interface FeatureFlags {
  classes_enabled: boolean
  regions_enabled: boolean
  practice_capture_enabled: boolean
  driver_telemetry_enabled: boolean
  viewer_capture_enabled: boolean
  predictions_enabled: boolean
  replay_enabled: boolean
}

export const featureFlagsFromRow = (c: ChampionshipRow): FeatureFlags => ({
  classes_enabled: c.classes_enabled,
  regions_enabled: c.regions_enabled,
  practice_capture_enabled: c.practice_capture_enabled,
  driver_telemetry_enabled: c.driver_telemetry_enabled,
  viewer_capture_enabled: c.viewer_capture_enabled,
  predictions_enabled: c.predictions_enabled,
  replay_enabled: c.replay_enabled,
})
