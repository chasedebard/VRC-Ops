import {
  classSeries,
  eventScoreFromOutput,
  rankedDriverRows,
  regionSeries,
  seriesFilter,
  OVERALL_SERIES,
  type DriverInfo,
  type EventScore,
  type SeriesKey,
  type StandingsScoringConfig,
} from '@/utils/standingsEngine'
import { didStart, isRaceEntry, statusOf, type HistoryEntry } from '@/utils/driverAnalytics'
import type { EventRow, ScoringOutputRow, SeasonRow } from '@/types/database'

/**
 * Trophy Case — a pure port of iOS `VRCTrophyMilestoneEngine`, `VRCTrophyCatalog`, `VRCTrophyStatsBuilder` and
 * `VRCTrophyAwardEntryBuilder`. Tiers, gemstones and progress are derived ONLY here; title counts come from the same standings engine the
 * Standings screen uses plus the server's `standing_awards` ledger (a title present in both counts once). Artwork is an iOS asset; the web
 * shows the tier, gemstones and progress as accessible text and colour chips.
 */

export type TrophyType = 'champion' | 'subseriesChampion' | 'firstPlace' | 'secondPlace' | 'thirdPlace' | 'podium' | 'fastestLap' | 'polePosition'
export const TROPHY_TYPES: TrophyType[] = ['champion', 'subseriesChampion', 'firstPlace', 'secondPlace', 'thirdPlace', 'podium', 'fastestLap', 'polePosition']

export const TROPHY_GEMSTONES = ['Emerald', 'Sapphire', 'Ruby', 'Amethyst', 'Citrine', 'Aquamarine', 'Fire Opal', 'Pink Tourmaline'] as const
export const GEMSTONE_COLOR: Record<(typeof TROPHY_GEMSTONES)[number], string> = {
  Emerald: '#10b981',
  Sapphire: '#2563eb',
  Ruby: '#dc2626',
  Amethyst: '#9333ea',
  Citrine: '#eab308',
  Aquamarine: '#06b6d4',
  'Fire Opal': '#f97316',
  'Pink Tourmaline': '#ec4899',
}

export const TROPHY_DEFINITIONS: Record<TrophyType, { name: string; countLabel: string }> = {
  champion: { name: 'Champion', countLabel: 'Championships' },
  subseriesChampion: { name: 'Subseries Champion', countLabel: 'Subseries Titles' },
  firstPlace: { name: 'First Place', countLabel: 'Race Wins' },
  secondPlace: { name: 'Second Place', countLabel: '2nd Places' },
  thirdPlace: { name: 'Third Place', countLabel: '3rd Places' },
  podium: { name: 'Podium', countLabel: 'Podiums' },
  fastestLap: { name: 'Fastest Lap', countLabel: 'Fastest Laps' },
  polePosition: { name: 'Pole Position', countLabel: 'Pole Positions' },
}

export type ProgressMetric = 'earnedCount' | 'wins' | 'secondPlaces' | 'thirdPlaces'
export const METRIC_LABEL: Record<ProgressMetric, string> = { earnedCount: 'Total', wins: 'Wins', secondPlaces: '2nd Places', thirdPlaces: '3rd Places' }

export interface ProgressInput {
  earnedCount: number
  wins: number
  secondPlaces: number
  thirdPlaces: number
}

interface Requirement {
  metric: ProgressMetric
  minimum: number
}
type TierDefinition = Requirement[]

export const CHAMPIONSHIP_THRESHOLDS = [1, 3, 6, 10, 25, 50, 75, 125, 200]
export const RACE_THRESHOLDS = [1, 5, 10, 15, 50, 75, 100, 150, 200]
export const RACE_WINS_THRESHOLDS = [1, 5, 10, 15, 25, 50, 75, 100, 150]

const podiumTier = (total: number, wins: number, seconds: number, thirds: number): TierDefinition => [
  { metric: 'earnedCount', minimum: total },
  { metric: 'wins', minimum: wins },
  { metric: 'secondPlaces', minimum: seconds },
  { metric: 'thirdPlaces', minimum: thirds },
]

