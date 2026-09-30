import type { GameId } from '@/types/database'

/**
 * Web mirror of the iOS feature registry (`AllFeatures.swift` in vrc-platform,
 * `AllFeatures.registry`). The registry is the single source of truth for which
 * capabilities are live, which are "coming soon", which are deliberately hidden,
 * and which are Pro-gated. The website must never present a `hidden` or
 * `comingSoon` feature as available — consult this module instead of hard-coding
 * availability in a page.
 *
 * Keep this file in lock-step with the iOS registry. The matching parity notes
 * live in docs/IOS_PARITY.md.
 */

export type FeatureAvailability = 'hidden' | 'comingSoon' | 'active'

export type AppFeature =
  | 'granTurismo7'
  | 'iRacing'
  | 'nascar'
  | 'forzaHorizon'
  | 'formula1'
  | 'authentication'
  | 'leagueJoinFlow'
  | 'firstLeagueCreation'
  | 'multipleLeagues'
  | 'firstActiveSeasonCreation'
  | 'multipleActiveSeasons'
  | 'dashboard'
  | 'raceWeekend'
  | 'racePrep'
  | 'pitWall'
  | 'raceControl'
  | 'championshipManagement'
  | 'standings'
  | 'results'
  | 'qualifying'
  | 'driverProfiles'
  | 'driverSelfService'
  | 'settings'
  | 'accountDeletion'
  | 'privacyAndAppInfo'
  | 'memberManagement'
  | 'invitations'
  | 'trackCatalog'
  | 'teams'
  | 'classes'
  | 'regions'
  | 'telemetryCapture'
  | 'predictions'
  | 'qualifyingPhotoImport'
  | 'raceResultsPhotoImport'
  | 'advancedDriverAnalytics'
  | 'classStandings'
  | 'regionalStandings'
  | 'aiRaceWeekend'
  | 'aiStintReview'
  | 'adminCloudPublishing'
  | 'finaleManagement'
  | 'storiesArchive'
  | 'raceReplayCreation'
  | 'driverComparison'
  | 'backendDiagnostics'

export interface FeatureDefinition {
  feature: AppFeature
  availability: FeatureAvailability
  title: string
  message: string
  /** Active features with `requiresPro` are discoverable by everyone but only unlocked with Pro or League Plus. */
  requiresPro: boolean
}

function active(feature: AppFeature, title: string, message: string): FeatureDefinition {
  return { feature, availability: 'active', title, message, requiresPro: false }
}
function pro(feature: AppFeature, title: string, message: string): FeatureDefinition {
  return { feature, availability: 'active', title, message, requiresPro: true }
}
function comingSoon(feature: AppFeature, title: string, message: string): FeatureDefinition {
  return { feature, availability: 'comingSoon', title, message, requiresPro: false }
}
function hidden(feature: AppFeature, title: string, message: string): FeatureDefinition {
  return { feature, availability: 'hidden', title, message, requiresPro: false }
}

