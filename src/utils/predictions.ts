import type { DriverHistoryEntry } from '@/services/driverProfile'

/**
 * Ports the deterministic forecast math from VRCPredictionEngineV2 /
 * StandingsEngine.swift (see docs/XCODE_SOURCE_ANALYSIS.md for the source
 * lines this was extracted from). Fully client-computable from data any
 * league member can already read (driver_history, standings), so this can run
 * for any signed-in member — only *persisting* a run via vrc_save_prediction_run
 * is gated to staff (canOperateRaceControl).
 */
export interface DriverFactorInputs {
  driverId: string
  displayName: string
  /** 0-1: recent finishing form, most recent races weighted higher. */
  recentForm: number
  /** 0-1: historical performance at this specific track, if any. */
  trackHistory: number
  /** 0-1: strength of the driver's class field. */
  classStrength: number
  /** 0-1: consistency of finishing position (low variance = high score). */
  consistency: number
  /** 0-1: current standings position strength. */
  standingsStrength: number
  /** 0-1: finish-rate reliability (inverse of DNF/DNS/DSQ rate). */
  reliability: number
  /** 0-1: recent race-prep pace vs the field, from parsed telemetry aggregates. */
  paceStrength: number
  completedRaceCount: number
}

const WEIGHTS = { recentForm: 0.4, trackHistory: 0.2, classStrength: 0.2, consistency: 0.2 }

export function raceWinnerScore(f: DriverFactorInputs): number {
  const totalWeight =
    WEIGHTS.recentForm + WEIGHTS.trackHistory + WEIGHTS.classStrength + WEIGHTS.consistency
  const weighted =
    f.recentForm * WEIGHTS.recentForm +
    f.trackHistory * WEIGHTS.trackHistory +
    f.classStrength * WEIGHTS.classStrength +
    f.consistency * WEIGHTS.consistency
  const blended = (weighted / totalWeight) * 0.64 + f.standingsStrength * 0.12 + f.reliability * 0.08 + f.paceStrength * 0.16
  return clamp01(blended)
}

export function podiumScore(f: DriverFactorInputs): number {
  const raceWin = raceWinnerScore(f)
  return clamp01(raceWin * 0.66 + f.consistency * 0.18 + f.reliability * 0.08 + f.paceStrength * 0.08)
}

export function poleScore(f: DriverFactorInputs): number {
  return clamp01(f.paceStrength * 0.55 + f.recentForm * 0.25 + f.trackHistory * 0.2)
}

export function fastestLapScore(f: DriverFactorInputs): number {
  return clamp01(f.paceStrength * 0.6 + f.recentForm * 0.25 + f.consistency * 0.15)
}

/** Confidence decays with sample size: 1 race -> 18% ... 11+ races -> 92%, blended with season progress. */
export function predictionConfidence(completedCount: number, totalRaceCount: number): number {
  if (completedCount <= 0) return 0
  const progress = clamp01(completedCount / Math.max(1, totalRaceCount))
  const raceCountConfidence =
    completedCount === 1
      ? 0.18
      : completedCount === 2
        ? 0.3
        : completedCount === 3
          ? 0.42
          : completedCount <= 5
            ? 0.52
            : completedCount <= 8
              ? 0.68
              : completedCount <= 10
                ? 0.82
                : 0.92
  return clamp01(raceCountConfidence * 0.7 + progress * 0.3)
}

export function confidenceTier(value: number): 'low' | 'medium' | 'high' {
  if (value < 0.4) return 'low'
  if (value < 0.7) return 'medium'
  return 'high'
}

/** Normalizes a set of raw scores into probabilities that sum to 1 across the field. */
export function normalizeToProbabilities(scores: { driverId: string; score: number }[]): {
  driverId: string
  probability: number
}[] {
  const total = scores.reduce((sum, s) => sum + s.score, 0)
  if (total <= 0) {
    const even = 1 / Math.max(1, scores.length)
    return scores.map((s) => ({ driverId: s.driverId, probability: even }))
  }
  return scores.map((s) => ({ driverId: s.driverId, probability: s.score / total }))
}

