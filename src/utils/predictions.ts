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
  /**
   * 0-1: Performance Shaping Factor read on human-error exposure (track unfamiliarity,
   * a recent racecraft-losses trend, DNF-rate) — 0 is low risk, 1 is high risk. Already
   * folded into `reliability` above as a multiplier; exposed separately so callers can
   * show it as its own "incident risk" figure.
   */
  incidentRisk: number
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

/**
 * Bayesian-blended version of normalizeToProbabilities: shrinks the raw score-based
 * probability toward a uniform prior (every driver equally likely) based on how much
 * evidence the field actually has. With one race scored, the field's sample size is
 * tiny, so the blend leans on the uniform prior instead of over-committing to whoever
 * got lucky in round one; as more races land, the raw scores increasingly take over.
 * `priorStrength` is the equivalent number of "phantom" races the prior is worth.
 */
export function normalizeToProbabilitiesBayesian(
  scores: { driverId: string; score: number; sampleSize: number }[],
  priorStrength = 4,
): { driverId: string; probability: number }[] {
  if (scores.length === 0) return []
  const raw = normalizeToProbabilities(scores.map(({ driverId, score }) => ({ driverId, score })))
  const rawByDriver = new Map(raw.map((r) => [r.driverId, r.probability]))
  const uniform = 1 / scores.length
  const evidenceWeight = average(scores.map((s) => s.sampleSize)) / (average(scores.map((s) => s.sampleSize)) + priorStrength)
  return scores.map((s) => ({
    driverId: s.driverId,
    probability: (rawByDriver.get(s.driverId) ?? uniform) * evidenceWeight + uniform * (1 - evidenceWeight),
  }))
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Shrinks a raw per-driver estimate toward a prior in proportion to how much of that
 *  driver's own evidence (`sampleSize`) we have vs. the prior's assumed weight
 *  (`priorStrength`, in equivalent pseudo-observations) — standard empirical-Bayes/
 *  credibility-weighting, used throughout this module to bridge early-season and
 *  small-sample gaps instead of trusting thin data at face value or hard-defaulting to
 *  a flat 0.5 the moment any data exists. */
function shrinkTowardPrior(raw: number, sampleSize: number, priorStrength: number, prior: number): number {
  if (sampleSize <= 0) return prior
  const weight = sampleSize / (sampleSize + priorStrength)
  return raw * weight + prior * (1 - weight)
}

export interface LeaguePriors {
  recentForm: number
  consistency: number
  reliability: number
  paceStrength: number
  incidentRisk: number
}

const NEUTRAL_PRIORS: LeaguePriors = {
  recentForm: 0.5,
  consistency: 0.5,
  reliability: 0.5,
  paceStrength: 0.5,
  incidentRisk: 0.3,
}

const FACTOR_PRIOR_STRENGTH = 3
const TRACK_PRIOR_STRENGTH = 2
const PSF_SENSITIVITY = 0.8

/**
 * Field-wide baselines used as the Bayesian prior for every driver's factor shrinkage —
 * an "average driver in this league" reference point, computed once per prediction run
 * from the whole season's history rather than a fixed global constant, so it adapts to
 * how competitive or reliable this specific league actually is. Falls back to neutral
 * (0.5-ish) priors when nobody has raced yet.
 */
export function computeLeaguePriors(seasonHistory: DriverHistoryEntry[]): LeaguePriors {
  const driverIds = Array.from(new Set(seasonHistory.map((h) => h.driver_id)))
  const raw = driverIds
    .map((id) => computeRawDriverFactors(id, seasonHistory))
    .filter((f): f is RawDriverFactors => f !== null)
  if (raw.length === 0) return NEUTRAL_PRIORS
  return {
    recentForm: average(raw.map((f) => f.recentForm)),
    consistency: average(raw.map((f) => f.consistency)),
    reliability: average(raw.map((f) => f.reliability)),
    paceStrength: average(raw.map((f) => f.paceStrength)),
    incidentRisk: average(raw.map((f) => f.incidentRiskRaw)),
  }
}

/** Average points-per-race across the whole season, regardless of driver — the prior
 *  computePace shrinks a thin-data driver's projected pace toward. */
export function leagueAveragePacePerRound(seasonHistory: DriverHistoryEntry[]): number {
  const points = seasonHistory.filter((h) => h.result_kind === 'race').map((h) => h.points ?? 0)
  return points.length > 0 ? average(points) : 0
}

interface RawDriverFactors {
  recentForm: number
  consistency: number
  reliability: number
  paceStrength: number
  incidentRiskRaw: number
}

function computeRawDriverFactors(driverId: string, seasonHistory: DriverHistoryEntry[]): RawDriverFactors | null {
  const raceRows = seasonHistory
    .filter((r) => r.result_kind === 'race' && r.driver_id === driverId)
    .sort((a, b) => (a.events?.round ?? 0) - (b.events?.round ?? 0))
  if (raceRows.length === 0) return null

  const positions = raceRows.map((r) => r.finish_position ?? 20)
  const recentForm = clamp01(1 - (average(positions.slice(-3)) - 1) / 19)
  const consistency = clamp01(1 - populationVariance(positions) / 100)
  const dnfCount = raceRows.filter((r) => r.status !== 'fin' && r.status !== 'classified').length
  const reliability = clamp01(1 - dnfCount / raceRows.length)
  const polesAndFastest = raceRows.filter((r) => r.earned_pole || r.fastest_lap).length
  const paceStrength = clamp01(polesAndFastest / raceRows.length + 0.2)
  const incidentRiskRaw = clamp01(racecraftRisk(raceRows) * 0.5 + (1 - reliability) * 0.5)

  return { recentForm, consistency, reliability, paceStrength, incidentRiskRaw }
}

/** Recency-weighted rate of finishing worse than you started — a Performance Shaping
 *  Factor proxy for on-track errors (contact, spins, avoidable penalties) that a flat
 *  DNF-rate reliability figure misses entirely, since plenty of incidents cost positions
 *  without ending the race outright. */
function racecraftRisk(raceRows: DriverHistoryEntry[]): number {
  const recentRows = raceRows.slice(-5)
  const losses = recentRows.map((r) => {
    if (r.start_position == null || r.finish_position == null) return 0
    return Math.max(0, r.finish_position - r.start_position)
  })
  return clamp01(average(losses) / 8)
}

/**
 * Derives DriverFactorInputs from a driver's race_kind history rows for the active
 * season (and, for trackHistory, any prior appearance at the same track_id).
 * This is a simplified but faithful reconstruction of the app's factor pipeline —
 * see docs/WEB_LIMITATIONS.md for where it's deliberately simplified (no
 * replay-derived lap insight blending, since raw telemetry/replay isn't ported).
 *
 * Every factor is Bayesian-shrunk toward `priors` (an "average driver in this league"
 * baseline from computeLeaguePriors) in proportion to how much of the driver's own
 * evidence exists, rather than trusting one or two races at face value or falling off
 * a cliff to a flat 0.5 default. Reliability is additionally scaled by a Performance
 * Shaping Factor multiplier — built from track unfamiliarity and a recent
 * racecraft-losses trend — so drivers who are more error-exposed right now (new to this
 * track, on a recent incident streak) get a lower effective reliability than their raw
 * DNF rate alone would suggest, the same way PSFs scale a nominal human-error
 * probability in human-reliability analysis.
 */
export function buildFactorInputs(
  driverId: string,
  displayName: string,
  seasonHistory: DriverHistoryEntry[],
  currentTrackId: string | null,
  priors: LeaguePriors = NEUTRAL_PRIORS,
): DriverFactorInputs {
  const raceRows = seasonHistory
    .filter((r) => r.result_kind === 'race' && r.driver_id === driverId)
    .sort((a, b) => (a.events?.round ?? 0) - (b.events?.round ?? 0))

  const completedRaceCount = raceRows.length
  if (completedRaceCount === 0) {
    return {
      driverId,
      displayName,
      recentForm: priors.recentForm,
      trackHistory: priors.recentForm,
      classStrength: 0.5,
      consistency: priors.consistency,
      standingsStrength: priors.recentForm,
      reliability: priors.reliability,
      paceStrength: priors.paceStrength,
      incidentRisk: priors.incidentRisk,
      completedRaceCount: 0,
    }
  }

  const positions = raceRows.map((r) => r.finish_position ?? 20)
  const recentFormRaw = clamp01(1 - (average(positions.slice(-3)) - 1) / 19)
  const recentForm = shrinkTowardPrior(recentFormRaw, completedRaceCount, FACTOR_PRIOR_STRENGTH, priors.recentForm)

  const trackRows = currentTrackId ? raceRows.filter((r) => r.track_id === currentTrackId) : []
  const trackHistoryRaw =
    trackRows.length > 0 ? clamp01(1 - (average(trackRows.map((r) => r.finish_position ?? 20)) - 1) / 19) : recentForm
  // Shrink track-specific form toward the driver's own overall season form — a closer,
  // more informative prior than a league-wide number for a context this sparse.
  const trackHistory = shrinkTowardPrior(trackHistoryRaw, trackRows.length, TRACK_PRIOR_STRENGTH, recentForm)

  const variance = populationVariance(positions)
  const consistencyRaw = clamp01(1 - variance / 100)
  const consistency = shrinkTowardPrior(consistencyRaw, completedRaceCount, FACTOR_PRIOR_STRENGTH, priors.consistency)

  const dnfCount = raceRows.filter((r) => r.status !== 'fin' && r.status !== 'classified').length
  const reliabilityRaw = clamp01(1 - dnfCount / completedRaceCount)
  const reliabilityBase = shrinkTowardPrior(reliabilityRaw, completedRaceCount, FACTOR_PRIOR_STRENGTH, priors.reliability)

  const polesAndFastest = raceRows.filter((r) => r.earned_pole || r.fastest_lap).length
  const paceStrengthRaw = clamp01(polesAndFastest / completedRaceCount + 0.2)
  const paceStrength = shrinkTowardPrior(paceStrengthRaw, completedRaceCount, FACTOR_PRIOR_STRENGTH, priors.paceStrength)

  // Performance Shaping Factors: track unfamiliarity and a recent racecraft-losses trend
  // both raise error exposure beyond what the flat DNF-rate reliability figure captures.
  const familiarityRisk = clamp01(1 - trackRows.length / 3)
  const incidentRiskRaw = clamp01(racecraftRisk(raceRows) * 0.4 + familiarityRisk * 0.25 + (1 - reliabilityBase) * 0.35)
  const incidentRisk = shrinkTowardPrior(incidentRiskRaw, completedRaceCount, FACTOR_PRIOR_STRENGTH, priors.incidentRisk)

  const psfMultiplier = clamp(1 + (incidentRisk - priors.incidentRisk) * PSF_SENSITIVITY, 0.7, 1.35)
  const reliability = clamp01(reliabilityBase / psfMultiplier)

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
    incidentRisk,
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
const OUTLOOK_POOL_PRIOR_STRENGTH = 3
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

  // Bayesian bootstrap: each driver draws from their own past per-round point hauls with
  // probability proportional to how much of that history exists, otherwise from the
  // league-wide pool — so a rookie mid-season with two races behind them projects mostly
  // off the field's pace rather than their own barely-there sample, and a veteran with a
  // long history draws almost entirely from their own form.
  const leaguePool = Array.from(pastPointsByDriver.values()).flat()
  const pools = new Map(
    standings.map((s) => {
      const own = pastPointsByDriver.get(s.driverId) ?? []
      const ownWeight = own.length / (own.length + OUTLOOK_POOL_PRIOR_STRENGTH)
      return [s.driverId, { own, ownWeight }]
    }),
  )
  function drawPoints(driverId: string): number {
    const pool = pools.get(driverId)!
    const useOwn = pool.own.length > 0 && Math.random() < pool.ownWeight
    const source = useOwn ? pool.own : leaguePool.length > 0 ? leaguePool : pool.own.length > 0 ? pool.own : [0]
    return source[Math.floor(Math.random() * source.length)]
  }

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
        running.set(s.driverId, (running.get(s.driverId) ?? 0) + drawPoints(s.driverId))
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

/** Blended pace for projecting remaining-season points: 60% last-3-races average + 40%
 *  season average, shrunk toward `leagueAveragePace` (see leagueAveragePacePerRound) in
 *  proportion to how many races this driver has actually run — bridges the gap for a
 *  rookie or a mid-season replacement driver instead of projecting them at 0. */
export function computePace(history: DriverHistoryEntry[], driverId: string, leagueAveragePace = 0): number {
  const raceRows = history
    .filter((r) => r.result_kind === 'race' && r.driver_id === driverId)
    .sort((a, b) => (a.events?.round ?? 0) - (b.events?.round ?? 0))
  if (raceRows.length === 0) return leagueAveragePace
  const points = raceRows.map((r) => r.points ?? 0)
  const raw = average(points.slice(-3)) * 0.6 + average(points) * 0.4
  return shrinkTowardPrior(raw, raceRows.length, FACTOR_PRIOR_STRENGTH, leagueAveragePace)
}
