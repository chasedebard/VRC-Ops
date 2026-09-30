/**
 * Server-calculated prediction contract. `prediction_runs.payload` is the `PredictionSet` written by the
 * `predictions-worker` Edge Function (supabase/functions/predictions-worker/types.ts in vrc-platform) and decoded by
 * iOS as `VRCPredictionSet`. The browser only READS these — it never computes or writes odds.
 */

export const PREDICTION_MODEL_VERSION = 'VRC-Odds-v3-hybrid'
export const RACE_CATEGORY = 'race'
export const CHAMPIONSHIP_CATEGORY = 'championship'

export type PredictionMarketKey =
  | 'pole'
  | 'fastest_lap'
  | 'race_win'
  | 'podium'
  | 'championship'
  | 'class_championship'
  | 'region_championship'

export type PredictionPhase = 'pre_qualifying' | 'post_qualifying' | 'post_race' | 'championship'
export type PredictionConfidence = 'low' | 'medium' | 'high'

export interface PredictionEntry {
  driver_id: string
  driver_name: string
  driver_number: string
  /** 0…1 */
  probability: number
  rank: number
  confidence: PredictionConfidence
  data_quality: number
  reasons: string[]
  key_stat: string
}

export interface PredictionMarketResult {
  market: PredictionMarketKey
  group_id: string | null
  group_name: string | null
  entries: PredictionEntry[]
  confidence: PredictionConfidence
  data_quality: number
  basis_summary: string
  inputs_used: string[]
  inputs_missing: string[]
}

export interface ForecastContender {
  driver_id: string
  name: string
  number: string
  current_points: number
  current_position: number
  projected_points: number
  projected_position: number
  gap_to_leader: number
  max_reachable: number
  can_still_win: boolean
}

export interface ChampionshipForecast {
  rounds_scored: number
  total_rounds: number
  remaining_rounds: number
  max_points_per_round: number
  leader_id: string | null
  leader_name: string | null
  clinched: boolean
  leader_magic_number: number
  still_alive_count: number
  projected: ForecastContender[]
  contenders: ForecastContender[]
  narrative: string
}

export interface PredictionSet {
  model_version: string
  phase: PredictionPhase
  championship_id: string
  season_id: string
  event_id: string | null
  generated_at: string
  markets: PredictionMarketResult[]
  inputs_summary: string
  official_round_count: number
  remaining_round_count: number
  forecast: ChampionshipForecast | null
}

export interface StoredPredictionRun {
  id: string
  league_id: string
  championship_id: string | null
  season_id: string | null
  event_id: string | null
  category: string
  model_version: string
  source_signature: string
  official_race_count: number
  /** Null when the stored payload was written by an incompatible model version. */
  payload: PredictionSet | null
  generated_at: string
}

export interface StoredPredictionEvaluation {
  id: string
  prediction_run_id: string | null
  event_id: string | null
  category: string
  score: number
  hit_count: number
  sample_count: number
  summary: string
  predicted_driver_ids: string[]
  actual_driver_ids: string[]
  evaluated_at: string
}

export type PredictionOutcome = 'hit' | 'miss' | 'met_odds' | 'beat_odds'

export interface PredictionMarketReview {
  market: PredictionMarketKey
  predictedDriverId: string
  predictedDriverName: string
  actualDriverNames: string[]
  outcome: PredictionOutcome
  summary: string
  hitCount: number
  sampleCount: number
}

export interface PredictionEventReview {
  eventId: string
  eventTitle: string
  phase: PredictionPhase
  generatedAt: string
  reviews: PredictionMarketReview[]
}

export const MARKET_LABEL: Record<PredictionMarketKey, string> = {
  pole: 'Pole Position',
  fastest_lap: 'Fastest Lap',
  race_win: 'Race Winner',
  podium: 'Podium Finish',
  championship: 'Championship',
  class_championship: 'Class Championship',
  region_championship: 'Region Championship',
}

export const PHASE_LABEL: Record<PredictionPhase, string> = {
  pre_qualifying: 'Pre-Qualifying',
  post_qualifying: 'Post-Qualifying',
  post_race: 'Post-Race',
  championship: 'Championship',
}

export const CONFIDENCE_LABEL: Record<PredictionConfidence, string> = {
  low: 'Low data',
  medium: 'Medium data',
  high: 'High data',
}

export const isRaceMarket = (market: PredictionMarketKey): boolean =>
  market === 'pole' || market === 'fastest_lap' || market === 'race_win' || market === 'podium'
