import { supabase } from '@/supabase/client'
import type { SeriesAwardClaim } from '@/utils/standingsEngine'
import type {
  PenaltyRow,
  QualifyingResultRow,
  RaceResultRow,
  ResultAuditRow,
  ResultKind,
  ResultSetRow,
  ScoreAdjustmentRow,
} from '@/types/database'

export async function getResultSet(
  eventId: string,
  kind: ResultKind,
): Promise<ResultSetRow | null> {
  const { data, error } = await supabase
    .from('result_sets')
    .select('*')
    .eq('event_id', eventId)
    .eq('kind', kind)
    .returns<ResultSetRow[]>()
    .maybeSingle()
  if (error) throw error
  return data
}

export async function getQualifyingResults(resultSetId: string): Promise<QualifyingResultRow[]> {
  const { data, error } = await supabase
    .from('qualifying_results')
    .select('*')
    .eq('result_set_id', resultSetId)
    .order('position', { ascending: true, nullsFirst: false })
    .returns<QualifyingResultRow[]>()
  if (error) throw error
  return data ?? []
}

export async function getRaceResults(resultSetId: string): Promise<RaceResultRow[]> {
  const { data, error } = await supabase
    .from('race_results')
    .select('*')
    .eq('result_set_id', resultSetId)
    .order('finish_position', { ascending: true, nullsFirst: false })
    .returns<RaceResultRow[]>()
  if (error) throw error
  return data ?? []
}

export interface SaveResultsArgs {
  eventId: string
  kind: ResultKind
  expectedRevision: number
  rows: (SaveRaceRowPayload | SaveQualifyingRowPayload | Record<string, unknown>)[]
  scoringVersion: number
  outputs: Record<string, unknown>[]
  snapshots: Record<string, unknown>[]
  reason: string | null
}

/** One race-result row as `vrc_save_results` expects it (mirror of iOS `VRCSaveRaceRow`). */
export interface SaveRaceRowPayload {
  driver_id: string
  finish_position: number | null
  start_position: number | null
  laps_completed: number | null
  total_time_ms: number | null
  /** Compatibility mirror of a time gap; null for a laps gap. */
  gap_ms: number | null
  gap_type: 'time' | 'laps' | null
  /** Milliseconds for `time`, whole laps (≥ 1) for `laps`. */
  gap_value: number | null
  best_lap_ms: number | null
  fastest_lap: boolean
  earned_pole: boolean
  pole_manually_overridden: boolean
  status: string
  bonus_points: number
  penalty_points: number
  team_id: string | null
  class_id: string | null
  region_id: string | null
  notes: string | null
}

/** One qualifying row as `vrc_save_results` expects it. */
export interface SaveQualifyingRowPayload {
  driver_id: string
  position: number | null
  best_lap_ms: number | null
  gap_ms: number | null
  status: 'set' | 'dns' | 'dsq'
  grid_adjustment: number
  penalty_positions: number
  earned_pole: boolean
  notes: string | null
}

/**
 * Unified save (vrc_save_results, migration 20260620120001): atomically replaces
 * qualifying_results or race_results for the event, auto-wires pole from
 * qualifying P1 (unless a race row sets pole_manually_overridden), writes
 * scoring_outputs + standings_snapshots for race saves, and marks the result
 * set official/published/locked. Requires canManageMembers-equivalent
 * (league manager) permission server-side.
 */
export async function saveResults(args: SaveResultsArgs): Promise<ResultSetRow> {
  const { data, error } = await supabase.rpc('vrc_save_results', {
    p_event: args.eventId,
    p_kind: args.kind,
    p_expected_revision: args.expectedRevision,
    p_rows: args.rows,
    p_scoring_version: args.scoringVersion,
    p_outputs: args.outputs,
    p_snapshots: args.snapshots,
    p_reason: args.reason,
  })
  if (error) throw error
  return data as ResultSetRow
}

export async function unlockResults(
  resultSetId: string,
  expectedRevision: number,
  reason: string,
): Promise<ResultSetRow> {
  const { data, error } = await supabase.rpc('vrc_unlock_results', {
    p_result_set: resultSetId,
    p_expected_revision: expectedRevision,
    p_reason: reason,
  })
  if (error) throw error
  return data as ResultSetRow
}

/**
 * Re-seeds the race grid (start position, DNS, pole) from finalized qualifying. `vrc_sync_race_grid_from_qualifying`
 * replaced the old `vrc_sync_race_pole_from_qualifying`; pass resetManual=true to clear manual grid/pole overrides.
 */
export async function syncRaceGridFromQualifying(eventId: string, resetManual = false): Promise<void> {
  const { error } = await supabase.rpc('vrc_sync_race_grid_from_qualifying', {
    p_event: eventId,
    p_reset_manual: resetManual,
  })
  if (error) throw error
}

export async function getPenalties(eventId: string): Promise<PenaltyRow[]> {
  const { data, error } = await supabase
    .from('penalties')
    .select('*')
    .eq('event_id', eventId)
    .order('issued_at', { ascending: false })
    .returns<PenaltyRow[]>()
  if (error) throw error
  return data ?? []
}

export async function issuePenalty(
  draft: Pick<PenaltyRow, 'event_id' | 'league_id' | 'driver_id'> & Partial<PenaltyRow>,
): Promise<PenaltyRow> {
  const { data, error } = await supabase
    .from('penalties')
    .insert({ ...draft, issued_at: new Date().toISOString() })
    .select('*')
    .returns<PenaltyRow[]>()
    .single()
  if (error) throw error
  return data
}

