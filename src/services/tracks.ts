import { supabase } from '@/supabase/client'
import { TRACK_TABLE_BY_GAME } from '@/types/database'
import type { GameId, TrackRow } from '@/types/database'

/** Per-game track catalogs are five separate tables (see TRACK_TABLE_BY_GAME); shared rows
 *  have league_id = null, league-specific rows are scoped to the caller's league. */
export async function getTracks(game: GameId, leagueId: string): Promise<TrackRow[]> {
  const table = TRACK_TABLE_BY_GAME[game]
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .or(`league_id.is.null,league_id.eq.${leagueId}`)
    .order('name')
    .returns<TrackRow[]>()
  if (error) throw error
  return data ?? []
}

export async function createTrack(
  game: GameId,
  draft: Partial<TrackRow> & { name: string; league_id: string },
): Promise<TrackRow> {
  const table = TRACK_TABLE_BY_GAME[game]
  const { data, error } = await supabase
    .from(table)
    .insert({ ...draft, game_id: game })
    .select('*')
    .returns<TrackRow[]>()
    .single()
  if (error) throw error
  return data
}

export async function updateTrack(game: GameId, id: string, patch: Partial<TrackRow>): Promise<void> {
  const table = TRACK_TABLE_BY_GAME[game]
  const { error } = await supabase
    .from(table)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export interface TrackImportRow {
  name: string
  layout?: string
  in_game_name?: string
  country?: string
  length?: number
  length_unit?: string
}

/** Bulk import from a parsed CSV (see pages/TracksPage for the parser) — inserts one row per line. */
export async function bulkImportTracks(
  game: GameId,
  leagueId: string,
  rows: TrackImportRow[],
): Promise<number> {
  const table = TRACK_TABLE_BY_GAME[game]
  const payload = rows.map((r) => ({ ...r, game_id: game, league_id: leagueId, is_active: true }))
  const { error, count } = await supabase.from(table).insert(payload, { count: 'exact' })
  if (error) throw error
  return count ?? payload.length
}