const DEFINITIONS: FeatureDefinition[] = [
  active('granTurismo7', 'Gran Turismo 7', 'GT7 is available.'),
  comingSoon('iRacing', 'iRacing', 'iRacing support is coming soon.'),
  comingSoon('nascar', 'NASCAR 25', 'NASCAR support is coming soon.'),
  comingSoon('forzaHorizon', 'Forza Horizon 5', 'Forza support is coming soon.'),
  comingSoon('formula1', 'F1 25', 'F1 support is coming soon.'),

  active('authentication', 'Authentication', 'Authentication is available.'),
  active('leagueJoinFlow', 'League Join Flow', 'League joining is available.'),
  active('firstLeagueCreation', 'First League Creation', 'First league creation is available.'),
  pro('multipleLeagues', 'Multiple Leagues', 'Creating additional leagues requires VRC Ops Pro.'),
  active('firstActiveSeasonCreation', 'First Active Season Creation', 'First active season creation is available.'),
  pro('multipleActiveSeasons', 'Multiple Active Seasons', 'Running multiple active seasons requires VRC Ops Pro.'),

  active('dashboard', 'Dashboard', 'Dashboard is available.'),
  active('raceWeekend', 'Race Weekend', 'Race Weekend is available.'),
  active('racePrep', 'Race Prep', 'Race Prep is available.'),
  pro('pitWall', 'Pit Wall', 'Pit Wall is included with VRC Ops Pro and League Plus.'),
  active('raceControl', 'Race Control', 'Race Control is available.'),
  active('championshipManagement', 'Championship Management', 'Championship management is available.'),
  active('standings', 'Standings', 'Standings are available.'),
  active('results', 'Results', 'Results are available.'),
  active('qualifying', 'Qualifying', 'Qualifying is available.'),
  active('driverProfiles', 'Driver Profiles', 'Driver profiles are available.'),
  active('driverSelfService', 'Driver Self Service', 'Driver self service is available.'),
  active('settings', 'Settings', 'Settings are available.'),
  active('accountDeletion', 'Account Deletion', 'Account deletion is available.'),
  active('privacyAndAppInfo', 'Privacy and App Info', 'Privacy and app info are available.'),
  active('memberManagement', 'Member Management', 'Member management is available.'),
  active('invitations', 'Invitations', 'Invitations are available.'),
  active('trackCatalog', 'Track Catalog', 'Track catalog is available.'),
  active('teams', 'Teams', 'Teams are available.'),
  active('classes', 'Classes', 'Classes are available.'),
  active('regions', 'Regions', 'Regions are available.'),

  pro('telemetryCapture', 'Telemetry Capture', 'Telemetry capture requires VRC Ops Pro.'),
  pro('predictions', 'Predictions', 'Predictions require VRC Ops Pro.'),
  pro('qualifyingPhotoImport', 'Qualifying Photo Import', 'Importing qualifying results from a photo requires VRC Ops Pro.'),
  pro('raceResultsPhotoImport', 'Race Results Photo Import', 'Importing race results from a photo requires VRC Ops Pro.'),
  pro('advancedDriverAnalytics', 'Driver Analytics & Career', 'Advanced driver analytics and Career view require VRC Ops Pro.'),
  pro('classStandings', 'Class Standings', 'Class Subseries standings require VRC Ops Pro or League Plus.'),
  pro('regionalStandings', 'Regional Standings', 'Regional Subseries standings require VRC Ops Pro or League Plus.'),

  hidden('aiRaceWeekend', 'AI Race Weekend', 'AI Race Weekend is hidden.'),
  hidden('aiStintReview', 'AI Stint Review', 'AI stint review is hidden.'),
  hidden('adminCloudPublishing', 'Cloud Publishing', 'Cloud publishing is hidden.'),
  hidden('finaleManagement', 'Finale Management', 'Finale management is hidden.'),
  hidden('storiesArchive', 'Stories Archive', 'Stories archive is hidden.'),
  comingSoon('raceReplayCreation', 'Race Replay Creation', 'Race Replay is coming soon.'),
  hidden('driverComparison', 'Driver Comparison', 'Driver comparison is hidden.'),
  hidden('backendDiagnostics', 'Backend Diagnostics', 'Backend diagnostics are hidden.'),
]

const REGISTRY = new Map<AppFeature, FeatureDefinition>(DEFINITIONS.map((d) => [d.feature, d]))

export function featureDefinition(feature: AppFeature): FeatureDefinition {
  return (
    REGISTRY.get(feature) ?? {
      feature,
      availability: 'hidden',
      title: feature,
      message: 'This feature is hidden.',
      requiresPro: false,
    }
  )
}

