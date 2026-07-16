import type { DriverHistoryEntry } from '@/services/driverProfile'

export interface PersonalBests {
  bestQualifying: number | null
  bestFinish: number | null
  mostPointsInRace: number | null
  longestPodiumStreak: number
}

/** Pure roll-up over a driver's history (career or season slice) — no
 *  network calls, so it composes with whichever `getDriverHistory` /
 *  `getSeasonDriverHistory` call the caller already made for other tiles. */
export function computePersonalBests(history: DriverHistoryEntry[]): PersonalBests {
  const races = [...history]
    .filter((r) => r.result_kind === 'race')
    .sort((a, b) => (a.events?.round ?? 0) - (b.events?.round ?? 0))

  const qualifyingPositions = history
    .map((r) => r.qualifying_position)
    .filter((p): p is number => p != null && p > 0)
  const finishes = races
    .filter((r) => r.status === 'fin')
    .map((r) => r.finish_position)
    .filter((p): p is number => p != null && p > 0)
  const pointsPerRace = races.map((r) => r.points ?? 0)

  let longestStreak = 0
  let currentStreak = 0
  for (const race of races) {
    const isPodium = race.status === 'fin' && race.finish_position != null && race.finish_position <= 3
    currentStreak = isPodium ? currentStreak + 1 : 0
    longestStreak = Math.max(longestStreak, currentStreak)
  }

  return {
    bestQualifying: qualifyingPositions.length > 0 ? Math.min(...qualifyingPositions) : null,
    bestFinish: finishes.length > 0 ? Math.min(...finishes) : null,
    mostPointsInRace: pointsPerRace.length > 0 ? Math.max(...pointsPerRace) : null,
    longestPodiumStreak: longestStreak,
  }
}
