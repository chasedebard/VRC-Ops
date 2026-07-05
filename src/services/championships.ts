import { supabase } from '@/supabase/client'
import type { ChampionshipRow, GameId, SeasonRow } from '@/types/database'

export async function getChampionships(leagueId: string): Promise<ChampionshipRow[]> {
  const { data, error } = await supabase
    .from('championships')
    .select('*')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .returns<ChampionshipRow[]>()
  if (error) throw error
  return data ?? []
}

export async function getChampionship(id: string): Promise<ChampionshipRow | null> {
  const { data, error } = await supabase
    .from('championships')
    .select('*')
    .eq('id', id)
    .returns<ChampionshipRow[]>()
    .maybeSingle()
  if (error) throw error
  return data
}

export type ChampionshipDraft = Pick<ChampionshipRow, 'league_id' | 'name' | 'game_id'> &
  Partial<ChampionshipRow>

export async function createChampionship(draft: ChampionshipDraft): Promise<ChampionshipRow> {
  const { data, error } = await supabase
    .from('championships')
    .insert(draft)
    .select('*')
    .returns<ChampionshipRow[]>()
    .single()
  if (error) throw error
  return data
}

export async function updateChampionship(
  id: string,
  patch: Partial<ChampionshipRow>,
): Promise<void> {
  const { error } = await supabase
    .from('championships')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function setChampionshipGame(
  championshipId: string,
  game: GameId,
  confirm: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('vrc_set_championship_game', {
    p_championship: championshipId,
    p_game: game,
    p_confirm: confirm,
  })
  if (error) throw error
}

export async function deleteChampionshipWithSeasons(championshipId: string): Promise<{
  success: boolean
  seasonsDeleted: number
}> {
  const { data, error } = await supabase.rpc('vrc_delete_championship_with_seasons', {
    p_championship_id: championshipId,
  })
  if (error) throw error
  const row = (data as { success: boolean; seasons_deleted: number }[])[0]
  return { success: row.success, seasonsDeleted: row.seasons_deleted }
}

export async function getSeasons(championshipId: string): Promise<SeasonRow[]> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('championship_id', championshipId)
    .order('year', { ascending: false })
    .returns<SeasonRow[]>()
  if (error) throw error
  return data ?? []
}

export async function getSeason(id: string): Promise<SeasonRow | null> {
  const { data, error } = await supabase
    .from('seasons')
    .select('*')
    .eq('id', id)
    .returns<SeasonRow[]>()
    .maybeSingle()
  if (error) throw error
  return data
}

export type SeasonDraft = Pick<SeasonRow, 'championship_id' | 'league_id' | 'name'> &
  Partial<SeasonRow>

export async function createSeason(draft: SeasonDraft): Promise<SeasonRow> {
  const { data, error } = await supabase
    .from('seasons')
    .insert(draft)
    .select('*')
    .returns<SeasonRow[]>()
    .single()
  if (error) throw error
  return data
}

export async function updateSeason(id: string, patch: Partial<SeasonRow>): Promise<void> {
  const { error } = await supabase
    .from('seasons')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Validates year + at least one event server-side, then deactivates sibling seasons. */
export async function activateSeason(seasonId: string): Promise<void> {
  const { error } = await supabase.rpc('vrc_activate_season', { p_season: seasonId })
  if (error) throw error
}
