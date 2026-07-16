import { supabase } from '@/supabase/client'

export interface DashboardConfigRow {
  id: string
  user_id: string
  league_id: string
  dashboard_key: string
  schema_version: number
  layout: unknown
  created_at: string
  updated_at: string
}

const DASHBOARD_KEY = 'home'

export async function getDashboardConfig(userId: string, leagueId: string): Promise<DashboardConfigRow | null> {
  const { data, error } = await supabase
    .from('dashboard_configs')
    .select('id, user_id, league_id, dashboard_key, schema_version, layout, created_at, updated_at')
    .eq('user_id', userId)
    .eq('league_id', leagueId)
    .eq('dashboard_key', DASHBOARD_KEY)
    .maybeSingle()
    .returns<DashboardConfigRow>()
  if (error) throw error
  return data
}

export async function saveDashboardConfig(
  userId: string,
  leagueId: string,
  layout: unknown,
  schemaVersion: number,
): Promise<void> {
  const { error } = await supabase.from('dashboard_configs').upsert(
    {
      user_id: userId,
      league_id: leagueId,
      dashboard_key: DASHBOARD_KEY,
      layout,
      schema_version: schemaVersion,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,league_id,dashboard_key' },
  )
  if (error) throw error
}

export async function deleteDashboardConfig(userId: string, leagueId: string): Promise<void> {
  const { error } = await supabase
    .from('dashboard_configs')
    .delete()
    .eq('user_id', userId)
    .eq('league_id', leagueId)
    .eq('dashboard_key', DASHBOARD_KEY)
  if (error) throw error
}
