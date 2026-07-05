import { supabase } from '@/supabase/client'
import type { ProfileRow } from '@/types/database'

// `authenticated` only has a column-level GRANT on profiles (see migration
// 20260621120001_backend_cost_security_safeguards.sql), deliberately
// excluding `email` from direct client reads — a `select('*')` here fails
// with "permission denied for table profiles" because the wildcard expands
// to every column, including the ungranted one. Enumerate columns explicitly.
const PROFILE_COLUMNS =
  'id, display_name, first_name, last_name, avatar_url, profile_completed, created_at, updated_at'

export async function getOwnProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .returns<ProfileRow[]>()
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateOwnProfile(
  userId: string,
  patch: Partial<Pick<ProfileRow, 'display_name' | 'first_name' | 'last_name' | 'avatar_url'>>,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, profile_completed: true, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}
