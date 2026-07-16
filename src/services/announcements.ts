import { supabase } from '@/supabase/client'

export interface LeagueAnnouncementRow {
  id: string
  league_id: string
  author_membership_id: string
  title: string
  body: string
  created_at: string
  updated_at: string
}

export async function getLeagueAnnouncements(leagueId: string, limit = 10): Promise<LeagueAnnouncementRow[]> {
  const { data, error } = await supabase
    .from('league_announcements')
    .select('id, league_id, author_membership_id, title, body, created_at, updated_at')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<LeagueAnnouncementRow[]>()
  if (error) throw error
  return data ?? []
}

export async function createLeagueAnnouncement(
  leagueId: string,
  authorMembershipId: string,
  title: string,
  body: string,
): Promise<void> {
  const { error } = await supabase.from('league_announcements').insert({
    league_id: leagueId,
    author_membership_id: authorMembershipId,
    title,
    body,
  })
  if (error) throw error
}

export async function deleteLeagueAnnouncement(id: string): Promise<void> {
  const { error } = await supabase.from('league_announcements').delete().eq('id', id)
  if (error) throw error
}
