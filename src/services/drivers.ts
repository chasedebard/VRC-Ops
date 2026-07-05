import { supabase } from '@/supabase/client'
import type { DriverRow, SeasonDriverRow } from '@/types/database'

export async function getDrivers(leagueId: string, includeInactive = true): Promise<DriverRow[]> {
  let query = supabase.from('drivers').select('*').eq('league_id', leagueId)
  if (!includeInactive) query = query.eq('is_active', true)
  const { data, error } = await query.order('display_name').returns<DriverRow[]>()
  if (error) throw error
  return data ?? []
}

export async function getDriver(id: string): Promise<DriverRow | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('id', id)
    .returns<DriverRow[]>()
    .maybeSingle()
  if (error) throw error
  return data
}

export type DriverDraft = Pick<DriverRow, 'league_id' | 'display_name'> & Partial<DriverRow>

export async function createDriver(draft: DriverDraft): Promise<DriverRow> {
  const { data, error } = await supabase
    .from('drivers')
    .insert(draft)
    .select('*')
    .returns<DriverRow[]>()
    .single()
  if (error) throw error
  return data
}

export async function updateDriver(id: string, patch: Partial<DriverRow>): Promise<void> {
  const { error } = await supabase
    .from('drivers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function setDriverActive(id: string, isActive: boolean): Promise<void> {
  await updateDriver(id, { is_active: isActive })
}

/** Self-service: a linked driver may unlink themselves even without manager permission. */
export async function unlinkSelfFromDriver(driverId: string): Promise<void> {
  const { error } = await supabase.from('drivers').update({ user_id: null }).eq('id', driverId)
  if (error) throw error
}

export async function getSeasonRoster(seasonId: string): Promise<
  (SeasonDriverRow & { drivers: DriverRow })[]
> {
  const { data, error } = await supabase
    .from('season_drivers')
    .select('*, drivers(*)')
    .eq('season_id', seasonId)
    .returns<(SeasonDriverRow & { drivers: DriverRow })[]>()
  if (error) throw error
  return data ?? []
}

export async function assignDriverToSeason(
  draft: Pick<SeasonDriverRow, 'season_id' | 'driver_id' | 'league_id'> &
    Partial<SeasonDriverRow>,
): Promise<SeasonDriverRow> {
  const { data, error } = await supabase
    .from('season_drivers')
    .insert(draft)
    .select('*')
    .returns<SeasonDriverRow[]>()
    .single()
  if (error) throw error
  return data
}

export async function updateSeasonDriver(
  id: string,
  patch: Partial<SeasonDriverRow>,
): Promise<void> {
  const { error } = await supabase
    .from('season_drivers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function removeDriverFromSeason(id: string): Promise<void> {
  const { error } = await supabase.from('season_drivers').delete().eq('id', id)
  if (error) throw error
}
