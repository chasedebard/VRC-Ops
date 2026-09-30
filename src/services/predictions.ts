import { supabase } from '@/supabase/client'
import {
  PREDICTION_MODEL_VERSION,
  type PredictionSet,
  type StoredPredictionEvaluation,
  type StoredPredictionRun,
} from '@/types/predictions'

/**
 * Predictions are computed SERVER-SIDE. The `predictions-worker` Edge Function drains `prediction_jobs` on a
 * pg_cron interval and writes `prediction_runs` / `prediction_evaluations` with the service role; the browser only
 * reads them (RLS: league members, and the caller must have accepted the current AI consent) and may ask the worker
 * to recompute through `vrc_request_prediction_job` (owner/admin, AI consent required, reason fixed server-side).
 * The previous web-side calculation and `vrc_save_prediction_run` call were removed for that reason.
 */

interface RawRun {
  id: string
  league_id: string
  championship_id: string | null
  season_id: string | null
  event_id: string | null
  category: string
  model_version: string
  source_signature: string
  official_race_count: number | null
  payload: unknown
  generated_at: string
}

/** Defensive decode: payloads written by other/legacy model versions must never crash the screen. */
export function parsePredictionSet(payload: unknown): PredictionSet | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Partial<PredictionSet>
  if (typeof p.model_version !== 'string' || typeof p.phase !== 'string' || !Array.isArray(p.markets)) return null
  const markets = p.markets.filter(
    (m) => m && typeof m.market === 'string' && Array.isArray(m.entries),
  )
  return {
    model_version: p.model_version,
    phase: p.phase,
    championship_id: p.championship_id ?? '',
    season_id: p.season_id ?? '',
    event_id: p.event_id ?? null,
    generated_at: p.generated_at ?? '',
    markets,
    inputs_summary: p.inputs_summary ?? '',
    official_round_count: p.official_round_count ?? 0,
    remaining_round_count: p.remaining_round_count ?? 0,
    forecast: p.forecast ?? null,
  }
}

/** Recent stored runs for a season from the current model, newest first (mirrors `latestRuns`). */
export async function getLatestPredictionRuns(seasonId: string, limit = 60): Promise<StoredPredictionRun[]> {
  const { data, error } = await supabase
    .from('prediction_runs')
    .select(
      'id, league_id, championship_id, season_id, event_id, category, model_version, source_signature, official_race_count, payload, generated_at',
    )
    .eq('season_id', seasonId)
    .eq('model_version', PREDICTION_MODEL_VERSION)
    .order('generated_at', { ascending: false })
    .limit(limit)
    .returns<RawRun[]>()
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    league_id: row.league_id,
    championship_id: row.championship_id,
    season_id: row.season_id,
    event_id: row.event_id,
    category: row.category,
    model_version: row.model_version,
    source_signature: row.source_signature,
    official_race_count: row.official_race_count ?? 0,
    payload: parsePredictionSet(row.payload),
    generated_at: row.generated_at,
  }))
}

export async function getPredictionEvaluations(seasonId: string, limit = 120): Promise<StoredPredictionEvaluation[]> {
  const { data, error } = await supabase
    .from('prediction_evaluations')
    .select(
      'id, prediction_run_id, event_id, category, score, hit_count, sample_count, summary, predicted_driver_ids, actual_driver_ids, evaluated_at',
    )
    .eq('season_id', seasonId)
    .order('evaluated_at', { ascending: false })
    .limit(limit)
    .returns<StoredPredictionEvaluation[]>()
  if (error) throw error
  return data ?? []
}

/**
 * Owner/admin manual override: queues a fresh server-side computation instead of waiting for the next trigger/cron
 * cycle. The database dedupes pending/running jobs and re-checks authorization and AI consent.
 */
export async function requestPredictionRecompute(
  championshipId: string,
  seasonId: string,
  eventId: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('vrc_request_prediction_job', {
    p_championship_id: championshipId,
    p_season_id: seasonId,
    p_event_id: eventId,
    p_reason: 'manual_admin_request',
  })
  if (error) throw error
  return data as string
}

/** Realtime refresh when the worker stores a new run or evaluation for this season (returns an unsubscribe). */
export function subscribeToPredictions(seasonId: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`predictions:${seasonId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'prediction_runs', filter: `season_id=eq.${seasonId}` }, onChange)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'prediction_evaluations', filter: `season_id=eq.${seasonId}` },
      onChange,
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
