/**
 * Global MMR contracts. Every value here is returned by a server-authoritative RPC and rendered as-is — the browser
 * never calculates a rating, tier, placement or delta. Privacy rules enforced by the backend (and respected by every
 * web surface):
 *
 *  - `vrc_get_my_global_rating` returns the exact rating/tier/placement/ledger ONLY to the signed-in account and ONLY
 *    once the feature is public (`feature_visibility_status = 'public'`). During Shadow it returns `coming_soon`.
 *  - `vrc_get_league_driver_mmr_display` exposes just tier, Global # and title badge (plus a finalized race delta) for
 *    drivers in a league the caller belongs to — never exact MMR, account identity, or any model input.
 *  - `vrc_get_result_mmr_impact` returns finalized per-driver deltas only after the authoritative calculation ran.
 */

export interface MmrParticipation {
  ok: boolean
  status?: string | null
  error?: string | null
  participation_status?: 'opted_in' | 'opted_out' | string | null
  opted_out_at?: string | null
  effective_for_scheduled_races_after?: string | null
  mfa_active?: boolean | null
  /** `shadow` until the backend activates the feature, then `public`. */
  feature_visibility_status?: 'shadow' | 'public' | string | null
  current_epoch_sequence?: number | null
  current_epoch_status?: string | null
}

export type GlobalRatingState = 'coming_soon' | 'opted_out' | 'provisional' | 'active' | 'inactive'

export interface GlobalRatingLedgerRaceRef {
  league_name?: string | null
  event_title?: string | null
  round?: number | null
  class_name?: string | null
  finish_position?: number | null
}

export interface GlobalRatingLedgerEntry {
  occurred_at?: string | null
  pre_mmr: number
  final_delta: number
  post_mmr: number
  result_state?: string | null
  mmr_display_status?: 'revised' | 'voided' | string | null
  race?: GlobalRatingLedgerRaceRef | null
}

export interface GlobalRatingChampionTerm {
  term_id?: string | null
  term_start_at?: string | null
  term_end_at?: string | null
  status?: 'active' | 'expired' | 'revoked' | string | null
}

export interface GlobalRating {
  ok: boolean
  state: GlobalRatingState | string
  feature_visibility_status?: string | null
  participation_status?: string | null
  effective_for_scheduled_races_after?: string | null
  current_mmr?: number | null
  tier?: string | null
  global_rank?: number | null
  provisional?: boolean | null
  provisional_progress?: { eligible_event_count: number; required: number } | null
  activity_status?: string | null
  activity_reason?: string | null
  is_national_champion?: boolean | null
  is_world_champion?: boolean | null
  title_badge?: string | null
  champion_term?: GlobalRatingChampionTerm | null
  epoch_sequence?: number | null
  epoch_status?: string | null
  linked_drivers?: { league_name?: string | null; driver_display_name?: string | null; linked_at?: string | null }[] | null
  ledger?: { entries: GlobalRatingLedgerEntry[]; has_more: boolean; next_before: string | null } | null
  /** One-time "Global MMR is live" announcement; null once acknowledged. */
  announcement?: { key: string; headline: string; body: string } | null
}

export interface ResultMmrImpact {
  ok: boolean
  feature_visibility_status?: string | null
  /** `coming_soon` | `none` | `processing` | `finalized` | `not_eligible` */
  calculation_state?: string | null
  revised?: boolean | null
  drivers?: { driver_id: string; final_delta: number | null; mmr_display_status?: string | null }[] | null
  /** Returned only to league Owner/Admin. */
  insufficient_field_message?: string | null
}

export interface LeagueMmrDisplayRow {
  driver_id: string
  /** server `mmr_rank_tier` string or "provisional" */
  tier?: string | null
  global_rank?: number | null
  title_badge?: string | null
  finalized_delta?: number | null
  mmr_display_status?: string | null
}

export interface LeagueMmrDisplay {
  ok: boolean
  /** `coming_soon` | `public` */
  state?: string | null
  drivers?: LeagueMmrDisplayRow[] | null
}

export interface ChampionAward {
  ok: boolean
  /** `none` | `active` | `expired` | `revoked` */
  state: string
  term_id?: string | null
  term_start_at?: string | null
  term_end_at?: string | null
  headline?: string | null
  body?: string | null
  acknowledged?: boolean | null
  /** `active` | `paid_subscription_preserved` | `expired` | `revoked` */
  entitlement_status?: string | null
  apple_offer?: {
    required: boolean
    /** `not_required` | `pending` | `issued` | `revealed` | `redeemed` | `failed` | `cancelled` */
    status: string
  } | null
  /** `pending` | `sending` | `sent` | `failed` */
  email_status?: string | null
  reward_flow_available?: boolean | null
}

export interface ChampionAppleOfferResult {
  ok?: boolean
  state?: string
  error?: string
  apple_offer?: { code?: string | null; redeem_url?: string | null } | null
}

export const TIER_LABEL: Record<string, string> = {
  provisional: 'Provisional',
  novice: 'Novice',
  c: 'Class C',
  b: 'Class B',
  a: 'Class A',
  s: 'Class S',
  s_plus: 'Class S+',
  national_champion: 'National Champion',
}

export function tierLabel(tier: string | null | undefined): string {
  if (!tier) return '—'
  return TIER_LABEL[tier] ?? tier.charAt(0).toUpperCase() + tier.slice(1)
}
