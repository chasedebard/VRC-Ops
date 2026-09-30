import {
  CHAMPIONSHIP_CATEGORY,
  RACE_CATEGORY,
  isRaceMarket,
  type PredictionConfidence,
  type PredictionEntry,
  type PredictionEventReview,
  type PredictionMarketKey,
  type PredictionMarketResult,
  type PredictionMarketReview,
  type PredictionOutcome,
  type PredictionSet,
  type StoredPredictionEvaluation,
  type StoredPredictionRun,
} from '@/types/predictions'

/**
 * Pure presentation logic for the Predictions screen — a port of the read-side helpers in iOS
 * `VRCPredictionsHubStore` (movement, top story, spotlight, accuracy review). None of this calculates odds: every
 * probability shown comes straight from a stored, server-computed `prediction_runs` payload.
 */

export function percentText(probability: number): string {
  const percent = probability * 100
  if (percent > 0 && percent < 1) return '<1%'
  if (percent > 99 && percent < 100) return '>99%'
  return `${Math.round(percent)}%`
}

const RACE_MARKET_PRIORITY: Record<PredictionMarketKey, number> = {
  pole: 0,
  fastest_lap: 1,
  podium: 2,
  race_win: 3,
  championship: 4,
  class_championship: 4,
  region_championship: 4,
}

/** Display order for race markets (pole → fastest lap → podium → winner), matching iOS `orderedRaceMarkets`. */
export function orderedRaceMarkets(markets: PredictionMarketResult[]): PredictionMarketResult[] {
  return [...markets].sort((a, b) => RACE_MARKET_PRIORITY[a.market] - RACE_MARKET_PRIORITY[b.market])
}

export function findMarket(
  set: PredictionSet | null | undefined,
  market: PredictionMarketKey,
  groupId: string | null = null,
): PredictionMarketResult | null {
  return set?.markets.find((m) => m.market === market && (m.group_id ?? null) === groupId) ?? null
}

export interface PredictionMovement {
  driverId: string
  driverName: string
  currentProbability: number
  previousProbability: number
  delta: number
}

/**
 * Championship win-probability movement between the current run and the newest stored run with *different* inputs
 * (a changed `source_signature`). Moves under half a percentage point are noise and are dropped.
 */
export function buildMovement(
  current: PredictionSet,
  storedRuns: StoredPredictionRun[],
  currentSignature: string,
): PredictionMovement[] {
  const currentMarket = findMarket(current, 'championship')
  if (!currentMarket) return []
  const previous = storedRuns.find(
    (run) =>
      run.category === CHAMPIONSHIP_CATEGORY &&
      run.source_signature !== currentSignature &&
      findMarket(run.payload, 'championship') !== null,
  )
  const previousMarket = findMarket(previous?.payload, 'championship')
  if (!previousMarket) return []
  const before = new Map(previousMarket.entries.map((e) => [e.driver_id, e.probability]))
  const moves: PredictionMovement[] = []
  for (const entry of currentMarket.entries) {
    const prior = before.get(entry.driver_id)
    if (prior === undefined) continue
    const delta = entry.probability - prior
    if (Math.abs(delta) < 0.005) continue
    moves.push({
      driverId: entry.driver_id,
      driverName: entry.driver_name,
      currentProbability: entry.probability,
      previousProbability: prior,
      delta,
    })
  }
  return moves.sort((a, b) =>
    Math.abs(a.delta) !== Math.abs(b.delta) ? Math.abs(b.delta) - Math.abs(a.delta) : a.driverId.localeCompare(b.driverId),
  )
}

/**
 * The most recent stored probability for this exact market/driver from a run with *different* inputs — the "before"
 * value for a "predictions evolving through the weekend" delta. Null when there is no earlier comparable run.
 */
export function previousProbability(args: {
  market: PredictionMarketKey
  driverId: string
  groupId?: string | null
  eventId: string | null
  storedRuns: StoredPredictionRun[]
  currentSignature: string
}): number | null {
  const category = isRaceMarket(args.market) ? RACE_CATEGORY : CHAMPIONSHIP_CATEGORY
  const previous = args.storedRuns.find(
    (run) =>
      run.category === category &&
      run.source_signature !== args.currentSignature &&
      (run.event_id ?? null) === args.eventId &&
      findMarket(run.payload, args.market, args.groupId ?? null) !== null,
  )
  const market = findMarket(previous?.payload, args.market, args.groupId ?? null)
  return market?.entries.find((e) => e.driver_id === args.driverId)?.probability ?? null
}

