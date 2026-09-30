/**
 * Row shapes for the VRC Supabase schema. Hand-maintained (not `supabase gen types`), but reconciled
 * against the LIVE project schema (information_schema + pg_policies + pg_proc) and the vrc-platform
 * migrations through `20260930130000_standing_awards` — see docs/IOS_PARITY.md for the audit date and
 * the contract notes. Regenerate and diff when the backend changes.
 */

export type VrcRole = 'owner' | 'admin' | 'marshal' | 'driver' | 'viewer'

export type LeagueStatus = 'active' | 'archived'
export type ChampionshipStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type SeasonStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type EventStatus =
  | 'draft'
  | 'scheduled'
  | 'live'
  | 'completed'
  | 'cancelled'
  | 'postponed'
  | 'archived'
export type SessionState =
  | 'scheduled'
  | 'practice_available'
  | 'qualifying_active'
  | 'qualifying_complete'
  | 'race_ready'
  | 'race_active'
  | 'race_complete'
  | 'results_pending'
  | 'cancelled'
  | 'postponed'
export type ResultSetState =
  | 'draft'
  | 'submitted'
  | 'in_review'
  | 'returned'
  | 'approved'
  | 'locked'
  | 'finalized'
  | 'reopened'
export type ResultKind = 'qualifying' | 'race'
export type QualifyingStatus = 'set' | 'dns' | 'dsq'
export type RaceResultStatus = 'fin' | 'dnf' | 'dns' | 'dsq' | 'classified' | 'nc'
export type InvitationStatus = 'pending' | 'accepted' | 'revoked'
export type MembershipStatus = 'active' | 'removed'
export type GameId =
  | 'gran_turismo_7'
  | 'iracing'
  | 'nascar'
  | 'forza_horizon'
  | 'formula_1'
export type LegalDocType = 'general' | 'ai' | 'sharing' | 'privacy'
export type StandingsType = 'overall' | 'class' | 'regional' | 'team'
export type CaptureValidationState =
  | 'accepted'
  | 'needsReview'
  | 'lowConfidence'
  | 'trackMismatch'
  | 'incompleteCapture'
  | 'rejected'
export type ClassificationConfidence = 'high' | 'medium' | 'low'

export interface ProfileRow {
  id: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
  /** Versioned account-avatar Storage path (migration 20260826130000_user_avatar_versioned_path). */
  avatar_storage_path: string | null
  profile_completed: boolean
  created_at: string
  updated_at: string
}

export type LeagueSetupState = 'pending_setup' | 'complete'

export interface LeagueRow {
  id: string
  name: string
  abbreviation: string | null
  logo_url: string | null
  owner_id: string
  status: LeagueStatus
  /** `pending_setup` until the owner finishes the guided championship + first-season flow. */
  setup_state: LeagueSetupState
  created_at: string
  updated_at: string
}

export interface MembershipRow {
  id: string
  league_id: string
  user_id: string
  status: MembershipStatus
  created_at: string
  updated_at: string
}

export interface MembershipRoleRow {
  id: string
  membership_id: string
  role: VrcRole
  created_at: string
}

export interface InvitationRow {
  id: string
  league_id: string
  code: string
  email: string | null
  status: InvitationStatus
  created_by: string | null
  accepted_by: string | null
  expires_at: string | null
  send_status: 'pending' | 'sent' | 'failed' | null
  send_error: string | null
  sent_at: string | null
  last_sent_at: string | null
  delivery_provider: string | null
  delivery_message_id: string | null
  created_at: string
  updated_at: string
}

export interface InvitationRoleRow {
  id: string
  invitation_id: string
  role: VrcRole
}

export interface ViewerCodeRow {
  id: string
  league_id: string
  code: string
  is_active: boolean
  created_by: string | null
  created_at: string
  revoked_at: string | null
}

export interface LegalDocumentVersionRow {
  id: string
  doc_type: LegalDocType
  version: number
  effective_date: string
  is_required: boolean
  content: string
  is_active: boolean
  created_at: string
}

export interface LegalAcceptanceRow {
  id: string
  user_id: string
  document_id: string
  doc_type: LegalDocType
  version: number
  league_id: string | null
  accepted_at: string
  platform: string | null
  app_version: string | null
  revoked_at: string | null
  updated_at: string
}

