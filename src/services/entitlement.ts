import { supabase } from '@/supabase/client'
import type { LeagueSubscriptionRow, SubscriptionRow } from '@/types/database'

/**
 * Calls the same SECURITY DEFINER RPCs iOS and the backend rely on to decide
 * Pro access — never re-derive the individual-vs-League+ precedence client-side
 * (see resolveEntitlement in @/permissions/entitlement for the read-only merge
 * of these two booleans).
 */
export async function getMyProStatus(): Promise<boolean> {
  const { data, error } = await supabase.rpc('vrc_user_is_pro')
  if (error) throw error
  return Boolean(data)
}

export async function getLeaguePremiumAccess(leagueId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('vrc_has_premium_access', { p_league: leagueId })
  if (error) throw error
  return Boolean(data)
}

/**
 * A user can have more than one historical `subscriptions` row (a new
 * original_transaction_id per re-subscribe); the most relevant one to display
 * is whichever expires latest, matching iOS's `max(by: expirationDate)` pick
 * among entitled snapshots.
 */
export async function getMySubscription(userId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .order('expires_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getLeagueSubscription(leagueId: string): Promise<LeagueSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('league_subscriptions')
    .select('*')
    .eq('league_id', leagueId)
    .order('expires_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}