export interface PredictionTopStory {
  title: string
  subjectName: string
  probability: number
  confidence: PredictionConfidence
  reasons: string[]
  contextLine: string
}

const plural = (n: number) => `${n} round${n === 1 ? '' : 's'}`

/** Deterministic Top Story chosen from the freshest prediction sets (no randomness). */
export function buildTopStory(args: {
  race: PredictionSet | null
  championship: PredictionSet | null
  eventTitle: string | null
  remaining: number
}): PredictionTopStory | null {
  const champFavorite = findMarket(args.championship, 'championship')?.entries[0] ?? null
  if (champFavorite && champFavorite.probability >= 0.75 && args.remaining > 0) {
    return {
      title: 'Closing in on the title',
      subjectName: champFavorite.driver_name,
      probability: champFavorite.probability,
      confidence: champFavorite.confidence,
      reasons: champFavorite.reasons,
      contextLine: `${plural(args.remaining)} remaining`,
    }
  }
  const winner = findMarket(args.race, 'race_win')
  const favorite = winner?.entries[0]
  if (winner && favorite) {
    const runnerUp = winner.entries[1]
    const isClose = runnerUp ? favorite.probability - runnerUp.probability < 0.08 : false
    return {
      title: isClose ? 'Tight battle for the win' : 'Favorite for the next race',
      subjectName: favorite.driver_name,
      probability: favorite.probability,
      confidence: favorite.confidence,
      reasons: favorite.reasons,
      contextLine: args.eventTitle ?? 'Next race',
    }
  }
  if (champFavorite) {
    return {
      title: args.remaining === 0 ? 'Championship decided' : 'Championship favorite',
      subjectName: champFavorite.driver_name,
      probability: champFavorite.probability,
      confidence: champFavorite.confidence,
      reasons: champFavorite.reasons,
      contextLine: args.remaining === 0 ? 'Season complete' : `${plural(args.remaining)} remaining`,
    }
  }
  return null
}

export interface PredictionSpotlight {
  driverId: string
  driverName: string
  bestMarket: PredictionMarketKey
  bestProbability: number
  weakestMarket: PredictionMarketKey
  weakestProbability: number
  raceOutlook: string
  championshipOutlook: string
  trend: string
}

/** One driver's cross-market profile: the driver with the highest combined probability mass. */
export function buildSpotlight(args: {
  race: PredictionSet | null
  championship: PredictionSet | null
  movement: PredictionMovement[]
}): PredictionSpotlight | null {
  const perDriver = new Map<string, { name: string; markets: { market: PredictionMarketKey; probability: number }[] }>()
  const allMarkets = [
    ...(args.race?.markets ?? []),
    ...(args.championship?.markets.filter((m) => m.group_id == null) ?? []),
  ]
  for (const market of allMarkets) {
    for (const entry of market.entries) {
      const row = perDriver.get(entry.driver_id) ?? { name: entry.driver_name, markets: [] }
      row.markets.push({ market: market.market, probability: entry.probability })
      perDriver.set(entry.driver_id, row)
    }
  }
  let focus: [string, { name: string; markets: { market: PredictionMarketKey; probability: number }[] }] | null = null
  let focusMass = -1
  for (const candidate of perDriver) {
    const mass = candidate[1].markets.reduce((sum, m) => sum + m.probability, 0)
    if (mass > focusMass || (mass === focusMass && focus && candidate[0] < focus[0])) {
      focus = candidate
      focusMass = mass
    }
  }
  if (!focus) return null
  const markets = [...focus[1].markets].sort((a, b) =>
    a.probability !== b.probability ? b.probability - a.probability : a.market.localeCompare(b.market),
  )
  const best = markets[0]
  const weakest = markets[markets.length - 1]
  const win = focus[1].markets.find((m) => m.market === 'race_win')?.probability
  const podium = focus[1].markets.find((m) => m.market === 'podium')?.probability
  const champ = focus[1].markets.find((m) => m.market === 'championship')?.probability
  const raceOutlook =
    win !== undefined && podium !== undefined
      ? `Win ${percentText(win)} · podium ${percentText(podium)} next race`
      : 'No upcoming race markets yet'
  const championshipOutlook = champ !== undefined ? `Title chance ${percentText(champ)}` : 'No championship line yet'
  const move = args.movement.find((m) => m.driverId === focus[0])
  const trend = move
    ? `Title odds ${move.delta > 0 ? 'up' : 'down'} ${percentText(Math.abs(move.delta))} since the last update`
    : 'Steady since the last update'
  return {
    driverId: focus[0],
    driverName: focus[1].name,
    bestMarket: best.market,
    bestProbability: best.probability,
    weakestMarket: weakest.market,
    weakestProbability: weakest.probability,
    raceOutlook,
    championshipOutlook,
    trend,
  }
}

