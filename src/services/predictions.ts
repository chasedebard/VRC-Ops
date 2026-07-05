import { supabase } from '@/supabase/client'
import type { PredictionRunRow } from '@/types/database'

export interface SavePredictionRunArgs {
  leagueId: string
  championshipId: string | null
  seasonId: string | null
  eventId: string | null
  category: string
  modelVersion: string
  sourceSignature: string
  sourceDataCutoff: string | null
  officialRaceCount: number
  inputSummary: string
  payload: Record<string, unknown>
}

/** Staff-only (canOperateRaceControl) — persists a run for cross-session/device caching. */
export async function savePredictionRun(args: SavePredictionRunArgs): Promise<string> {
  const { data, error } = await supabase.rpc('vrc_save_prediction_run', {
    p_league: args.leagueId,
    p_championship: args.championshipId,
    p_season: args.seasonId,
    p_event: args.eventId,
    p_category: args.category,
    p_model_version: args.modelVersion,
    p_source_signature: args.sourceSignature,
    p_source_data_cutoff: args.sourceDataCutoff,
    p_official_race_count: args.officialRaceCount,
    p_input_summary: args.inputSummary,
    p_payload: JSON.stringify(args.payload),
  })
  if (error) throw error
  return data as string
}

export async function getLatestPredictionRun(
  eventId: string,
  category: string,
): Promise<PredictionRunRow | null> {
  const { data, error } = await supabase
    .from('prediction_runs')
    .select('*')
    .eq('event_id', eventId)
    .eq('category', category)
    .order('generated_at', { ascending: false })
    .limit(1)
    .returns<PredictionRunRow[]>()
    .maybeSingle()
  if (error) throw error
  return data
}
