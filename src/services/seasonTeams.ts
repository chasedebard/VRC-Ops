import { supabase } from '@/supabase/client'
import type { TeamRow } from '@/types/database'

/**
 * Season-scoped team CRUD. No dedicated RPC exists for this in the shared Supabase project (only
 * `teams.season_id`/`championship_id`/`display_order`/`created_by`/`updated_by`/`archived_at`
 * columns), so — matching every other simple entity in this app (classes, regions, drivers,
 * seasons; see `src/services/catalog.ts`) — this is plain table CRUD relying on RLS to enforce
 * owner/admin-only writes server-side.
 */
export async function getSeasonTeams(seasonId: string, includeArchived = false): Promise<TeamRow[]> {
  let query = supabase.from('teams').select('*').eq('season_id', seasonId)
  if (!includeArchived) query = query.is('archived_at', null)
  const { data, error } = await query
    .order('display_order', { ascending: true, nullsFirst: false })
    .returns<TeamRow[]>()
  if (error) throw error
  return data ?? []
}

export type SeasonTeamDraft = Pick<TeamRow, 'league_id' | 'season_id' | 'championship_id' | 'name'> &
  Partial<TeamRow>

export async function createSeasonTeam(draft: SeasonTeamDraft): Promise<TeamRow> {
  const existing = await getSeasonTeams(draft.season_id as string, true)
  const nextOrder = existing.reduce((max, t) => Math.max(max, t.display_order ?? 0), 0) + 1
  const { data, error } = await supabase
    .from('teams')
    .insert({ ...draft, display_order: draft.display_order ?? nextOrder })
    .select('*')
    .returns<TeamRow[]>()
    .single()
  if (error) throw error
  return data
}

export async function updateSeasonTeam(id: string, patch: Partial<TeamRow>): Promise<void> {
  const { error } = await supabase
    .from('teams')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

/** Soft-archive only — matches the existing historical-data pattern elsewhere in this schema.
 *  An archived team stops appearing in `getSeasonTeams`'s default (active-only) list but is
 *  never deleted, so historical standings that reference it stay intact. */
export async function archiveSeasonTeam(id: string): Promise<void> {
  const { error } = await supabase
    .from('teams')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export function subscribeToSeasonTeams(seasonId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`season_teams:${seasonId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'teams', filter: `season_id=eq.${seasonId}` },
      () => onChange(),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