const VALID_MARKETS = new Set<string>([
  'pole',
  'fastest_lap',
  'race_win',
  'podium',
  'championship',
  'class_championship',
  'region_championship',
])

/**
 * Server-evaluated accuracy, reshaped for display. `summary` on each evaluation is already fully-formed text. The
 * outcome is a coarse hit/partial/miss reconstruction from hit/sample counts (the finer beat-odds split lived in a
 * probability field the table never stored) — it only affects which icon a review shows, never its text.
 */
export function resolveAccuracy(args: {
  events: { id: string; title: string }[]
  storedRuns: StoredPredictionRun[]
  evaluations: StoredPredictionEvaluation[]
  driverNames: Map<string, string>
  limit?: number
}): PredictionEventReview[] {
  const eventTitles = new Map(args.events.map((e) => [e.id, e.title]))
  const runsById = new Map(args.storedRuns.map((r) => [r.id, r]))
  const byEvent = new Map<string, StoredPredictionEvaluation[]>()
  for (const evaluation of args.evaluations) {
    if (!evaluation.event_id) continue
    byEvent.set(evaluation.event_id, [...(byEvent.get(evaluation.event_id) ?? []), evaluation])
  }
  const reviews: PredictionEventReview[] = []
  for (const [eventId, evaluations] of byEvent) {
    const marketReviews: PredictionMarketReview[] = []
    for (const evaluation of evaluations) {
      if (!VALID_MARKETS.has(evaluation.category)) continue
      const predictedId = evaluation.predicted_driver_ids[0]
      if (!predictedId) continue
      let outcome: PredictionOutcome
      if (evaluation.sample_count <= 0) outcome = 'miss'
      else if (evaluation.hit_count === evaluation.sample_count) outcome = 'hit'
      else if (evaluation.hit_count > 0) outcome = 'met_odds'
      else outcome = 'miss'
      marketReviews.push({
        market: evaluation.category as PredictionMarketKey,
        predictedDriverId: predictedId,
        predictedDriverName: args.driverNames.get(predictedId) ?? '—',
        actualDriverNames: evaluation.actual_driver_ids.map((id) => args.driverNames.get(id) ?? 'Driver'),
        outcome,
        summary: evaluation.summary ?? '',
        hitCount: evaluation.hit_count,
        sampleCount: evaluation.sample_count,
      })
    }
    if (marketReviews.length === 0) continue
    const matchedRun = evaluations.map((e) => (e.prediction_run_id ? runsById.get(e.prediction_run_id) : undefined)).find(Boolean)
    const latestEvaluated = evaluations.map((e) => e.evaluated_at).sort().at(-1) ?? ''
    reviews.push({
      eventId,
      eventTitle: eventTitles.get(eventId) ?? 'Round',
      phase: matchedRun?.payload?.phase ?? 'post_qualifying',
      generatedAt: matchedRun?.generated_at ?? latestEvaluated,
      reviews: marketReviews,
    })
  }
  return reviews.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)).slice(0, args.limit ?? 6)
}

export function favoriteOf(market: PredictionMarketResult | null): PredictionEntry | null {
  return market?.entries[0] ?? null
}