/** Podium: total podiums plus the required mix of wins, seconds and thirds (Tier 1 is count-only). */
export const PODIUM_TIERS: TierDefinition[] = [
  [{ metric: 'earnedCount', minimum: 1 }],
  podiumTier(10, 1, 1, 1),
  podiumTier(25, 1, 5, 5),
  podiumTier(50, 1, 10, 15),
  podiumTier(100, 2, 10, 20),
  podiumTier(200, 5, 15, 30),
  podiumTier(300, 5, 25, 50),
  podiumTier(500, 20, 50, 100),
  podiumTier(1000, 100, 200, 300),
]

const countOnly = (thresholds: number[]): TierDefinition[] => thresholds.map((minimum) => [{ metric: 'earnedCount', minimum }])

export function tiersFor(type: TrophyType): TierDefinition[] {
  switch (type) {
    case 'podium':
      return PODIUM_TIERS
    case 'champion':
    case 'subseriesChampion':
      return countOnly(CHAMPIONSHIP_THRESHOLDS)
    case 'firstPlace':
      return countOnly(RACE_WINS_THRESHOLDS)
    default:
      return countOnly(RACE_THRESHOLDS)
  }
}

const primaryThreshold = (tier: TierDefinition): number | null => tier.find((r) => r.metric === 'earnedCount')?.minimum ?? null

export interface RequirementProgress {
  metric: ProgressMetric
  currentValue: number
  requiredValue: number
  isSatisfied: boolean
  fractionComplete: number
}

