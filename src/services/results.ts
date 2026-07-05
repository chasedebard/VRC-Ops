import { supabase } from '@/supabase/client'
import type {
  PenaltyRow,
  QualifyingResultRow,
  RaceResultRow,
  ResultAuditRow,
  ResultKind,
  ResultSetRow,
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
  rows: Record<string, unknown>[]
  scoringVersion: number
  outputs: Record<string, unknown>[]
  snapshots: Record<string, unknown>[]
  reason: string | null
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

export async function resultTransition(
  resultSetId: string,
  expectedRevision: number,
  action: 'submit' | 'start_review' | 'return' | 'approve' | 'lock',
  reason: string | null,
): Promise<ResultSetRow> {
  const { data, error } = await supabase.rpc('vrc_result_transition', {
    p_result_set: resultSetId,
    p_expected_revision: expectedRevision,
    p_action: action,
    p_reason: reason,
  })
  if (error) throw error
  return data as ResultSetRow
}

/** Re-syncs race pole from qualifying P1; pass resetManual=true to clear a manual override. */
export async function syncPoleFromQualifying(eventId: string, resetManual = false): Promise<void> {
  const { error } = await supabase.rpc('vrc_sync_race_pole_from_qualifying', {
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
