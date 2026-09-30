import { ACTIVE_SEASON_LIMIT, PRO_OWNED_LEAGUE_LIMIT, featureDefinition, type AppFeature } from '@/config/featureRegistry'
import type { LeagueSubscriptionRow } from '@/types/database'

/**
 * Pure mirror of the iOS subscription models (VRCSubscriptionModels.swift / VRCSubscriptionManagement.swift). The
 * browser never decides access — `vrc_user_is_pro` / `vrc_has_premium_access` do — but it must describe the same state
 * the same way iOS does, including backend-issued complimentary grants that have no App Store subscription behind them.
 */

type AnySubscription = {
  status: string
  expires_at: string | null
  renewal_state: string | null
  product_id: string
  environment?: string | null
}

/** Entitled while active or in grace, and not past its own expiry — the same rule `vrc_user_is_pro()` applies. */
export function isRecordEntitled(record: Pick<AnySubscription, 'status' | 'expires_at'>, now: Date = new Date()): boolean {
  if (record.status !== 'active' && record.status !== 'grace_period') return false
  if (!record.expires_at) return true
  return new Date(record.expires_at).getTime() > now.getTime()
}

/** A user can hold several historical rows; prefer an entitled one, else the one that expires last. */
export function pickRelevantSubscription<T extends AnySubscription>(records: T[], now: Date = new Date()): T | null {
  if (records.length === 0) return null
  const entitled = records.filter((r) => isRecordEntitled(r, now))
  const pool = entitled.length > 0 ? entitled : records
  return [...pool].sort((a, b) => (b.expires_at ?? '9999').localeCompare(a.expires_at ?? '9999'))[0] ?? null
}

export function isComplimentaryGrant(record: Pick<AnySubscription, 'environment'> | null | undefined): boolean {
  return record?.environment === 'ChampionGrant' || record?.environment === 'AndroidPlatformGrant'
}

export function isWorldChampionGrant(record: Pick<AnySubscription, 'environment'> | null | undefined): boolean {
  return record?.environment === 'ChampionGrant'
}

/** A permanent complimentary League Plus grant issued server-side (no App Store transaction, no expiry). */
export function isComplimentaryLeagueRecord(record: Pick<LeagueSubscriptionRow, 'product_id'> | null | undefined): boolean {
  return Boolean(record?.product_id.endsWith('.complimentary'))
}

export type RenewalState =
  | 'will_renew'
  | 'will_expire'
  | 'will_change_product'
  | 'grace_period'
  | 'billing_retry'
  | 'revoked'
  | 'expired'
  | 'champion_term'
  | 'unknown'

export function parseRenewalState(raw: string | null | undefined): RenewalState {
  if (!raw) return 'unknown'
  if (raw.startsWith('will_change_to')) return 'will_change_product'
  const known: RenewalState[] = [
    'will_renew',
    'will_expire',
    'grace_period',
    'billing_retry',
    'revoked',
    'expired',
    'champion_term',
  ]
  return (known as string[]).includes(raw) ? (raw as RenewalState) : 'unknown'
}

export const RENEWAL_TEXT: Record<RenewalState, string> = {
  will_renew: 'Renews automatically',
  will_expire: 'Expires at end of period',
  will_change_product: 'Plan changes at next renewal',
  grace_period: 'Payment issue — access continues',
  billing_retry: 'Payment retry in progress',
  revoked: 'Refunded',
  expired: 'Expired',
  champion_term: 'Complimentary — doesn’t renew',
  unknown: '—',
}

export const PRO_GROUP_NAME = 'VRC Ops Pro'
export const LEAGUE_PLUS_GROUP_NAME = 'VRC League Plus'

const PRO_PLAN_NAME: Record<string, string> = {
  'org.vrcops.pro.monthly_v2': 'Monthly',
  'org.vrcops.pro.monthly': 'Monthly',
  'org.vrcops.pro.yearly': 'Yearly',
}
const LEAGUE_PLUS_PLAN_NAME: Record<string, string> = {
  'org.vrcops.leagueplus.monthly': 'League Plus Monthly',
  'org.vrcops.leagueplus.yearly': 'League Plus Yearly',
}

export function proPlanName(record: AnySubscription | null): string {
  if (!record) return 'Free'
  if (isWorldChampionGrant(record)) return `${PRO_GROUP_NAME} — World Champion Reward`
  const plan = PRO_PLAN_NAME[record.product_id]
  return plan ? `${PRO_GROUP_NAME} — ${plan}` : PRO_GROUP_NAME
}

