import { supabase } from '@/supabase/client'
import type { ClassRow, RegionRow, TeamRow } from '@/types/database'

/** Shared CRUD shape for classes/regions/teams — all three are league-scoped catalogs
 *  reused across championships, with name/abbreviation/display_order/is_active. */
function catalogService<T extends { id: string; league_id: string; is_active: boolean }>(
  table: 'classes' | 'regions' | 'teams',
) {
  return {
    async list(leagueId: string, includeInactive = true): Promise<T[]> {
      let query = supabase.from(table).select('*').eq('league_id', leagueId)
      if (!includeInactive) query = query.eq('is_active', true)
      const { data, error } = await query
        .order('display_order', { ascending: true, nullsFirst: false })
        .returns<T[]>()
      if (error) throw error
      return data ?? []
    },
    async create(draft: Partial<T> & { league_id: string; name: string }): Promise<T> {
      const { data, error } = await supabase
        .from(table)
        .insert(draft)
        .select('*')
        .returns<T[]>()
        .single()
      if (error) throw error
      return data
    },
    async update(id: string, patch: Partial<T>): Promise<void> {
      const { error } = await supabase
        .from(table)
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    async setActive(id: string, isActive: boolean): Promise<void> {
      const { error } = await supabase
        .from(table)
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    async remove(id: string): Promise<void> {
      const { error } = await supabase.from(table).delete().eq('id', id)
      if (error) throw error
    },
  }
}

export const classesService = catalogService<ClassRow>('classes')
export const regionsService = catalogService<RegionRow>('regions')
export const teamsService = catalogService<TeamRow>('teams')
