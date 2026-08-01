import { supabase } from '@/supabase/client'
import { getSeasonEvents } from '@/services/events'
import { getRaceResults, getResultSet } from '@/services/results'
import { buildSeasonScoringRule, pointsForResult } from '@/utils/scoring'
import type { RaceResultRow, SeasonRow } from '@/types/database'

export interface EventFinalizedResults {
  eventId: string
  raceRows: RaceResultRow[]
}

/**
 * Every event in the season whose race results are official + finalized, with their raw,
 * already-persisted `race_results` rows — the only inputs a scoring recompute is allowed to
 * derive from (never a previously-scored `scoring_outputs` total). Pole/fastest-lap eligibility
 * lives on each row's `earned_pole`/`fastest_lap` flags, which are server-owned and independent
 * of the season's bonus configuration, so no qualifying re-derivation is needed here — only the
 * point *values* change when bonus settings change.
 */
export async function loadSeasonRawResultsForRecompute(seasonId: string): Promise<EventFinalizedResults[]> {
  const events = await getSeasonEvents(seasonId)
  const results = await Promise.all(
    events.map(async (event): Promise<EventFinalizedResults | null> => {
      const resultSet = await getResultSet(event.id, 'race')
      if (!resultSet || !resultSet.official || resultSet.state !== 'finalized') return null
      const raceRows = await getRaceResults(resultSet.id)
      if (raceRows.length === 0) return null
      return { eventId: event.id, raceRows }
    }),
  )
  return results.filter((r): r is EventFinalizedResults => r !== null)
}

export interface SeasonScoringReplacement {
  event_id: string
  driver_id: string
  earned_points: number
  total_points: number
}

/**
 * Full re-derivation, never a delta: reapplies the season's *current* scoring rule
 * (`buildSeasonScoringRule`) to every already-persisted race result row. Calling this twice with
 * the same raw inputs always produces the same replacement set — that idempotency is what makes
 * repeated saves, retries, and page reloads safe against double-counting.
 */
export function buildRecomputeOutputs(
  season: SeasonRow,
  eventResults: EventFinalizedResults[],
): SeasonScoringReplacement[] {
  const rule = buildSeasonScoringRule(season)
  const outputs: SeasonScoringReplacement[] = []
  for (const { eventId, raceRows } of eventResults) {
    for (const row of raceRows) {
      const points = pointsForResult(row, rule)
      outputs.push({ event_id: eventId, driver_id: row.driver_id, earned_points: points, total_points: points })
    }
  }
  return outputs
}

export type RecomputeErrorCode = 'not_authorized' | 'season_not_found' | 'not_authenticated' | 'network' | 'unknown'

export class SeasonRecomputeError extends Error {
  code: RecomputeErrorCode
  constructor(code: RecomputeErrorCode, message: string) {
    super(message)
    this.code = code
    this.name = 'SeasonRecomputeError'
  }
}

/** Friendly error mapping for the same Postgres exception codes the RPC raises for every client
 *  (mirrors the equivalent native-app error mapping) instead of surfacing a raw Postgres string. */
function classifyRecomputeError(err: unknown): SeasonRecomputeError {
  const message = err instanceof Error ? err.message : String(err)
  if (/ACTION_REQUIRES_MANAGER|NOT_AUTHORIZED/.test(message)) {
    return new SeasonRecomputeError(
      'not_authorized',
      'Only league owners and admins can recalculate season scoring.',
    )
  }
  if (/SEASON_NOT_FOUND/.test(message)) {
    return new SeasonRecomputeError('season_not_found', 'This season is no longer available. Refresh and try again.')
  }
  if (/NOT_AUTHENTICATED/.test(message)) {
    return new SeasonRecomputeError('not_authenticated', "You're signed out. Sign in and try again.")
  }
  if (/network|fetch|timeout/i.test(message)) {
    return new SeasonRecomputeError(
      'network',
      'Could not reach the server to recalculate points. Check your connection and try again.',
    )
  }
  return new SeasonRecomputeError(
    'unknown',
    'The bonus settings were saved, but existing results could not be recalculated. Try again.',
  )
}

const CURRENT_SCORING_VERSION = 1

/**
 * Calls the shared `vrc_recompute_season_scoring` RPC (owner/admin only server-side via
 * `vrc_can_manage_league`) with a complete replacement set for `scoring_outputs.earned_points` /
 * `total_points` and `driver_history.points`. It never modifies `result_sets`, qualifying, or
 * race results, and performs no scoring math itself — the client always supplies the full,
 * freshly-derived values.
 */
export async function recomputeSeasonScoring(
  seasonId: string,
  outputs: SeasonScoringReplacement[],
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('vrc_recompute_season_scoring', {
    p_season_id: seasonId,
    p_outputs: outputs,
    p_scoring_version: CURRENT_SCORING_VERSION,
    p_reason: reason,
  })
  if (error) throw classifyRecomputeError(error)
}

export interface SeasonScoringRecomputeResult {
  recomputed: boolean
  eventCount: number
  outputCount: number
}

/**
 * Orchestrates a full season scoring recompute: loads raw finalized race results, re-derives
 * every output from the season's current bonus configuration, and replaces them via the shared
 * RPC. Skips the RPC entirely (no-op) when the season has no finalized race results yet, per the
 * spec's "don't call the recompute RPC unnecessarily" requirement.
 */
export async function runSeasonScoringRecompute(
  season: SeasonRow,
  reason: string,
): Promise<SeasonScoringRecomputeResult> {
  const eventResults = await loadSeasonRawResultsForRecompute(season.id)
  if (eventResults.length === 0) {
    return { recomputed: false, eventCount: 0, outputCount: 0 }
  }
  const outputs = buildRecomputeOutputs(season, eventResults)
  await recomputeSeasonScoring(season.id, outputs, reason)
  return { recomputed: true, eventCount: eventResults.length, outputCount: outputs.length }
}
