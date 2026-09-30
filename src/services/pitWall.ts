import { supabase } from '@/supabase/client'
import {
  parseEngineeringState,
  parseProgrammes,
  parseSetupBoard,
  type EngineeringState,
  type PitWallProgrammes,
  type SetupBoard,
} from '@/utils/pitWallModel'

/**
 * Pit Wall V3 — read-only access. Every Pit Wall record is owned by the signed-in user (`pit_wall_owns_weekend`), so each read returns
 * the viewer's OWN weekend data only. There are deliberately no write calls here: weekend creation, garage arrival, run capture,
 * Engineering Call evaluation and package proposals all start from native GT7 telemetry / setup screens on iOS or Android.
 */

export interface PitWallWeekend {
  id: string
  event_id: string | null
  track_id: string
  status: string
  updated_at: string
  v3_active_car_programme_id: string | null
}

export async function getPitWallWeekend(eventId: string): Promise<PitWallWeekend | null> {
  const { data, error } = await supabase
    .from('pit_wall_weekends')
    .select('id, event_id, track_id, status, updated_at, v3_active_car_programme_id')
    .eq('event_id', eventId)
    .not('v3_context_created_at', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .returns<PitWallWeekend[]>()
  if (error) throw error
  return data?.[0] ?? null
}

export async function getWeekendProgrammes(weekendId: string): Promise<PitWallProgrammes> {
  const { data, error } = await supabase.rpc('vrc_pit_wall_v3_weekend_car_programmes', { p_weekend_id: weekendId })
  if (error) throw error
  return parseProgrammes(data)
}

export async function getSetupBoard(weekendId: string, programmeId: string): Promise<SetupBoard> {
  const { data, error } = await supabase.rpc('vrc_pit_wall_v3_setup_board_state', {
    p_weekend_id: weekendId,
    p_car_programme_id: programmeId,
  })
  if (error) throw error
  return parseSetupBoard(data)
}

export async function getEngineeringState(weekendId: string, programmeId: string): Promise<EngineeringState> {
  const { data, error } = await supabase.rpc('vrc_pit_wall_v3_engineering_call_state', {
    p_weekend_id: weekendId,
    p_car_programme_id: programmeId,
  })
  if (error) throw error
  return parseEngineeringState(data)
}

export interface CapturedRunRow {
  id: string
  capture_status: string
  started_at: string | null
  ended_at: string | null
  detected_completed_lap_count: number
  expected_lap_count: number | null
  tyre_compound_key: string | null
  fuel_start_liters: number | null
  fuel_end_liters: number | null
  data_quality_status: string
  data_quality_flags: string[]
  driver_debrief_status: string
}

/** Runs captured on a native device for this weekend (parsed summaries only — no raw telemetry is ever shown). */
export async function getCapturedRuns(weekendId: string): Promise<CapturedRunRow[]> {
  const { data, error } = await supabase
    .from('pit_wall_captured_runs')
    .select(
      'id, capture_status, started_at, ended_at, detected_completed_lap_count, expected_lap_count, tyre_compound_key, fuel_start_liters, fuel_end_liters, data_quality_status, data_quality_flags, driver_debrief_status',
    )
    .eq('weekend_id', weekendId)
    .order('started_at', { ascending: false, nullsFirst: false })
    .limit(50)
    .returns<CapturedRunRow[]>()
  if (error) throw error
  return data ?? []
}