export interface ChampionshipRow {
  id: string
  league_id: string
  name: string
  series_name: string | null
  description: string | null
  logo_url: string | null
  banner_url: string | null
  status: ChampionshipStatus
  default_scoring: Record<string, unknown> | null
  game_id: GameId
  teams_enabled: boolean
  classes_enabled: boolean
  regions_enabled: boolean
  predictions_enabled: boolean
  telemetry_enabled: boolean
  driver_telemetry_enabled: boolean
  viewer_capture_enabled: boolean
  practice_capture_enabled: boolean
  ai_enabled: boolean
  replay_enabled: boolean
  primary_color_hex: string | null
  secondary_color_hex: string | null
  accent_color_hex: string | null
  /** True for the championship the league currently runs as its active context. */
  is_active: boolean
  logo_storage_path: string | null
  created_at: string
  updated_at: string
}

export interface SeasonRow {
  id: string
  championship_id: string
  league_id: string
  name: string
  year: number | null
  start_date: string | null
  end_date: string | null
  status: SeasonStatus
  is_active: boolean
  notes: string | null
  scoring_config: Record<string, unknown> | null
  drop_rounds: number
  tiebreak_config: Record<string, unknown> | null
  /** Season-scoped teams gate — authoritative over the legacy `championships.teams_enabled`. */
  teams_enabled: boolean
  pole_bonus_enabled: boolean
  /** Valid range 1-3; retained even while `pole_bonus_enabled` is false. */
  pole_bonus_points: number
  fastest_lap_bonus_enabled: boolean
  /** Valid range 1-3; retained even while `fastest_lap_bonus_enabled` is false. */
  fastest_lap_bonus_points: number
  created_at: string
  updated_at: string
}

export interface ClassRow {
  id: string
  league_id: string
  name: string
  abbreviation: string | null
  description: string | null
  display_order: number
  is_active: boolean
  /** GT7 leagues: the canonical group (Gr.B/4/3/2/1/X) this class maps to. */
  system_key: string | null
  /** True for a system-owned canonical GT7 group row (managed only by `vrc_set_gt7_league_groups`). */
  is_system: boolean
  /** Whether the league currently races this mapped group. */
  system_selected: boolean
  created_at: string
  updated_at: string
}

export interface RegionRow {
  id: string
  league_id: string
  name: string
  abbreviation: string | null
  description: string | null
  display_order: number
  is_active: boolean
  /** Canonical system regions are read-only for clients (RLS requires is_system = false to write). */
  is_system: boolean
  system_key: string | null
  created_at: string
  updated_at: string
}

