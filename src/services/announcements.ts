import { supabase } from '@/supabase/client'
import type { LeagueAnnouncementRow } from '@/types/database'

/**
 * League announcements. The live table is `(id, league_id, author_membership_id, title, body, created_at, updated_at)`; every member may
 * read, Owner/Admin may write, and the INSERT policy requires `author_membership_id` to be the caller's own ACTIVE membership in that
 * league (plus the restrictive aal2 policy). Note: iOS still selects `pinned` / `championship_id` / `season_id`, which the live table no longer
 * has — the website follows the live schema.
 */
const COLUMNS = 'id, league_id, author_membership_id, title, body, created_at, updated_at'

export async function listAnnouncements(leagueId: string, limit = 8): Promise<LeagueAnnouncementRow[]> {
  const { data, error } = await supabase
    .from('league_announcements')
    .select(COLUMNS)
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<LeagueAnnouncementRow[]>()
  if (error) throw error
  return data ?? []
}

export async function postAnnouncement(leagueId: string, authorMembershipId: string, title: string, body: string): Promise<void> {
  const { error } = await supabase
    .from('league_announcements')
    .insert({ league_id: leagueId, author_membership_id: authorMembershipId, title: title.trim(), body: body.trim() })
  if (error) throw error
}

export async function updateAnnouncement(id: string, patch: { title: string; body: string }): Promise<void> {
  const { error } = await supabase
    .from('league_announcements')
    .update({ title: patch.title.trim(), body: patch.body.trim() })
    .eq('id', id)
  if (error) throw error
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('league_announcements').delete().eq('id', id)
  if (error) throw error
}
