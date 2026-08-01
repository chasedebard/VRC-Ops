import { SEASON_BONUS_POINTS_DEFAULT } from '@/utils/scoring'
import type { SeasonRow } from '@/types/database'

export interface BonusFormState {
  poleBonusEnabled: boolean
  poleBonusPoints: number
  fastestLapBonusEnabled: boolean
  fastestLapBonusPoints: number
}

/** Seeds the Bonus Points form from a season row, defaulting an unset/invalid point value to 1
 *  (never resetting an existing valid saved value). */
export function bonusFormFromSeason(season: SeasonRow): BonusFormState {
  return {
    poleBonusEnabled: season.pole_bonus_enabled,
    poleBonusPoints: season.pole_bonus_points || SEASON_BONUS_POINTS_DEFAULT,
    fastestLapBonusEnabled: season.fastest_lap_bonus_enabled,
    fastestLapBonusPoints: season.fastest_lap_bonus_points || SEASON_BONUS_POINTS_DEFAULT,
  }
}