export interface TeamRow {
  id: string
  league_id: string
  name: string
  abbreviation: string | null
  logo_url: string | null
  color: string | null
  is_active: boolean
  /** Season-scoped team fields (shared schema, also used by iOS/Android). */
  season_id: string | null
  championship_id: string | null
  display_order: number | null
  created_by: string | null
  updated_by: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export interface DriverRow {
  id: string
  league_id: string
  user_id: string | null
  display_name: string
  first_name: string | null
  last_name: string | null
  driver_number: number | null
  image_url: string | null
  bio: string | null
  platform_id: string | null
  racing_id: string | null
  team_id: string | null
  class_id: string | null
  region_id: string | null
  is_active: boolean
  profile_image_path: string | null
  created_at: string
  updated_at: string
}

export interface SeasonDriverRow {
  id: string
  season_id: string
  driver_id: string
  league_id: string
  team_id: string | null
  class_id: string | null
  region_id: string | null
  number_override: number | null
  is_active: boolean
  joined_round: number | null
  left_round: number | null
  created_at: string
  updated_at: string
}

export interface DriverGameIdentityRow {
  id: string
  league_id: string
  driver_id: string
  game_id: GameId
  in_game_username: string
  platform_account_id: string | null
  external_driver_id: string | null
  verification_state: 'unverified' | 'pending' | 'verified' | 'rejected'
  last_verified: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

/** Shared shape for gt7_tracks / iracing_tracks / nascar_tracks / forza_horizon_tracks / formula_1_tracks. */
export interface TrackRow {
  id: string
  game_id: GameId
  league_id: string | null
  name: string
  layout: string | null
  in_game_name: string | null
  country: string | null
  region: string | null
  length: number | null
  length_unit: string | null
  surface: string | null
  biome: string | null
  environment: string | null
  direction: string | null
  circuit_type: string | null
  classification: string | null
  supports_asphalt: boolean
  supports_dirt: boolean
  supports_snow: boolean
  supports_mixed: boolean
  supports_wet: boolean
  supports_day: boolean
  supports_night: boolean
  track_image_url: string | null
  map_image_url: string | null
  external_game_id: string | null
  source_name: string | null
  source_url: string | null
  source_type: string | null
  last_verified: string | null
  data_confidence: 'verified' | 'provisional' | 'placeholder' | 'unknown'
  requires_human_review: boolean
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export const TRACK_TABLE_BY_GAME: Record<GameId, string> = {
  gran_turismo_7: 'gt7_tracks',
  iracing: 'iracing_tracks',
  nascar: 'nascar_tracks',
  forza_horizon: 'forza_horizon_tracks',
  formula_1: 'formula_1_tracks',
}

export interface EventRow {
  id: string
  league_id: string
  championship_id: string
  season_id: string
  round: number
  /** NOT NULL in the live schema (track-generated title). */
  title: string
  custom_title: string | null
  track_id: string | null
  track_layout: string | null
  event_date: string | null
  start_time: string | null
  time_zone: string | null
  class_id: string | null
  region_id: string | null
  practice_config: Record<string, unknown> | null
  qualifying_minutes: number | null
  race_distance_type: 'laps' | 'endurance' | null
  race_value: number | null
  tire_rules: string | null
  fuel_rules: string | null
  weather_notes: string | null
  penalty_notes: string | null
  notes: string | null
  status: EventStatus
  is_published: boolean
  is_team_event: boolean
  created_at: string
  updated_at: string
}

export interface EventDriverRow {
  id: string
  event_id: string
  driver_id: string
  league_id: string
  created_at: string
}

export interface EventClassRow {
  id: string
  event_id: string
  league_id: string
  class_id: string
  created_at: string
}

export interface EventSessionRow {
  id: string
  event_id: string
  league_id: string
  state: SessionState
  version: number
  override_active: boolean
  qualifying_started_at: string | null
  qualifying_ended_at: string | null
  race_started_at: string | null
  race_ended_at: string | null
  last_transition_at: string | null
  last_actor: string | null
  created_at: string
  updated_at: string
}

export interface EventSessionAuditRow {
  id: string
  event_id: string
  league_id: string
  actor: string | null
  previous_state: SessionState | null
  new_state: SessionState
  reason: string | null
  was_override: boolean
  created_at: string
}

export interface EventSessionNoteRow {
  id: string
  event_id: string
  league_id: string
  author: string | null
  note: string
  created_at: string
}

export interface ResultSetRow {
  id: string
  event_id: string
  league_id: string
  kind: ResultKind
  state: ResultSetState
  revision: number
  is_published: boolean
  official: boolean
  published: boolean
  locked: boolean
  scoring_version: number | null
  notes: string | null
  submitted_by: string | null
  submitted_at: string | null
  reviewed_by: string | null
  approved_by: string | null
  approved_at: string | null
  locked_at: string | null
  finalized_at: string | null
  saved_by: string | null
  saved_at: string | null
  updated_by: string | null
  reopened_by: string | null
  reopened_at: string | null
  created_at: string
  updated_at: string
}

export interface QualifyingResultRow {
  id: string
  result_set_id: string
  league_id: string
  driver_id: string
  position: number | null
  best_lap_ms: number | null
  gap_ms: number | null
  status: QualifyingStatus
  grid_adjustment: number | null
  penalty_positions: number | null
  earned_pole: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface RaceResultRow {
  id: string
  result_set_id: string
  league_id: string
  driver_id: string
  finish_position: number | null
  start_position: number | null
  laps_completed: number | null
  total_time_ms: number | null
  gap_ms: number | null
  best_lap_ms: number | null
  fastest_lap: boolean
  earned_pole: boolean
  pole_manually_overridden: boolean
  status: RaceResultStatus
  bonus_points: number
  penalty_points: number
  team_id: string | null
  class_id: string | null
  region_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface PenaltyRow {
  id: string
  event_id: string
  league_id: string
  driver_id: string
  penalty_type: string | null
  time_penalty_ms: number | null
  position_penalty: number | null
  point_deduction: number | null
  disqualification: boolean
  reason: string | null
  issued_by: string | null
  issued_at: string
  created_at: string
}

export interface ScoreAdjustmentRow {
  id: string
  event_id: string
  league_id: string
  driver_id: string | null
  team_id: string | null
  class_id: string | null
  region_id: string | null
  points_delta: number
  reason: string | null
  acting_user: string | null
  created_at: string
}

export interface ScoringOutputRow {
  id: string
  event_id: string
  league_id: string
  season_id: string
  championship_id: string
  driver_id: string
  earned_points: number
  adjustment_points: number
  total_points: number
  finish_position: number | null
  status: RaceResultStatus | null
  earned_pole: boolean
  fastest_lap: boolean
  is_team_event: boolean
  class_id: string | null
  region_id: string | null
  team_id: string | null
  scoring_version: number | null
  created_at: string
}

export interface StandingsSnapshotRow {
  id: string
  league_id: string
  championship_id: string
  season_id: string
  event_id: string | null
  standings_type: StandingsType
  group_key: string | null
  scoring_version: number | null
  calculated_at: string
  created_at: string
}

export interface StandingsSnapshotRowRow {
  id: string
  snapshot_id: string
  league_id: string
  event_id: string | null
  driver_id: string | null
  team_id: string | null
  position: number
  points: number
  wins: number
  seconds: number
  thirds: number
  podiums: number
  poles: number
  fastest_laps: number
  starts: number
  average_finish: number | null
  clinched: boolean
  eliminated: boolean
  tiebreak: Record<string, unknown> | null
  created_at: string
}

export interface ResultAuditRow {
  id: string
  event_id: string
  league_id: string
  result_set_id: string | null
  actor: string | null
  action: string
  action_type: string | null
  actor_role: string | null
  previous_state: string | null
  new_state: string | null
  reason: string | null
  before_snapshot: Record<string, unknown> | null
  after_snapshot: Record<string, unknown> | null
  created_at: string
}

export interface DriverHistoryRow {
  id: string
  league_id: string
  championship_id: string
  season_id: string
  event_id: string
  driver_id: string
  result_kind: ResultKind
  track_id: string | null
  region_id: string | null
  class_id: string | null
  team_id: string | null
  finish_position: number | null
  start_position: number | null
  qualifying_position: number | null
  best_lap_ms: number | null
  earned_pole: boolean
  fastest_lap: boolean
  status: string | null
  points: number | null
  is_team_event: boolean
  result_revision: number | null
  saved_at: string | null
  created_at: string
}

export interface CaptureSummaryRow {
  id: string
  league_id: string
  event_id: string
  driver_id: string
  phase: 'practice' | 'qualifying' | 'race'
  capture_started_at: string | null
  capture_ended_at: string | null
  total_completed_lap_count: number
  representative_lap_count: number
  pit_lap_count: number
  excluded_lap_count: number
  invalid_lap_count: number
  fastest_representative_ms: number | null
  total_representative_duration_ms: number | null
  average_representative_ms: number | null
  representative_variance_sum_sq: number | null
  representative_std_dev: number | null
  consistency_score: number | null
  validation_state: CaptureValidationState
  classification_confidence: ClassificationConfidence
  classifier_version: string | null
  calculation_version: string | null
  device_created_at: string | null
  device_updated_at: string | null
  created_at: string
  updated_at: string
}

export interface RwEventDriverAggregateRow {
  league_id: string
  event_id: string
  driver_id: string
  phase: 'practice' | 'qualifying' | 'race'
  capture_count: number
  total_completed_laps: number
  representative_laps: number
  pit_laps: number
  excluded_laps: number
  invalid_laps: number
  fastest_representative_ms: number | null
  total_representative_duration_ms: number | null
  average_representative_ms: number | null
  variance: number | null
  last_updated_at: string
}

export interface RwQualifyingCandidateRow {
  event_id: string
  driver_id: string
  league_id: string
  fastest_ms: number | null
  source_summary_id: string | null
  history: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface PredictionRunRow {
  id: string
  league_id: string
  championship_id: string | null
  season_id: string | null
  event_id: string | null
  category: string
  model_version: string
  source_signature: string
  source_data_cutoff: string | null
  official_race_count: number | null
  excluded_result_count: number | null
  input_summary: string | null
  payload: Record<string, unknown>
  generated_at: string
  created_at: string
}

export interface PredictionEvaluationRow {
  id: string
  league_id: string
  prediction_run_id: string | null
  season_id: string | null
  event_id: string | null
  category: string
  score: number | null
  hit_count: number | null
  sample_count: number | null
  summary: string | null
  predicted_driver_ids: string[] | null
  actual_driver_ids: string[] | null
  evaluated_at: string | null
  created_at: string
}

/** Personal ("VRC Ops Pro") status; league-wide status also uses this enum plus 'pending_verification'. */
export type SubscriptionStatus = 'active' | 'grace_period' | 'billing_retry' | 'expired' | 'revoked'
export type LeagueSubscriptionStatus = SubscriptionStatus | 'pending_verification'
export type SubscriptionEnvironment = 'Sandbox' | 'Production' | 'Xcode' | 'LocalTesting'

/** Individual "VRC Ops Pro" entitlement, written only by the verify-subscription/apple-notifications Edge Functions. */
export interface SubscriptionRow {
  id: string
  user_id: string
  product_id: string
  original_transaction_id: string
  latest_transaction_id: string | null
  status: SubscriptionStatus
  expires_at: string | null
  purchased_at: string | null
  renewal_state: string | null
  environment: SubscriptionEnvironment
  last_verified_at: string
  created_at: string
  updated_at: string
}

/** League-wide "VRC League Plus" entitlement; inherited by every active member regardless of role. */
export interface LeagueSubscriptionRow {
  id: string
  league_id: string
  purchaser_user_id: string
  product_id: string
  original_transaction_id: string
  latest_transaction_id: string | null
  status: LeagueSubscriptionStatus
  expires_at: string | null
  purchased_at: string | null
  renewal_state: string | null
  environment: SubscriptionEnvironment
  last_verified_at: string
  created_at: string
  updated_at: string
}


// ---- Newer backend tables (live schema, post-2026-07) -------------------------------------------------

export type StandingAwardScope = 'overall' | 'class' | 'region' | 'team' | string
export type StandingAwardStatus = 'clinched' | 'champion' | 'ended' | 'revoked' | string

/** Series trophy/clinch ledger written through `vrc_sync_series_awards`; readable by every league member. */
export interface StandingAwardRow {
  id: string
  league_id: string
  championship_id: string
  season_id: string
  driver_id: string
  scope: StandingAwardScope
  scope_id: string | null
  status: StandingAwardStatus
  points: number
  clinched_round: number | null
  clinched_event_id: string | null
  final_round: number | null
  result_set_id: string | null
  result_revision: number | null
  awarded_at: string
  finalized_at: string | null
  ended_at: string | null
  end_reason: string | null
  created_at: string
  updated_at: string
}

/** Authoritative season rival relationship (migration 20260906193000_season_driver_rivals_v1). */
export interface SeasonDriverRivalRow {
  id: string
  league_id: string
  championship_id: string
  season_id: string
  driver_id: string
  rival_driver_id: string | null
  algorithm_version: string
  strength: number | null
  closeness: number | null
  contested: number | null
  consistency: number | null
  title_gap: number | null
  shared_races: number
  subject_ahead: number
  rival_since_round: number | null
  previous_rival_driver_id: string | null
  as_of_round: number
  computed_at: string
}

export interface LeagueAnnouncementRow {
  id: string
  league_id: string
  author_membership_id: string
  title: string
  body: string
  created_at: string
  updated_at: string
}

export interface LeaguePlusSeatRow {
  id: string
  league_id: string
  membership_id: string
  granted_by: string
  granted_at: string
}

export interface PredictionJobRow {
  id: string
  championship_id: string
  season_id: string
  event_id: string | null
  reason: string
  status: 'pending' | 'running' | 'completed' | 'failed' | string
  attempts: number
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
  error: string | null
}

export interface DriverRatingRecordRow {
  id: string
  league_id: string
  championship_id: string | null
  season_id: string | null
  driver_id: string | null
  driver_name: string
  rating_value: number
  race_craft: number
  consistency: number
  qualifying: number | null
  confidence: string
  component_summary: string
  model_version: string
  source_signature: string
  source_data_cutoff: string | null
  previous_rating_value: number | null
  change_from_previous: number
  calculated_at: string
  created_at: string
}

export interface EventDriverDnsRow {
  id: string
  event_id: string
  driver_id: string
  league_id: string
  is_dns: boolean
  marked_by: string | null
  created_at: string
  updated_at: string
}
