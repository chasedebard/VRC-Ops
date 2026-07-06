import { supabase } from '@/supabase/client'
import type {
  ScoringOutputRow,
  StandingsSnapshotRow,
  StandingsSnapshotRowRow,
  StandingsType,
} from '@/types/database'

/** All persisted scoring_outputs for a season — used to recompute cumulative
 *  standings client-side when a new event's results are saved (see
 *  src/utils/scoring.ts + pages/raceWeekend/ResultsPage.tsx). */
export async function getSeasonScoringOutputs(seasonId: string): Promise<ScoringOutputRow[]> {
  const { data, error } = await supabase
    .from('scoring_outputs')
    .select('*')
    .eq('season_id', seasonId)
    .returns<ScoringOutputRow[]>()
  if (error) throw error
  return data ?? []
}

/**
 * Standings are pre-computed and persisted by vrc_save_results/vrc_finalize_event
 * (see src/utils/scoring.ts for the math used when *writing* new results) — the
 * read path here only needs the latest snapshot per (season, type, groupKey).
 */
export async function getLatestStandings(
  seasonId: string,
  standingsType: StandingsType,
  groupKey: string | null = null,
): Promise<{ snapshot: StandingsSnapshotRow; rows: StandingsSnapshotRowRow[] } | null> {
  let query = supabase
    .from('standings_snapshots')
    .select('*')
    .eq('season_id', seasonId)
    .eq('standings_type', standingsType)
    .order('calculated_at', { ascending: false })
    .limit(1)

  query = groupKey ? query.eq('group_key', groupKey) : query.is('group_key', null)

  const { data: snapshots, error } = await query.returns<StandingsSnapshotRow[]>()
  if (error) throw error
  const snapshot = snapshots?.[0]
  if (!snapshot) return null

  const { data: rows, error: rowsError } = await supabase
    .from('standings_snapshot_rows')
    .select('*')
    .eq('snapshot_id', snapshot.id)
    .order('position')
    .returns<StandingsSnapshotRowRow[]>()
  if (rowsError) throw rowsError

  return { snapshot, rows: rows ?? [] }
}

/** The snapshot immediately before the latest one — used to compute per-driver
 *  position movement (StandingsMovementIndicator) since the previous round. */
export async function getPreviousStandingsRows(
  seasonId: string,
  standingsType: StandingsType,
  groupKey: string | null = null,
): Promise<StandingsSnapshotRowRow[]> {
  let query = supabase
    .from('standings_snapshots')
    .select('*')
    .eq('season_id', seasonId)
    .eq('standings_type', standingsType)
    .order('calculated_at', { ascending: false })
    .range(1, 1)

  query = groupKey ? query.eq('group_key', groupKey) : query.is('group_key', null)

  const { data: snapshots, error } = await query.returns<StandingsSnapshotRow[]>()
  if (error) throw error
  const snapshot = snapshots?.[0]
  if (!snapshot) return []

  const { data: rows, error: rowsError } = await supabase
    .from('standings_snapshot_rows')
    .select('*')
    .eq('snapshot_id', snapshot.id)
    .returns<StandingsSnapshotRowRow[]>()
  if (rowsError) throw rowsError
  return rows ?? []
}

/**
 * Every "overall" standings snapshot across the season, oldest first — used
 * to chart a points-progression trend for the dashboard (richer than the
 * native app's single most-recent snapshot view, since the web has the room
 * to show it). One snapshot is written per event save, so this doubles as a
 * round-by-round history without needing the native's separate
 * championship_prediction_snapshots table.
 */
export async function getStandingsHistory(
  seasonId: string,
  standingsType: StandingsType = 'overall',
): Promise<{ snapshot: StandingsSnapshotRow; rows: StandingsSnapshotRowRow[] }[]> {
  const { data: snapshots, error } = await supabase
    .from('standings_snapshots')
    .select('*')
    .eq('season_id', seasonId)
    .eq('standings_type', standingsType)
    .is('group_key', null)
    .order('calculated_at', { ascending: true })
    .returns<StandingsSnapshotRow[]>()
  if (error) throw error
  if (!snapshots || snapshots.length === 0) return []

  const { data: rows, error: rowsError } = await supabase
    .from('standings_snapshot_rows')
    .select('*')
    .in('snapshot_id', snapshots.map((s) => s.id))
    .returns<StandingsSnapshotRowRow[]>()
  if (rowsError) throw rowsError

  const rowsBySnapshot = new Map<string, StandingsSnapshotRowRow[]>()
  for (const row of rows ?? []) {
    const list = rowsBySnapshot.get(row.snapshot_id) ?? []
    list.push(row)
    rowsBySnapshot.set(row.snapshot_id, list)
  }
  return snapshots.map((snapshot) => ({ snapshot, rows: rowsBySnapshot.get(snapshot.id) ?? [] }))
}

export async function getAvailableStandingsGroups(
  seasonId: string,
  standingsType: StandingsType,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('standings_snapshots')
    .select('group_key')
    .eq('season_id', seasonId)
    .eq('standings_type', standingsType)
    .not('group_key', 'is', null)
    .returns<{ group_key: string }[]>()
  if (error) throw error
  return Array.from(new Set((data ?? []).map((r) => r.group_key)))
}
