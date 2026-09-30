import { supabase } from '@/supabase/client'

/**
 * Authoritative season rivals (`vrc_get_season_rivals`, algorithm rival-v1). The server returns, for every driver in a
 * season, that driver's current rival (or none); clients render this and never recompute rivalry. Membership-gated by the
 * RPC — a non-member or unknown season returns `ok = false`.
 */
export interface SeasonRivalRow {
  driver_id: string
  rival_driver_id: string | null
  rival_display_name: string | null
  strength: number | null
  shared_races: number
  subject_ahead: number
  /** e.g. "Finished ahead in 4 of 6 shared races"; null when there is no rival. */
  record_text: string | null
  rival_since_round: number | null
  previous_rival_driver_id: string | null
  /** True for one round after the rival changes. */
  is_new: boolean
}

export interface SeasonRivalDisplay {
  ok: boolean
  algorithm_version?: string | null
  season_id?: string | null
  rivals?: SeasonRivalRow[] | null
}

export async function getSeasonRivals(seasonId: string): Promise<SeasonRivalDisplay> {
  const { data, error } = await supabase.rpc('vrc_get_season_rivals', { p_season_id: seasonId })
  if (error) throw error
  return data as SeasonRivalDisplay
}

/** The per-screen answer to "should the rival indicator show next to this driver's name?" */
export interface SeasonRivalContext {
  subjectDriverId: string | null
  rivalDriverId: string | null
  isNew: boolean
}

export const NO_RIVAL_CONTEXT: SeasonRivalContext = { subjectDriverId: null, rivalDriverId: null, isNew: false }

/** The indicator shows only when the user has an assigned driver, that driver has a rival this season, and the rendered driver IS that rival. */
export function showsRivalIndicator(context: SeasonRivalContext, driverId: string | null | undefined): boolean {
  if (!driverId || !context.subjectDriverId || context.subjectDriverId === driverId) return false
  return context.rivalDriverId === driverId
}

export function rivalContextFor(display: SeasonRivalDisplay | null, subjectDriverId: string | null): SeasonRivalContext {
  if (!display?.ok || !subjectDriverId) return NO_RIVAL_CONTEXT
  const row = display.rivals?.find((r) => r.driver_id === subjectDriverId)
  return { subjectDriverId, rivalDriverId: row?.rival_driver_id ?? null, isNew: row?.is_new ?? false }
}

/** `drivers.user_id` is the single authoritative user → driver relationship (league-scoped). */
export function myDriverIn<T extends { id: string; user_id: string | null }>(drivers: T[], userId: string | null): T | null {
  if (!userId) return null
  return drivers.find((d) => d.user_id === userId) ?? null
}

/** Best-effort: any failure just hides the indicator. */
export async function loadRivalContext(seasonId: string, subjectDriverId: string | null): Promise<SeasonRivalContext> {
  if (!subjectDriverId) return NO_RIVAL_CONTEXT
  try {
    return rivalContextFor(await getSeasonRivals(seasonId), subjectDriverId)
  } catch {
    return NO_RIVAL_CONTEXT
  }
}