export function leaguePlusPlanName(productId: string): string {
  if (LEAGUE_PLUS_PLAN_NAME[productId]) return LEAGUE_PLUS_PLAN_NAME[productId]
  if (productId.endsWith('.complimentary')) return 'Permanent (Complimentary)'
  return productId
}

export type PremiumSource = 'individual_pro' | 'league_plus' | 'none'

/** "Why do I (or don't I) have premium access" — one vocabulary for every web surface (mirror of iOS copy). */
export function premiumAccessDescription(source: PremiumSource, leagueName: string | null, isComplimentary: boolean): string {
  switch (source) {
    case 'individual_pro':
      return `${PRO_GROUP_NAME} — your subscription, active in every league you belong to.`
    case 'league_plus': {
      const league = leagueName ?? 'this league'
      return isComplimentary
        ? `Permanent ${LEAGUE_PLUS_GROUP_NAME} — a complimentary grant for ${league}. It never expires and needs no App Store subscription.`
        : `${LEAGUE_PLUS_GROUP_NAME} — shared with you as a member of ${league}.`
    }
    default:
      return 'No active premium access.'
  }
}

export function premiumAccessLabel(source: PremiumSource, isComplimentary: boolean): string {
  switch (source) {
    case 'individual_pro':
      return PRO_GROUP_NAME
    case 'league_plus':
      return isComplimentary ? 'League Plus (Permanent)' : LEAGUE_PLUS_GROUP_NAME
    default:
      return 'None'
  }
}

/**
 * Whether a "Manage subscription" link belongs on screen. Inherited access (a member who didn't buy League Plus) and
 * complimentary grants never show it — Apple's management page would have nothing to manage.
 */
export function showsManageButton(args: {
  ownsActivePro: boolean
  ownsLeagueRecord: boolean
  leagueRecordIsComplimentary: boolean | null
}): boolean {
  if (args.ownsActivePro) return true
  return args.ownsLeagueRecord && args.leagueRecordIsComplimentary === false
}

// ---- Premium benefits (mirror of VRCPremiumFeature) ----------------------------------------------

export interface PremiumBenefit {
  key: string
  title: string
  summary: string
  feature: AppFeature
}

export const PREMIUM_BENEFITS: PremiumBenefit[] = [
  {
    key: 'advancedPredictions',
    title: 'Advanced Predictions',
    summary: 'Deterministic odds across seven markets, updated every round.',
    feature: 'predictions',
  },
  {
    key: 'telemetryAnalytics',
    title: 'Telemetry Capture & Analytics',
    summary: 'Live GT7 capture with lap classification and pace insight for Race Weekend (capture runs in the iOS app).',
    feature: 'telemetryCapture',
  },
  {
    key: 'photoResultsImport',
    title: 'Photo Results Import',
    summary: 'Snap the results screen — qualifying and race results read on-device, reviewed, then saved (iOS app).',
    feature: 'qualifyingPhotoImport',
  },
  {
    key: 'driverAnalytics',
    title: 'Driver Analytics & Career',
    summary: 'Deep performance trends, track and class breakdowns, and full multi-season career stats.',
    feature: 'advancedDriverAnalytics',
  },
  {
    key: 'multipleLeagues',
    title: 'Multiple Leagues',
    summary: `Create and own up to ${PRO_OWNED_LEAGUE_LIMIT} leagues from a single account.`,
    feature: 'multipleLeagues',
  },
  {
    key: 'multipleActiveSeasons',
    title: 'Multiple Active Seasons',
    summary: `Run up to ${ACTIVE_SEASON_LIMIT} active seasons at the same time. Completed, archived, and future seasons are never limited.`,
    feature: 'multipleActiveSeasons',
  },
  {
    key: 'subseriesStandings',
    title: 'Class & Regional Standings',
    summary: 'Class Subseries and Regional Subseries standings, leaderboards, and championship predictions.',
    feature: 'classStandings',
  },
  {
    key: 'pitWall',
    title: 'Pit Wall',
    summary: 'A deterministic GT7 tuning advisor for Race Weekend — one clear setup change at a time.',
    feature: 'pitWall',
  },
]

/** Benefits whose registry availability is live (never advertise a hidden / coming-soon capability). */
export function availableBenefits(): PremiumBenefit[] {
  return PREMIUM_BENEFITS.filter((b) => featureDefinition(b.feature).availability === 'active')
}
