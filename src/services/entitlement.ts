import { supabase } from '@/supabase/client'
import { pickRelevantSubscription } from '@/utils/subscriptionModel'
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
 * A user can have more than one historical `subscriptions` row (a new original_transaction_id per re-subscribe, plus
 * backend-issued grants); the relevant one to display is an entitled row if any, else whichever expires last —
 * matching iOS's pick among entitled snapshots.
 */
export async function getMySubscription(userId: string): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .returns<SubscriptionRow[]>()
  if (error) throw error
  return pickRelevantSubscription(data ?? [])
}

export async function getLeagueSubscription(leagueId: string): Promise<LeagueSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('league_subscriptions')
    .select('*')
    .eq('league_id', leagueId)
    .returns<LeagueSubscriptionRow[]>()
  if (error) throw error
  return pickRelevantSubscription(data ?? [])
}