export function formatPercent(probability: number): string {
  if (probability <= 0) return '0%'
  if (probability >= 1) return '100%'
  const pct = probability * 100
  if (pct < 1) return '<1%'
  if (pct > 99) return '>99%'
  return `${Math.round(pct)}%`
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Derives DriverFactorInputs from a driver's race_kind history rows for the active
 * season (and, for trackHistory, any prior appearance at the same track_id).
 * This is a simplified but faithful reconstruction of the app's factor pipeline —
 * see docs/WEB_LIMITATIONS.md for where it's deliberately simplified (no
 * replay-derived lap insight blending, since raw telemetry/replay isn't ported).
 */
export function buildFactorInputs(
  driverId: string,
  displayName: string,
  seasonHistory: DriverHistoryEntry[],
  currentTrackId: string | null,
): DriverFactorInputs {
  const raceRows = seasonHistory
    .filter((r) => r.result_kind === 'race' && r.driver_id === driverId)
    .sort((a, b) => (a.events?.round ?? 0) - (b.events?.round ?? 0))

  const completedRaceCount = raceRows.length
  if (completedRaceCount === 0) {
    return {
      driverId,
      displayName,
      recentForm: 0.5,
      trackHistory: 0.5,
      classStrength: 0.5,
      consistency: 0.5,
      standingsStrength: 0.5,
      reliability: 0.5,
      paceStrength: 0.5,
      completedRaceCount: 0,
    }
  }

  const positions = raceRows.map((r) => r.finish_position ?? 20)
  const recent = positions.slice(-3)
  const recentForm = clamp01(1 - (average(recent) - 1) / 19)

  const trackRows = currentTrackId ? raceRows.filter((r) => r.track_id === currentTrackId) : []
  const trackHistory = trackRows.length > 0 ? clamp01(1 - (average(trackRows.map((r) => r.finish_position ?? 20)) - 1) / 19) : 0.5

  const variance = populationVariance(positions)
  const consistency = clamp01(1 - variance / 100)

  const dnfCount = raceRows.filter((r) => r.status !== 'fin' && r.status !== 'classified').length
  const reliability = clamp01(1 - dnfCount / completedRaceCount)

  const polesAndFastest = raceRows.filter((r) => r.earned_pole || r.fastest_lap).length
  const paceStrength = clamp01(polesAndFastest / completedRaceCount + 0.2)

  return {
    driverId,
    displayName,
    recentForm,
    trackHistory,
    classStrength: 0.5,
    consistency,
    standingsStrength: recentForm,
    reliability,
    paceStrength,
    completedRaceCount,
  }
}

function average(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function populationVariance(values: number[]): number {
  const mean = average(values)
  return average(values.map((v) => (v - mean) ** 2))
}

/**
 * Ports VRCForecastEngine.swift's championship market — clinch/magic-number/
 * elimination math, generalized so it also drives the class- and
 * region-scoped championship markets (same math, just a filtered driver set
 * and group-scoped standings rows).
 */
export interface ChampionshipContender {
  driverId: string
  displayName: string
  currentPoints: number
  currentPosition: number
  projectedPoints: number
  projectedPosition: number
  gapToLeader: number
  maxReachable: number
  canStillWin: boolean
  clinched: boolean
  eliminated: boolean
}

export interface ChampionshipForecast {
  remainingRounds: number
  totalRounds: number
  roundsScored: number
  leaderId: string | null
  clinched: boolean
  leaderMagicNumber: number
  stillAliveCount: number
  contenders: ChampionshipContender[]
  narrative: string
}

const MINIMUM_OFFICIAL_ROUNDS = 2

export function buildChampionshipForecast(
  standings: { driverId: string; displayName: string; points: number; position: number }[],
  paceByDriver: Map<string, number>,
  roundsScored: number,
  totalRounds: number,
  maxPointsPerRound: number,
): ChampionshipForecast | null {
  if (standings.length === 0 || roundsScored < MINIMUM_OFFICIAL_ROUNDS) return null

  const remainingRounds = Math.max(0, totalRounds - roundsScored)
  const sorted = [...standings].sort((a, b) => b.points - a.points)
  const leader = sorted[0]

  const withProjection = sorted.map((s) => {
    const pace = paceByDriver.get(s.driverId) ?? s.points / Math.max(1, roundsScored)
    return {
      ...s,
      projectedPoints: Math.round(s.points + pace * remainingRounds),
      maxReachable: s.points + remainingRounds * maxPointsPerRound,
    }
  })

  const clinched = withProjection.slice(1).every((c) => leader.points > c.maxReachable)
  const secondPlace = withProjection[1]
  const leaderMagicNumber =
    clinched || !secondPlace
      ? 0
      : Math.max(0, secondPlace.points + remainingRounds * maxPointsPerRound - leader.points + 1)

  const projectedOrder = [...withProjection].sort((a, b) => b.projectedPoints - a.projectedPoints)
  const projectedPositionById = new Map(projectedOrder.map((c, i) => [c.driverId, i + 1]))

  const contenders: ChampionshipContender[] = withProjection.map((c) => ({
    driverId: c.driverId,
    displayName: c.displayName,
    currentPoints: c.points,
    currentPosition: c.position,
    projectedPoints: c.projectedPoints,
    projectedPosition: projectedPositionById.get(c.driverId) ?? c.position,
    gapToLeader: leader.points - c.points,
    maxReachable: c.maxReachable,
    canStillWin: c.maxReachable >= leader.points,
    clinched: c.driverId === leader.driverId && clinched,
    eliminated: c.driverId !== leader.driverId && c.maxReachable < leader.points,
  }))

  const stillAliveCount = contenders.filter((c) => c.canStillWin).length

  const narrative = clinched
    ? `${leader.displayName} has clinched the championship.`
    : remainingRounds === 0
      ? `${leader.displayName} leads with the season complete.`
      : stillAliveCount <= 1
        ? `${leader.displayName} controls their own destiny with ${remainingRounds} round(s) remaining.`
        : `${stillAliveCount} drivers are still mathematically alive for the title with ${remainingRounds} round(s) remaining. ${leader.displayName} needs ${leaderMagicNumber} more point(s) to clinch.`

  return {
    remainingRounds,
    totalRounds,
    roundsScored,
    leaderId: leader.driverId,
    clinched,
    leaderMagicNumber,
    stillAliveCount,
    contenders: contenders.sort((a, b) => b.projectedPoints - a.projectedPoints),
    narrative,
  }
}

export interface DriverOutlook {
  driverId: string
  displayName: string
  /** 0-1: share of simulated season completions where this driver is the sole mathematically-alive contender. */
  clinchProbability: number
  /** 0-1: share of simulated season completions where this driver becomes mathematically eliminated. */
  eliminationProbability: number
  /** Round number (not remaining-round count) the clinch is projected to land, only set once clinchProbability >= 60%. */
  estimatedClinchRound: number | null
  /** Round number the elimination is projected to land, only set once eliminationProbability > 60%. */
  estimatedEliminationRound: number | null
}

const OUTLOOK_CLINCH_THRESHOLD = 0.6
const OUTLOOK_ELIMINATION_THRESHOLD = 0.6
const OUTLOOK_TRIALS = 600
const MIN_OPEN_PROBABILITY = 0.01
const MAX_OPEN_PROBABILITY = 0.99

interface ChampionshipOutlookState {
  clinchedDriverIds?: Set<string>
  eliminatedDriverIds?: Set<string>
}

/**
 * Monte Carlo extension of buildChampionshipForecast's deterministic clinch/elimination
 * math: instead of a single boolean at the current point-in-time, this bootstraps each
 * driver's own past per-round point hauls forward over the remaining rounds many times,
 * re-running the same "maxReachable < current leader" elimination test after every
 * simulated round. That gives every driver a probability (not just the eventual champion
 * and the already-dead) plus an estimated round for when the underlying deterministic
 * fact is likely to land.
 */
export function simulateChampionshipOutlook(
  standings: { driverId: string; displayName: string; points: number }[],
  pastPointsByDriver: Map<string, number[]>,
  roundsScored: number,
  totalRounds: number,
  maxPointsPerRound: number,
  trials: number = OUTLOOK_TRIALS,
  currentState?: ChampionshipOutlookState,
): DriverOutlook[] {
  if (standings.length === 0) return []

  const remainingRounds = Math.max(0, totalRounds - roundsScored)
  const sorted = [...standings].sort((a, b) => b.points - a.points)
  const leader = sorted[0]
  const hasExplicitCurrentState = Boolean(currentState?.clinchedDriverIds || currentState?.eliminatedDriverIds)
  const derivedClinchedDriverIds = new Set<string>(
    remainingRounds === 0 || sorted.slice(1).every((s) => leader.points > s.points + remainingRounds * maxPointsPerRound)
      ? [leader.driverId]
      : [],
  )
  const derivedEliminatedDriverIds = new Set(
    sorted
      .filter((s) => s.driverId !== leader.driverId && s.points + remainingRounds * maxPointsPerRound < leader.points)
      .map((s) => s.driverId),
  )
  const clinchedDriverIds = currentState?.clinchedDriverIds ?? derivedClinchedDriverIds
  const eliminatedDriverIds = currentState?.eliminatedDriverIds ?? derivedEliminatedDriverIds

  if (remainingRounds === 0 && !hasExplicitCurrentState) {
    return standings.map((s) => ({
      driverId: s.driverId,
      displayName: s.displayName,
      clinchProbability: s.driverId === leader.driverId ? 1 : 0,
      eliminationProbability: s.driverId === leader.driverId ? 0 : 1,
      estimatedClinchRound: s.driverId === leader.driverId ? roundsScored : null,
      estimatedEliminationRound: s.driverId === leader.driverId ? null : roundsScored,
    }))
  }

  const leaguePool = Array.from(pastPointsByDriver.values()).flat()
  const pools = new Map(
    standings.map((s) => {
      const own = pastPointsByDriver.get(s.driverId) ?? []
      return [s.driverId, own.length > 0 ? own : leaguePool.length > 0 ? leaguePool : [0]]
    }),
  )

  const clinchWins = new Map(standings.map((s) => [s.driverId, 0]))
  const clinchRoundSum = new Map(standings.map((s) => [s.driverId, 0]))
  const eliminatedCount = new Map(standings.map((s) => [s.driverId, 0]))
  const eliminationRoundSum = new Map(standings.map((s) => [s.driverId, 0]))

  for (let t = 0; t < trials; t++) {
    const running = new Map(standings.map((s) => [s.driverId, s.points]))
    const eliminatedAt = new Map<string, number>()
    let clinchedDriverId: string | null = null
    let clinchedRound = 0

    for (let r = 1; r <= remainingRounds; r++) {
      for (const s of standings) {
        const pool = pools.get(s.driverId)!
        const draw = pool[Math.floor(Math.random() * pool.length)]
        running.set(s.driverId, (running.get(s.driverId) ?? 0) + draw)
      }
      const remainingAfter = remainingRounds - r
      const leaderPoints = Math.max(...running.values())
      for (const s of standings) {
        if (eliminatedAt.has(s.driverId)) continue
        const points = running.get(s.driverId)!
        const maxReachable = points + remainingAfter * maxPointsPerRound
        if (maxReachable < leaderPoints) eliminatedAt.set(s.driverId, roundsScored + r)
      }
      if (clinchedDriverId === null) {
        const stillAlive = standings.filter((s) => !eliminatedAt.has(s.driverId))
        if (stillAlive.length === 1) {
          clinchedDriverId = stillAlive[0].driverId
          clinchedRound = roundsScored + r
        }
      }
    }

    if (clinchedDriverId !== null) {
      clinchWins.set(clinchedDriverId, (clinchWins.get(clinchedDriverId) ?? 0) + 1)
      clinchRoundSum.set(clinchedDriverId, (clinchRoundSum.get(clinchedDriverId) ?? 0) + clinchedRound)
    }
    for (const [driverId, round] of eliminatedAt) {
      eliminatedCount.set(driverId, (eliminatedCount.get(driverId) ?? 0) + 1)
      eliminationRoundSum.set(driverId, (eliminationRoundSum.get(driverId) ?? 0) + round)
    }
  }

  return standings.map((s) => {
    const clinchCount = clinchWins.get(s.driverId) ?? 0
    const eliminationCount = eliminatedCount.get(s.driverId) ?? 0
    const isClinched = clinchedDriverIds.has(s.driverId)
    const isEliminated = eliminatedDriverIds.has(s.driverId)
    const clinchProbability = isClinched
      ? 1
      : isEliminated
        ? 0
        : clampOpenOutlookProbability(clinchCount / trials)
    const eliminationProbability = isEliminated
      ? 1
      : isClinched
        ? 0
        : clampOpenOutlookProbability(eliminationCount / trials)
    return {
      driverId: s.driverId,
      displayName: s.displayName,
      clinchProbability,
      eliminationProbability,
      estimatedClinchRound:
        clinchProbability >= OUTLOOK_CLINCH_THRESHOLD && clinchCount > 0
          ? Math.round((clinchRoundSum.get(s.driverId) ?? 0) / clinchCount)
          : null,
      estimatedEliminationRound:
        eliminationProbability > OUTLOOK_ELIMINATION_THRESHOLD && eliminationCount > 0
          ? Math.round((eliminationRoundSum.get(s.driverId) ?? 0) / eliminationCount)
          : null,
    }
  })
}

function clampOpenOutlookProbability(value: number): number {
  return Math.min(MAX_OPEN_PROBABILITY, Math.max(MIN_OPEN_PROBABILITY, value))
}

/** Blended pace for projecting remaining-season points: 60% last-3-races average + 40% season average. */
export function computePace(history: DriverHistoryEntry[], driverId: string): number {
  const raceRows = history
    .filter((r) => r.result_kind === 'race' && r.driver_id === driverId)
    .sort((a, b) => (a.events?.round ?? 0) - (b.events?.round ?? 0))
  if (raceRows.length === 0) return 0
  const points = raceRows.map((r) => r.points ?? 0)
  return average(points.slice(-3)) * 0.6 + average(points) * 0.4
}