export interface MilestoneState {
  type: TrophyType
  earnedCount: number
  isClaimed: boolean
  /** -1 while locked; 0 is the base tier. */
  currentTierIndex: number
  currentMilestone: number | null
  nextMilestone: number | null
  progressToNextMilestone: number | null
  remainingToNextMilestone: number | null
  nextTierRequirementProgress: RequirementProgress[]
  unlockedGemstones: (typeof TROPHY_GEMSTONES)[number][]
  unlockedStructuralUpgrades: number[]
  isMaximumPrestigeTier: boolean
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function milestoneState(type: TrophyType, input: ProgressInput): MilestoneState {
  const safe: ProgressInput = {
    earnedCount: Math.max(0, input.earnedCount),
    wins: Math.max(0, input.wins),
    secondPlaces: Math.max(0, input.secondPlaces),
    thirdPlaces: Math.max(0, input.thirdPlaces),
  }
  const tiers = tiersFor(type)
  let currentTierIndex = -1
  tiers.forEach((tier, index) => {
    if (tier.every((r) => safe[r.metric] >= r.minimum)) currentTierIndex = index
  })
  const isClaimed = currentTierIndex >= 0
  const currentTier = isClaimed ? tiers[currentTierIndex] : null
  const nextTier = tiers[currentTierIndex + 1] ?? null
  const currentMilestone = currentTier ? primaryThreshold(currentTier) : null
  const nextMilestone = nextTier ? primaryThreshold(nextTier) : null

  let progressToNext: number | null = null
  let remainingToNext: number | null = null
  if (nextMilestone !== null) {
    if (currentMilestone !== null) {
      const span = nextMilestone - currentMilestone
      progressToNext = span > 0 ? clamp01((safe.earnedCount - currentMilestone) / span) : 1
    } else {
      progressToNext = nextMilestone > 0 ? Math.min(1, safe.earnedCount / nextMilestone) : 0
    }
    remainingToNext = Math.max(0, nextMilestone - safe.earnedCount)
  }

  const nextTierRequirementProgress: RequirementProgress[] =
    nextTier && nextTier.length > 1
      ? nextTier.map((r) => ({
          metric: r.metric,
          currentValue: safe[r.metric],
          requiredValue: r.minimum,
          isSatisfied: safe[r.metric] >= r.minimum,
          fractionComplete: r.minimum > 0 ? Math.min(1, safe[r.metric] / r.minimum) : 1,
        }))
      : []

  // Tier 0 is the base trophy only; every later tier adds one gemstone, cumulatively.
  const gemstoneCount = Math.min(Math.max(0, currentTierIndex), TROPHY_GEMSTONES.length)
  return {
    type,
    earnedCount: safe.earnedCount,
    isClaimed,
    currentTierIndex,
    currentMilestone,
    nextMilestone,
    progressToNextMilestone: progressToNext,
    remainingToNextMilestone: remainingToNext,
    nextTierRequirementProgress,
    unlockedGemstones: TROPHY_GEMSTONES.slice(0, gemstoneCount),
    unlockedStructuralUpgrades: isClaimed ? tiers.slice(0, currentTierIndex + 1).map(primaryThreshold).filter((n): n is number => n !== null) : [],
    isMaximumPrestigeTier: isClaimed && nextTier === null,
  }
}

// ---- Career stats ---------------------------------------------------------------------------------

export interface TrophyCareerStats {
  championshipTitles: number
  subseriesTitles: number
  firstPlaceFinishes: number
  secondPlaceFinishes: number
  thirdPlaceFinishes: number
  fastestLaps: number
  polePositions: number
}

export const EMPTY_TROPHY_STATS: TrophyCareerStats = {
  championshipTitles: 0,
  subseriesTitles: 0,
  firstPlaceFinishes: 0,
  secondPlaceFinishes: 0,
  thirdPlaceFinishes: 0,
  fastestLaps: 0,
  polePositions: 0,
}

export function trophyCount(type: TrophyType, stats: TrophyCareerStats): number {
  switch (type) {
    case 'champion':
      return stats.championshipTitles
    case 'subseriesChampion':
      return stats.subseriesTitles
    case 'firstPlace':
      return stats.firstPlaceFinishes
    case 'secondPlace':
      return stats.secondPlaceFinishes
    case 'thirdPlace':
      return stats.thirdPlaceFinishes
    case 'podium':
      return stats.firstPlaceFinishes + stats.secondPlaceFinishes + stats.thirdPlaceFinishes
    case 'fastestLap':
      return stats.fastestLaps
    case 'polePosition':
      return stats.polePositions
  }
}

export function trophyMilestones(stats: TrophyCareerStats): MilestoneState[] {
  return TROPHY_TYPES.map((type) =>
    milestoneState(type, {
      earnedCount: trophyCount(type, stats),
      wins: stats.firstPlaceFinishes,
      secondPlaces: stats.secondPlaceFinishes,
      thirdPlaces: stats.thirdPlaceFinishes,
    }),
  )
}

/**
 * Placement / Fastest Lap / Pole counts from the driver's OWN race-kind, individual (non-team) `driver_history` rows in one championship.
 * DNS is never a start and DSQ never a pole. When the current event set is supplied, cancelled or deleted events are excluded so Podium
 * cannot diverge from Race Win / 2nd / 3rd Place.
 */
export function raceTrophyStats(history: HistoryEntry[], championshipId: string, eventById?: Map<string, Pick<EventRow, 'status'>>): TrophyCareerStats {
  const races = history.filter((entry) => {
    if (!isRaceEntry(entry) || entry.is_team_event || entry.championship_id !== championshipId) return false
    if (!eventById) return true
    const event = eventById.get(entry.event_id)
    return Boolean(event) && event?.status !== 'cancelled'
  })
  const started = races.filter(didStart)
  const finished = started.filter((r) => statusOf(r) === 'fin' && r.finish_position !== null)
  return {
    ...EMPTY_TROPHY_STATS,
    firstPlaceFinishes: finished.filter((r) => r.finish_position === 1).length,
    secondPlaceFinishes: finished.filter((r) => r.finish_position === 2).length,
    thirdPlaceFinishes: finished.filter((r) => r.finish_position === 3).length,
    fastestLaps: finished.filter((r) => r.fastest_lap).length,
    polePositions: started.filter((r) => r.earned_pole && statusOf(r) !== 'dsq').length,
  }
}

// ---- Titles ---------------------------------------------------------------------------------------

export interface LiveAwardLite {
  id: string
  season_id: string
  driver_id: string
  scope: string
  scope_id: string | null
  status: string
  points: number
  clinched_round: number | null
  final_round: number | null
  awarded_at: string
}

const keyString = (seasonId: string, series: SeriesKey) => `${seasonId}|${series.scope}|${series.scopeId ?? ''}`

/**
 * Main / Subseries championship counts from two sources counted once per (season, series): a COMPLETED season where the driver ranks first
 * (same engine and tie-break as the live Standings screen), and live server awards (`standing_awards`, status clinched/champion). An active
 * or draft season's leader is provisional and never counted.
 */
export function championshipTitles(args: {
  driverId: string
  completedSeasons: SeasonRow[]
  outputsBySeason: Map<string, ScoringOutputRow[]>
  eventById: Map<string, EventRow>
  driverInfo: Map<string, DriverInfo>
  configFor: (season: SeasonRow) => StandingsScoringConfig
  awards?: LiveAwardLite[]
}): { championships: number; subseries: number } {
  const keys = new Set<string>()
  const overall = new Set<string>()

  for (const season of args.completedSeasons) {
    const outputs = args.outputsBySeason.get(season.id)
    if (!outputs || outputs.length === 0) continue
    const byEvent = new Map<string, EventScore[]>()
    for (const output of outputs) {
      byEvent.set(output.event_id, [...(byEvent.get(output.event_id) ?? []), eventScoreFromOutput(output, args.eventById.get(output.event_id), undefined)])
    }
    const eventScores = [...byEvent.values()]
    const config = args.configFor(season)
    const winner = (key: SeriesKey) => rankedDriverRows(eventScores, args.driverInfo, config, seriesFilter(key)).rows[0]?.driverId
    const mark = (key: SeriesKey) => {
      keys.add(keyString(season.id, key))
      if (key.scope === 'overall') overall.add(keyString(season.id, key))
    }

    if (winner(OVERALL_SERIES) === args.driverId) mark(OVERALL_SERIES)
    const classIds = new Set(outputs.map((o) => o.class_id ?? args.eventById.get(o.event_id)?.class_id).filter((id): id is string => Boolean(id)))
    for (const id of classIds) if (winner(classSeries(id)) === args.driverId) mark(classSeries(id))
    const regionIds = new Set(outputs.map((o) => o.region_id ?? args.eventById.get(o.event_id)?.region_id).filter((id): id is string => Boolean(id)))
    for (const id of regionIds) if (winner(regionSeries(id)) === args.driverId) mark(regionSeries(id))
  }

  for (const award of args.awards ?? []) {
    if (award.driver_id !== args.driverId || (award.status !== 'clinched' && award.status !== 'champion')) continue
    const key: SeriesKey = award.scope === 'overall' ? OVERALL_SERIES : { scope: award.scope as 'class' | 'region', scopeId: award.scope_id }
    keys.add(keyString(award.season_id, key))
    if (key.scope === 'overall') overall.add(keyString(award.season_id, key))
  }
  return { championships: overall.size, subseries: keys.size - overall.size }
}

export interface AwardEntry {
  id: string
  type: 'champion' | 'subseriesChampion'
  title: string
  seasonName: string
  points: number
  roundText: string | null
  awardedAt: string
}

/** The Clinched / Champion awards behind the two title trophies, newest first ("Gr.4 Clinched", "Secured after Round 8 · Final after Round 10"). */
export function awardEntries(args: {
  awards: LiveAwardLite[]
  seasonNames: Map<string, string>
  classNames: Map<string, string>
  regionNames: Map<string, string>
  championshipName: string
}): AwardEntry[] {
  return args.awards
    .filter((a) => a.status === 'clinched' || a.status === 'champion')
    .map((award): AwardEntry => {
      const series =
        award.scope === 'overall' ? args.championshipName : award.scope === 'class' ? (award.scope_id && args.classNames.get(award.scope_id)) || 'Class' : (award.scope_id && args.regionNames.get(award.scope_id)) || 'Region'
      const isChampion = award.status === 'champion'
      const { clinched_round: secured, final_round: final } = award
      let roundText: string | null = null
      if (isChampion && secured !== null && final !== null && secured !== final) roundText = `Secured after Round ${secured} · Final after Round ${final}`
      else if (isChampion && final !== null) roundText = `Final after Round ${final}`
      else if (!isChampion && secured !== null) roundText = `Clinched after Round ${secured}`
      return {
        id: award.id,
        type: award.scope === 'overall' ? 'champion' : 'subseriesChampion',
        title: `${series} ${isChampion ? 'Champion' : 'Clinched'}`,
        seasonName: args.seasonNames.get(award.season_id) ?? 'Season',
        points: award.points,
        roundText,
        awardedAt: award.awarded_at,
      }
    })
    .sort((a, b) => b.awardedAt.localeCompare(a.awardedAt))
}
