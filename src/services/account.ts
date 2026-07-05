import { supabase } from '@/supabase/client'

export interface BlockingLeague {
  leagueId: string
  leagueName: string
  otherMemberCount: number
}

export async function getBlockingLeagues(): Promise<BlockingLeague[]> {
  const { data, error } = await supabase.rpc('vrc_account_deletion_blocking_leagues')
  if (error) throw error
  return (data as { league_id: string; league_name: string; other_member_count: number }[]).map(
    (r) => ({
      leagueId: r.league_id,
      leagueName: r.league_name,
      otherMemberCount: r.other_member_count,
    }),
  )
}

export async function reauthenticate(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Password did not match your account. Try again.')
}

export interface AccountDeletionSummary {
  leaguesDeleted: number
  driversAnonymized: number
}

/**
 * Calls the process-account-deletion edge function. This is server-side only —
 * it needs SUPABASE_SERVICE_ROLE_KEY to purge Storage objects and delete the
 * auth.users row, so the web client cannot do this with the anon key alone.
 * The function itself authorizes via the caller's bearer token.
 */
export async function deleteAccount(): Promise<AccountDeletionSummary> {
  const { data, error } = await supabase.functions.invoke('process-account-deletion', {
    body: {},
  })
  if (error) throw error
  const result = data as { leagues_deleted: number; drivers_anonymized: number }
  return { leaguesDeleted: result.leagues_deleted, driversAnonymized: result.drivers_anonymized }
}

export function purgeLocalSessionData(): void {
  supabase.removeAllChannels()
  window.localStorage.removeItem('vrc-pending-invite')
}
