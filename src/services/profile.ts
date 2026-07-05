import { supabase } from '@/supabase/client'
import type { ProfileRow } from '@/types/database'

export async function getOwnProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
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
