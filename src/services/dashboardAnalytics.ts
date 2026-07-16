import { DEFAULT_SCORING_RULE } from '@/utils/scoring'
import { seriesColor } from '@/utils/colors'
import type { TrendSeries } from '@/components/charts/MultiSeriesTrendChart'
import type { DriverRow, EventRow, ScoringOutputRow, SeasonRow } from '@/types/database'

/**
 * Shared pure computation helpers originally built for the legacy
 * DashboardPage. Both the legacy page and the customizable dashboard's tiles
 * (Points Trend, Championship Position Summary, Prediction Analysis) import
 * from here so the two never duplicate this logic.
 */

export const MAX_POINTS_PER_ROUND =
  DEFAULT_SCORING_RULE.positionPoints[0] + DEFAULT_SCORING_RULE.poleBonus + DEFAULT_SCORING_RULE.fastestLapBonus

export function readConfiguredNumber(config: Record<string, unknown> | null, keys: string[]): number | null {
  if (!config) return null
  for (const key of keys) {
    const value = config[key]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
    if (typeof value === 'string') {
      const parsed = Number(value)
      if (Number.isFinite(parsed) && parsed > 0) return parsed
    }
  }
  return null
}

export function readConfiguredRoundCount(config: Record<string, unknown> | null): number | null {
  const keys = ['totalRounds', 'total_rounds', 'scheduledRounds', 'scheduled_rounds', 'raceCount', 'race_count', 'rounds']
  const value = readConfiguredNumber(config, keys)
  return value == null ? null : Math.round(value)
}

export function resolveMaxPointsPerRound(config: Record<string, unknown> | null, scoringOutputs: ScoringOutputRow[]): number {
  const configured = readConfiguredNumber(config, [
    'maxPointsPerRound',
    'max_points_per_round',
    'maxRacePoints',
    'max_race_points',
    'pointsPerRound',
    'points_per_round',
  ])
  const observed = scoringOutputs.reduce((max, output) => Math.max(max, output.total_points), 0)
  return Math.max(MAX_POINTS_PER_ROUND, configured ?? 0, observed)
}

export function resolveForecastTotalRounds(
  season: SeasonRow,
  events: EventRow[],
  completedRaceCount: number,
  configured: number | null,
): number {
  const maxScheduledRound = events.reduce((max, event) => Math.max(max, event.round), 0)
  if (configured != null) return Math.max(configured, maxScheduledRound, events.length, completedRaceCount)
  if (season.status === 'completed') return Math.max(maxScheduledRound, events.length, completedRaceCount)
  return Math.max(maxScheduledRound, events.length, completedRaceCount + 1)
}

export function hasReliableForecastHorizon(
  season: SeasonRow,
  events: EventRow[],
  completedRaceCount: number,
  configuredRoundCount: number | null,
): boolean {
  if (season.status === 'completed' || configuredRoundCount != null) return true
  return events.some((event) => event.round > completedRaceCount)
}

export function latestScoringOutputs(outputs: ScoringOutputRow[]): ScoringOutputRow[] {
  const latestByDriverEvent = new Map<string, ScoringOutputRow>()

  for (const output of outputs) {
    const key = `${output.event_id}:${output.driver_id}`
    const current = latestByDriverEvent.get(key)
    if (!current || scoringOutputTimestamp(output) > scoringOutputTimestamp(current)) {
      latestByDriverEvent.set(key, output)
    }
  }

  return Array.from(latestByDriverEvent.values())
}

export function scoringOutputTimestamp(output: ScoringOutputRow): number {
  const parsed = Date.parse(output.created_at)
  return Number.isFinite(parsed) ? parsed : 0
}

export function buildCumulativePointsSeries(
  scoringOutputs: ScoringOutputRow[],
  roundByEvent: Map<string, number>,
  preferredDriverIds: string[],
  drivers: DriverRow[],
): { xLabels: string[]; series: TrendSeries[] } {
  const outputs = latestScoringOutputs(scoringOutputs)
  const eventsById = new Map<string, { eventId: string; round: number; rows: ScoringOutputRow[] }>()

  for (const row of outputs) {
    const round = roundByEvent.get(row.event_id)
    if (round == null) continue

    const event = eventsById.get(row.event_id) ?? { eventId: row.event_id, round, rows: [] }
    event.rows.push(row)
    eventsById.set(row.event_id, event)
  }

  const orderedEvents = Array.from(eventsById.values()).sort(
    (a, b) => a.round - b.round || a.eventId.localeCompare(b.eventId),
  )
  const fallbackDriverIds = Array.from(
    outputs.reduce((totals, row) => {
      totals.set(row.driver_id, (totals.get(row.driver_id) ?? 0) + row.total_points)
      return totals
    }, new Map<string, number>()),
  )
    .sort((a, b) => b[1] - a[1])
    .map(([driverId]) => driverId)
  const driverIds = preferredDriverIds.length > 0 ? preferredDriverIds : fallbackDriverIds
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]))

  return {
    xLabels: orderedEvents.map((event) => `R${event.round}`),
    series: driverIds.map((driverId, index) => {
      let cumulativePoints = 0
      return {
        id: driverId,
        label: driverById.get(driverId)?.display_name ?? 'Driver',
        color: seriesColor(index),
        values: orderedEvents.map((event) => {
          cumulativePoints += event.rows
            .filter((row) => row.driver_id === driverId)
            .reduce((sum, row) => sum + row.total_points, 0)
          return cumulativePoints
        }),
      }
    }),
  }
}