export const featureState = (feature: AppFeature): FeatureAvailability => featureDefinition(feature).availability
export const isFeatureActive = (feature: AppFeature): boolean => featureState(feature) === 'active'
export const isFeatureHidden = (feature: AppFeature): boolean => featureState(feature) === 'hidden'
export const isFeatureComingSoon = (feature: AppFeature): boolean => featureState(feature) === 'comingSoon'
export const featureRequiresPro = (feature: AppFeature): boolean => featureDefinition(feature).requiresPro
/** Hidden features never render anywhere; "coming soon" features render only as disabled, labelled placeholders. */
export const shouldShowFeature = (feature: AppFeature): boolean => !isFeatureHidden(feature)

/** Active and, when premium, covered by the resolved premium entitlement (Pro or this league's League Plus seat). */
export function isFeatureUnlocked(feature: AppFeature, hasPremiumAccess: boolean): boolean {
  return isFeatureActive(feature) && (!featureRequiresPro(feature) || hasPremiumAccess)
}

/** An active premium feature the viewer hasn't unlocked — the state that should explain how to get access. */
export function isFeatureProLocked(feature: AppFeature, hasPremiumAccess: boolean): boolean {
  return isFeatureActive(feature) && featureRequiresPro(feature) && !hasPremiumAccess
}

const GAME_FEATURE: Record<GameId, AppFeature> = {
  gran_turismo_7: 'granTurismo7',
  iracing: 'iRacing',
  nascar: 'nascar',
  forza_horizon: 'forzaHorizon',
  formula_1: 'formula1',
}

export const GAME_LABEL: Record<GameId, string> = {
  gran_turismo_7: 'Gran Turismo 7',
  iracing: 'iRacing',
  nascar: 'NASCAR 25',
  forza_horizon: 'Forza Horizon 5',
  formula_1: 'F1 25',
}

export const GAME_IDS: GameId[] = ['gran_turismo_7', 'iracing', 'nascar', 'forza_horizon', 'formula_1']

export const gameFeature = (game: GameId): AppFeature => GAME_FEATURE[game]
export const gameAvailability = (game: GameId): FeatureAvailability => featureState(gameFeature(game))
/** Only games whose integration is live can be chosen for a championship (mirrors `allowsGameSelection`). */
export const allowsGameSelection = (game: GameId): boolean => isFeatureActive(gameFeature(game))

// ---- Plan limits (mirror of AllFeatures.proOwnedLeagueLimit / activeSeasonLimit) -------------

/** Pro ceiling on leagues an account may OWN. The first owned league is always free. */
export const PRO_OWNED_LEAGUE_LIMIT = 5
/** Ceiling on simultaneously ACTIVE seasons in one league (Pro or League Plus). One is always free. */
export const ACTIVE_SEASON_LIMIT = 3
/** League Plus seat ceiling (VRCLeaguePlusPolicy). */
export const LEAGUE_PLUS_SEAT_LIMIT = 15

export const OWNED_LEAGUE_LIMIT_MESSAGE = `You have reached the VRC Ops Pro limit of ${PRO_OWNED_LEAGUE_LIMIT} owned leagues.`
export const ACTIVE_SEASON_LIMIT_MESSAGE = `You can have up to ${ACTIVE_SEASON_LIMIT} active seasons at the same time. Complete, archive, or deactivate an active season before activating another.`

/**
 * Additional-league creation is account-wide, so it keys off the individual Pro subscription only —
 * League Plus never unlocks it. The first owned league is free.
 */
export function canCreateAdditionalLeague(ownedLeagueCount: number, hasIndividualPro: boolean): boolean {
  if (ownedLeagueCount === 0) return true
  return hasIndividualPro && ownedLeagueCount < PRO_OWNED_LEAGUE_LIMIT
}

/** A second active season lives inside one league, so Pro or that league's League Plus unlocks it. */
export function canCreateAdditionalActiveSeason(existingActiveSeasonCount: number, hasPremiumAccess: boolean): boolean {
  if (existingActiveSeasonCount === 0) return true
  return hasPremiumAccess && existingActiveSeasonCount < ACTIVE_SEASON_LIMIT
}
