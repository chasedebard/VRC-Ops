import type { DriverHistoryEntry } from '@/services/driverProfile'
import type { DriverRow, StandingsSnapshotRowRow } from '@/types/database'

export interface DriverComparisonStats {
  driverId: string
  displayName: string
  driverNumber: number | null
  classLabel: string | null
  regionLabel: string | null
  championshipPosition: number | null
  points: number | null
  starts: number | null
  wins: number | null
  podiums: number | null
  poles: number | null
  fastestLaps: number | null
  averageFinish: number | null
  bestFinish: number | null
  winRate: number | null
  podiumRate: number | null
  poleRate: number | null
  averageQualifyingPosition: number | null
  fastestLapMs: number | null
  recentAverageFinish: number | null
  recentForm: string | null
  hasSeasonData: boolean
}

interface BuildDriverComparisonStatsArgs {
  drivers: DriverRow[]
  history: DriverHistoryEntry[]
  standingsRows: StandingsSnapshotRowRow[]
  classLabelById?: Map<string, string>
  regionLabelById?: Map<string, string>
}

export function buildDriverComparisonStats({
  drivers,
  history,
  standingsRows,
  classLabelById = new Map(),
  regionLabelById = new Map(),
}: BuildDriverComparisonStatsArgs): DriverComparisonStats[] {
  const standingsByDriver = new Map(
    standingsRows.filter((row) => row.driver_id).map((row) => [row.driver_id as string, row]),
  )
  const raceRowsByDriver = groupRaceHistoryByDriver(latestRaceHistoryRows(history))

  return drivers.map((driver) => {
    const standings = standingsByDriver.get(driver.id) ?? null
    const races = raceRowsByDriver.get(driver.id) ?? []
    const hasSeasonData = Boolean(standings || races.length > 0)
    const finishes = races
      .map((race) => race.finish_position)
      .filter((position): position is number => position != null && position > 0)
    const qualifyingPositions = races
      .map((race) => race.qualifying_position)
      .filter((position): position is number => position != null && position > 0)
    const fastestLapTimes = races
      .map((race) => race.best_lap_ms)
      .filter((lapTime): lapTime is number => lapTime != null && lapTime > 0)
    const starts = standings?.starts ?? (hasSeasonData ? races.filter((race) => race.status !== 'dns').length : null)
    const wins = standings?.wins ?? (hasSeasonData ? races.filter((race) => race.finish_position === 1 && race.status === 'fin').length : null)
    const podiums =
      standings?.podiums ??
      (hasSeasonData ? races.filter((race) => (race.finish_position ?? Number.POSITIVE_INFINITY) <= 3 && race.status === 'fin').length : null)
    const poles = standings?.poles ?? (hasSeasonData ? races.filter((race) => race.earned_pole).length : null)
    const fastestLaps = standings?.fastest_laps ?? (hasSeasonData ? races.filter((race) => race.fastest_lap).length : null)
    const points = standings?.points ?? (hasSeasonData ? sumNullable(races.map((race) => race.points)) : null)
    const recentRaces = [...races]
      .sort((a, b) => (b.events?.round ?? 0) - (a.events?.round ?? 0))
      .slice(0, 5)
    const recentFinishes = recentRaces
      .map((race) => race.finish_position)
      .filter((position): position is number => position != null && position > 0)
    const latestClassId = firstNonNull([driver.class_id, ...recentRaces.map((race) => race.class_id)])
    const latestRegionId = firstNonNull([driver.region_id, ...recentRaces.map((race) => race.region_id)])

    return {
      driverId: driver.id,
      displayName: driver.display_name,
      driverNumber: driver.driver_number,
      classLabel: latestClassId ? classLabelById.get(latestClassId) ?? null : null,
      regionLabel: latestRegionId ? regionLabelById.get(latestRegionId) ?? null : null,
      championshipPosition: standings?.position ?? null,
      points,
      starts,
      wins,
      podiums,
      poles,
      fastestLaps,
      averageFinish: standings?.average_finish ?? average(finishes),
      bestFinish: finishes.length > 0 ? Math.min(...finishes) : null,
      winRate: calculateRate(wins, starts),
      podiumRate: calculateRate(podiums, starts),
      poleRate: calculateRate(poles, starts),
      averageQualifyingPosition: average(qualifyingPositions),
      fastestLapMs: fastestLapTimes.length > 0 ? Math.min(...fastestLapTimes) : null,
      recentAverageFinish: average(recentFinishes),
      recentForm: recentRaces.length > 0 ? recentRaces.map(formatRecentResult).join(' / ') : null,
      hasSeasonData,
    }
  })
}

function latestRaceHistoryRows(history: DriverHistoryEntry[]): DriverHistoryEntry[] {
  const latestByDriverEvent = new Map<string, DriverHistoryEntry>()

  for (const row of history) {
    if (row.result_kind !== 'race') continue
    const key = `${row.driver_id}:${row.event_id}`
    const current = latestByDriverEvent.get(key)
    if (!current || compareHistoryFreshness(row, current) > 0) {
      latestByDriverEvent.set(key, row)
    }
  }

  return Array.from(latestByDriverEvent.values())
}

function compareHistoryFreshness(a: DriverHistoryEntry, b: DriverHistoryEntry): number {
  const revisionDelta = (a.result_revision ?? 0) - (b.result_revision ?? 0)
  if (revisionDelta !== 0) return revisionDelta
  return historyTimestamp(a) - historyTimestamp(b)
}

function historyTimestamp(row: DriverHistoryEntry): number {
  const parsed = Date.parse(row.saved_at ?? row.created_at)
  return Number.isFinite(parsed) ? parsed : 0
}

function groupRaceHistoryByDriver(history: DriverHistoryEntry[]): Map<string, DriverHistoryEntry[]> {
  return history.reduce((grouped, row) => {
    const rows = grouped.get(row.driver_id) ?? []
    rows.push(row)
    grouped.set(row.driver_id, rows)
    return grouped
  }, new Map<string, DriverHistoryEntry[]>())
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sumNullable(values: (number | null)[]): number | null {
  const numeric = values.filter((value): value is number => value != null)
  if (numeric.length === 0) return null
  return numeric.reduce((sum, value) => sum + value, 0)
}

function calculateRate(count: number | null, starts: number | null): number | null {
  if (count == null || starts == null || starts <= 0) return null
  return count / starts
}

function firstNonNull(values: (string | null)[]): string | null {
  return values.find((value): value is string => Boolean(value)) ?? null
}

function formatRecentResult(row: DriverHistoryEntry): string {
  if (row.status === 'fin' && row.finish_position != null && row.finish_position > 0) return `P${row.finish_position}`
  if (row.status) return row.status.toUpperCase()
  if (row.finish_position != null && row.finish_position > 0) return `P${row.finish_position}`
  return 'No result'
}
