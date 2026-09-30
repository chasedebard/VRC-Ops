import { supabase } from '@/supabase/client'
import { LEAGUE_PLUS_SEAT_LIMIT } from '@/config/featureRegistry'

/**
 * League Plus seat model (live backend, migration `league_plus_seat_selection`): League Plus grants premium access to up
 * to 15 SELECTED members, not every member. While `league_plus_seats` is empty for a league everyone active is
 * auto-included (first 15 by join order); the first explicit grant/revoke by the owner locks that set in. A league may
 * grow past 15 members freely — only League Plus access is capped. Purchase and billing happen in the App Store.
 */

export interface SeatHolder {
  membershipId: string
  userId: string
  grantedAt: string
}

export async function getLeaguePlusSeatCount(leagueId: string): Promise<number> {
  const { data, error } = await supabase.rpc('vrc_league_plus_seat_count', { p_league: leagueId })
  if (error) throw error
  return Number(data ?? 0)
}

export async function getLeaguePlusSeatHolders(leagueId: string): Promise<SeatHolder[]> {
  const { data, error } = await supabase.rpc('vrc_league_plus_seat_holders', { p_league: leagueId })
  if (error) throw error
  return ((data ?? []) as { membership_id: string; user_id: string; granted_at: string }[]).map((r) => ({
    membershipId: r.membership_id,
    userId: r.user_id,
    grantedAt: r.granted_at,
  }))
}

/** Owner-only, requires an active League Plus subscription, atomically capped at 15. */
export async function setLeaguePlusSeat(leagueId: string, membershipId: string, grant: boolean): Promise<void> {
  const { error } = await supabase.rpc('vrc_set_league_plus_seat', {
    p_league: leagueId,
    p_membership: membershipId,
    p_grant: grant,
  })
  if (error) throw error
}

export const seatsAvailable = (seatCount: number): number => Math.max(0, LEAGUE_PLUS_SEAT_LIMIT - seatCount)
