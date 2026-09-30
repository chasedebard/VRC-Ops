import { getResultMmrImpact } from '@/services/mmr'
import type { ResultMmrImpact } from '@/types/mmr'

/**
 * Best-effort: a Shadow-state response, a non-member call or any error just yields null and the result rows are unchanged.
 * The server returns finalized deltas only after its authoritative calculation ran — never a pre-lock estimate.
 */
export async function getLeagueMmrImpactSafe(resultSetId: string): Promise<ResultMmrImpact | null> {
  try {
    const impact = await getResultMmrImpact(resultSetId)
    return impact.calculation_state === 'coming_soon' ? null : impact
  } catch {
    return null
  }
}
