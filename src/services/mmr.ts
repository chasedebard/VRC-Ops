import { supabase } from '@/supabase/client'
import { verifyChallenge } from '@/services/mfa'
import type {
  ChampionAppleOfferResult,
  ChampionAward,
  GlobalRating,
  LeagueMmrDisplay,
  MmrParticipation,
  ResultMmrImpact,
} from '@/types/mmr'

/**
 * Global MMR client. All calculation is server-side; these are thin typed wrappers over the account-scoped RPCs the
 * iOS app uses (`VRCGlobalRatingParticipationStore`, `VRCChampionAwardStore`, `VRCMMRAnnouncementStore`). No service-role
 * key or secret is involved — each RPC authorizes the caller itself and filters what it returns.
 */

export async function getMyMmrParticipation(): Promise<MmrParticipation> {
  const { data, error } = await supabase.rpc('vrc_get_my_mmr_participation')
  if (error) throw error
  return data as MmrParticipation
}

/** Private rating summary + paginated ledger (only the signed-in account, only once the feature is public). */
export async function getMyGlobalRating(ledgerBefore?: string | null): Promise<GlobalRating> {
  const { data, error } = ledgerBefore
    ? await supabase.rpc('vrc_get_my_global_rating', { p_ledger_before: ledgerBefore })
    : await supabase.rpc('vrc_get_my_global_rating')
  if (error) throw error
  return data as GlobalRating
}

export type ParticipationTarget = 'opted_in' | 'opted_out'

/**
 * Opt in/out. The caller must have confirmed a FRESH authenticator code immediately before — the server re-verifies
 * the session is currently trusted, and only the RPC's authoritative response is rendered (never optimistic).
 */
export async function updateMyMmrParticipation(
  target: ParticipationTarget,
  factorId: string,
  code: string,
): Promise<MmrParticipation> {
  await verifyChallenge(factorId, code.trim())
  const { data, error } = await supabase.rpc('vrc_update_my_mmr_participation', { p_participation_status: target })
  if (error) throw error
  return data as MmrParticipation
}

export function participationFailureMessage(result: MmrParticipation): string {
  switch (result.error) {
    case 'mfa_required':
      return 'Confirm a fresh two-factor code to change your Global Rating participation.'
    case 'account_mfa_required':
      return 'Turn on two-factor authentication for your account before changing Global Rating participation.'
    case 'rate_limited':
      return 'Too many changes just now. Wait a minute, then try again.'
    default:
      return 'Your Global Rating participation could not be updated. Try again.'
  }
}

export async function acknowledgeMmrAnnouncement(key: string): Promise<void> {
  const { error } = await supabase.rpc('vrc_acknowledge_mmr_announcement', { p_key: key })
  if (error) throw error
}

/** Redacted tier / Global # / title badge (+ finalized delta) for drivers of a league the caller belongs to. */
export async function getLeagueDriverMmrDisplay(
  leagueId: string,
  scope: { eventId?: string | null; seasonId?: string | null } = {},
): Promise<LeagueMmrDisplay> {
  const { data, error } = await supabase.rpc('vrc_get_league_driver_mmr_display', {
    p_league_id: leagueId,
    p_event_id: scope.eventId ?? null,
    p_season_id: scope.seasonId ?? null,
  })
  if (error) throw error
  return data as LeagueMmrDisplay
}

export async function getResultMmrImpact(resultSetId: string): Promise<ResultMmrImpact> {
  const { data, error } = await supabase.rpc('vrc_get_result_mmr_impact', { p_result_set_id: resultSetId })
  if (error) throw error
  return data as ResultMmrImpact
}

// ---- Quarterly "The World Champion" award -------------------------------------------------------

export async function getMyChampionAward(): Promise<ChampionAward> {
  const { data, error } = await supabase.rpc('vrc_get_my_champion_award')
  if (error) throw error
  return data as ChampionAward
}

export async function acknowledgeChampionAward(termId: string): Promise<void> {
  const { error } = await supabase.rpc('vrc_acknowledge_champion_award', { p_term_id: termId })
  if (error) throw error
}

/**
 * Apple-paid winner path: fresh two-factor challenge (bumps the session to AAL2 with a recent claim), then the
 * `apple-champion-offer` Edge Function re-verifies live MFA server-side and returns the one-time App Store offer
 * code. The raw code is disclosed only inside this authenticated flow. Redemption itself happens in the App Store.
 */
export async function redeemChampionAppleOffer(
  termId: string,
  factorId: string,
  code: string,
): Promise<ChampionAppleOfferResult> {
  await verifyChallenge(factorId, code.trim())
  const { data, error } = await supabase.functions.invoke('apple-champion-offer', { body: { term_id: termId } })
  if (error) throw error
  return data as ChampionAppleOfferResult
}
