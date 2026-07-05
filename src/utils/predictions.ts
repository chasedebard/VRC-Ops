import type { DriverHistoryRow } from '@/types/database'

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
  seasonHistory: DriverHistoryRow[],
  currentTrackId: string | null,
): DriverFactorInputs {
  const raceRows = seasonHistory
    .filter((r) => r.result_kind === 'race' && r.driver_id === driverId)
    .sort((a, b) => (a.saved_at ?? '').localeCompare(b.saved_at ?? ''))

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
