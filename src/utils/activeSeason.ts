import { getChampionships, getSeasons } from '@/services/championships'
import type { ChampionshipRow, SeasonRow } from '@/types/database'

/** Finds "the" active season for a league: prefer an active championship with
 *  an is_active season, otherwise fall back to the first championship/season
 *  found. Centralizes this so Dashboard/RaceWeekend/Standings/Predictions agree. */
export async function resolveActiveSeason(
  leagueId: string,
): Promise<{ championship: ChampionshipRow; season: SeasonRow } | null> {
  const championships = await getChampionships(leagueId)
  if (championships.length === 0) return null

  const ordered = [...championships].sort((a, b) => (a.status === 'active' ? -1 : b.status === 'active' ? 1 : 0))

  for (const championship of ordered) {
    const seasons = await getSeasons(championship.id)
    const active = seasons.find((s) => s.is_active) ?? seasons[0]
    if (active) return { championship, season: active }
  }
  return null
}