export async function getScoreAdjustments(eventId: string): Promise<ScoreAdjustmentRow[]> {
  const { data, error } = await supabase
    .from('score_adjustments')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .returns<ScoreAdjustmentRow[]>()
  if (error) throw error
  return data ?? []
}

/** Manual per-driver point adjustments stay separate from earned points and always carry a recorded reason. */
export async function addScoreAdjustment(draft: {
  event_id: string
  league_id: string
  driver_id: string
  points_delta: number
  reason: string
  acting_user: string
}): Promise<void> {
  const { error } = await supabase.from('score_adjustments').insert(draft)
  if (error) throw error
}

export async function getResultAudit(eventId: string): Promise<ResultAuditRow[]> {
  const { data, error } = await supabase
    .from('result_audit')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .returns<ResultAuditRow[]>()
  if (error) throw error
  return data ?? []
}

// ---- Event class membership, DNS, awards -----------------------------------------------------------

/** Class ids attached to an event. One = single-class (inherited); more than one = multi-class (each row needs a class). */
export async function getEventClassIds(eventId: string): Promise<string[]> {
  const { data, error } = await supabase.from('event_classes').select('class_id').eq('event_id', eventId)
  if (error) throw error
  return (data ?? []).map((r: { class_id: string }) => r.class_id)
}

/** `event_id → class_ids` for many events at once; events without `event_classes` rows are absent from the map. */
export async function getEventClassIdsFor(eventIds: string[]): Promise<Map<string, string[]>> {
  if (eventIds.length === 0) return new Map()
  const { data, error } = await supabase.from('event_classes').select('event_id, class_id').in('event_id', eventIds)
  if (error) throw error
  const map = new Map<string, string[]>()
  for (const row of (data ?? []) as { event_id: string; class_id: string }[]) {
    map.set(row.event_id, [...(map.get(row.event_id) ?? []), row.class_id])
  }
  return map
}

/** Race result sets for just these events. */
export async function getRaceResultSets(eventIds: string[]): Promise<ResultSetRow[]> {
  if (eventIds.length === 0) return []
  const { data, error } = await supabase
    .from('result_sets')
    .select('*')
    .eq('kind', 'race')
    .in('event_id', eventIds)
    .returns<ResultSetRow[]>()
  if (error) throw error
  return data ?? []
}

/** Every result set (qualifying + race) for a set of events — drives the per-round results pills. */
export async function getResultSetsForEvents(eventIds: string[]): Promise<ResultSetRow[]> {
  if (eventIds.length === 0) return []
  const { data, error } = await supabase
    .from('result_sets')
    .select('*')
    .in('event_id', eventIds)
    .returns<ResultSetRow[]>()
  if (error) throw error
  return data ?? []
}

/** Drivers marked Did-Not-Start for an event (Race Prep). Rows with is_dns = false are not returned. */
export async function getEventDnsDriverIds(eventId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('event_driver_dns')
    .select('driver_id')
    .eq('event_id', eventId)
    .eq('is_dns', true)
  if (error) throw error
  return new Set((data ?? []).map((r: { driver_id: string }) => r.driver_id))
}

/** Owner/Admin/Marshal only (enforced by the RPC and a restrictive RLS policy). */
export async function setEventDns(eventId: string, driverId: string, isDns: boolean): Promise<void> {
  const { error } = await supabase.rpc('vrc_set_event_dns', { p_event: eventId, p_driver: driverId, p_dns: isDns })
  if (error) throw error
}

export interface LiveStandingAward {
  id: string
  championship_id: string
  season_id: string
  driver_id: string
  scope: string
  scope_id: string | null
  status: string
  points: number
  clinched_round: number | null
  final_round: number | null
  awarded_at: string
  finalized_at: string | null
}

/** Live (Clinched / Champion) series awards for a season — what the sync reconciles against. */
export async function getLiveStandingAwards(seasonId: string): Promise<LiveStandingAward[]> {
  const { data, error } = await supabase
    .from('standing_awards')
    .select('id, championship_id, season_id, driver_id, scope, scope_id, status, points, clinched_round, final_round, awarded_at, finalized_at')
    .eq('season_id', seasonId)
    .in('status', ['clinched', 'champion'])
    .returns<LiveStandingAward[]>()
  if (error) throw error
  return data ?? []
}

/** One driver's live awards within a championship (Trophy Case source). */
export async function getDriverLiveStandingAwards(championshipId: string, driverId: string): Promise<LiveStandingAward[]> {
  const { data, error } = await supabase
    .from('standing_awards')
    .select('id, championship_id, season_id, driver_id, scope, scope_id, status, points, clinched_round, final_round, awarded_at, finalized_at')
    .eq('championship_id', championshipId)
    .eq('driver_id', driverId)
    .in('status', ['clinched', 'champion'])
    .returns<LiveStandingAward[]>()
  if (error) throw error
  return data ?? []
}

export interface SeriesAwardSyncResult {
  created: number
  finalized: number
  revoked: number
  superseded: number
  unchanged: number
  rejected?: { scope: string; scope_id: string | null; reason: string }[]
}

/**
 * Reconciles the award ledger with the series states the caller computed from the official standings. Owner/Admin only;
 * the server re-verifies against official points and the schedule and is idempotent.
 */
export async function syncSeriesAwards(seasonId: string, claims: SeriesAwardClaim[]): Promise<SeriesAwardSyncResult> {
  const { data, error } = await supabase.rpc('vrc_sync_series_awards', { p_season: seasonId, p_series: claims })
  if (error) throw error
  return data as SeriesAwardSyncResult
}
