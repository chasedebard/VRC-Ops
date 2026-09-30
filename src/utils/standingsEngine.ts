import type { EventRow, RaceResultStatus, ScoringOutputRow } from '@/types/database'

/**
 * Pure standings engine — a TypeScript port of the iOS standings stack (VRCScoringEngine.swift, VRCSubSeriesStandings.swift,
 * VRCSeriesOutcome.swift, VRCStandingsPresentation.swift, VRCStandingAwards.swift in vrc-platform). Nothing here touches the
 * network. Points always come from the persisted Official `scoring_outputs`; this module only re-groups them, applies drop
 * rounds, and bounds what could still be awarded to decide Out / Clinched / Champion / Tied for one series.
 *
 * Like iOS, standings are computed on load from `scoring_outputs` (not read back from stale snapshots) so Overall, every Class
 * and every Region mean the same thing, and the same function feeds the saved snapshots and the series-award sync.
 */

// ---- Scoring config ---------------------------------------------------------------------------

export interface StandingsScoringConfig {
  positionPoints: number[]
  poleBonus: number
  fastestLapBonus: number
  participationPoints: number
  dropRounds: number
}

export const RFS_DEFAULT_CONFIG: StandingsScoringConfig = {
  positionPoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
  poleBonus: 1,
  fastestLapBonus: 1,
  participationPoints: 0,
  dropRounds: 0,
}

/** Most points one driver can still add in one event: best finish + both bonuses + participation. */
export function maxEventPoints(config: StandingsScoringConfig): number {
  return Math.max(0, ...config.positionPoints) + config.poleBonus + config.fastestLapBonus + config.participationPoints
}

/** One driver's scored line for one event (the shape persisted in `scoring_outputs`). */
export interface EventScore {
  driverId: string
  earnedPoints: number
  adjustmentPoints: number
  totalPoints: number
  finishPosition: number | null
  status: RaceResultStatus
  earnedPole: boolean
  fastestLap: boolean
  classId: string | null
  regionId: string | null
  teamId: string | null
}

export interface SeriesEventScores {
  eventId: string
  round: number
  scores: EventScore[]
}

/** `scoring_outputs` row → EventScore. Class/region/team explicitly stored on the output always win; older rows fall back to the event, then the season roster. */
export function eventScoreFromOutput(
  output: Pick<
    ScoringOutputRow,
    | 'driver_id'
    | 'earned_points'
    | 'adjustment_points'
    | 'total_points'
    | 'finish_position'
    | 'status'
    | 'earned_pole'
    | 'fastest_lap'
    | 'class_id'
    | 'region_id'
    | 'team_id'
  >,
  event: Pick<EventRow, 'class_id' | 'region_id'> | undefined,
  rosterAssignment: { class_id: string | null; region_id: string | null; team_id: string | null } | undefined,
): EventScore {
  return {
    driverId: output.driver_id,
    earnedPoints: output.earned_points,
    adjustmentPoints: output.adjustment_points,
    totalPoints: output.total_points,
    finishPosition: output.finish_position,
    status: ((output.status as RaceResultStatus | null) ?? 'fin') as RaceResultStatus,
    earnedPole: output.earned_pole,
    fastestLap: output.fastest_lap,
    classId: output.class_id ?? event?.class_id ?? rosterAssignment?.class_id ?? null,
    regionId: output.region_id ?? event?.region_id ?? rosterAssignment?.region_id ?? null,
    teamId: output.team_id ?? rosterAssignment?.team_id ?? null,
  }
}

// ---- Standings rows ---------------------------------------------------------------------------

export type SubSeriesStatus = 'active' | 'out' | 'clinched' | 'champion' | 'tied'

export interface StandingRow {
  driverId: string | null
  teamId: string | null
  name: string
  number: string
  position: number
  /** Points that count toward the championship (after drop rounds). */
  points: number
  /** Gross points before drop rounds. */
  grossPoints: number
  droppedRounds: number
  wins: number
  seconds: number
  thirds: number
  podiums: number
  poles: number
  fastestLaps: number
  starts: number
  averageFinish: number | null
  clinched: boolean
  eliminated: boolean
  /** Set on Overall / Region / Class rows by the series evaluator; null for team standings. */
  subSeriesStatus: SubSeriesStatus | null
}

export interface DriverInfo {
  name: string
  number: string
}

const didStart = (status: RaceResultStatus): boolean => status !== 'dns'

/** Drop the N lowest event totals. Returns the counted points and how many rounds were dropped. */
export function applyDropRounds(totals: number[], dropRounds: number): { counted: number; dropped: number } {
  const sum = totals.reduce((a, b) => a + b, 0)
  if (dropRounds <= 0 || totals.length <= dropRounds) return { counted: sum, dropped: 0 }
  const dropped = [...totals].sort((a, b) => a - b).slice(0, dropRounds)
  return { counted: sum - dropped.reduce((a, b) => a + b, 0), dropped: dropped.length }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Tie-break order: points → wins → seconds → thirds → poles → fastest laps → name. */
function tieBreak(a: StandingRow, b: StandingRow): number {
  return (
    b.points - a.points ||
    b.wins - a.wins ||
    b.seconds - a.seconds ||
    b.thirds - a.thirds ||
    b.poles - a.poles ||
    b.fastestLaps - a.fastestLaps ||
    collator.compare(a.name, b.name)
  )
}

function blankRow(): StandingRow {
  return {
    driverId: null,
    teamId: null,
    name: '',
    number: '',
    position: 0,
    points: 0,
    grossPoints: 0,
    droppedRounds: 0,
    wins: 0,
    seconds: 0,
    thirds: 0,
    podiums: 0,
    poles: 0,
    fastestLaps: 0,
    starts: 0,
    averageFinish: null,
    clinched: false,
    eliminated: false,
    subSeriesStatus: null,
  }
}

/** Ranked driver rows (positions set, no clinch/elimination yet) plus each driver's per-event totals for drop-round projections. */
export function rankedDriverRows(
  eventScores: EventScore[][],
  driverInfo: Map<string, DriverInfo>,
  config: StandingsScoringConfig,
  filter: (score: EventScore) => boolean = () => true,
): { rows: StandingRow[]; totals: Map<string, number[]> } {
  const byDriver = new Map<string, EventScore[]>()
  for (const event of eventScores) {
    for (const score of event) {
      if (!filter(score)) continue
      byDriver.set(score.driverId, [...(byDriver.get(score.driverId) ?? []), score])
    }
  }

  const rows: StandingRow[] = []
  const totals = new Map<string, number[]>()
  for (const [driverId, scores] of byDriver) {
    const eventTotals = scores.map((s) => s.totalPoints)
    totals.set(driverId, eventTotals)
    const gross = eventTotals.reduce((a, b) => a + b, 0)
    const { counted, dropped } = applyDropRounds(eventTotals, config.dropRounds)
    const finishes = scores
      .filter((s) => s.status === 'fin' && s.finishPosition != null && s.finishPosition > 0)
      .map((s) => s.finishPosition as number)
    const info = driverInfo.get(driverId)
    const fin = (s: EventScore, pos: number) => s.status === 'fin' && s.finishPosition === pos
    rows.push({
      ...blankRow(),
      driverId,
      name: info?.name ?? `Driver ${driverId.slice(0, 4)}`,
      number: info?.number ?? '',
      points: counted,
      grossPoints: gross,
      droppedRounds: dropped,
      wins: scores.filter((s) => fin(s, 1)).length,
      seconds: scores.filter((s) => fin(s, 2)).length,
      thirds: scores.filter((s) => fin(s, 3)).length,
      podiums: scores.filter((s) => s.status === 'fin' && (s.finishPosition ?? 99) >= 1 && (s.finishPosition ?? 99) <= 3).length,
      poles: scores.filter((s) => s.earnedPole && s.status !== 'dns' && s.status !== 'dsq').length,
      fastestLaps: scores.filter((s) => s.fastestLap && s.status === 'fin').length,
      starts: scores.filter((s) => didStart(s.status)).length,
      averageFinish: finishes.length > 0 ? finishes.reduce((a, b) => a + b, 0) / finishes.length : null,
    })
  }
  rows.sort(tieBreak)
  rows.forEach((row, index) => {
    row.position = index + 1
  })
  return { rows, totals }
}

/** Team standings: the sum of members' counted points. Clinch/elimination is not computed for teams. */
export function teamStandings(eventScores: EventScore[][], teamInfo: Map<string, string>): StandingRow[] {
  const byTeam = new Map<string, EventScore[]>()
  for (const event of eventScores) {
    for (const score of event) {
      if (!score.teamId) continue
      byTeam.set(score.teamId, [...(byTeam.get(score.teamId) ?? []), score])
    }
  }
  const rows: StandingRow[] = []
  for (const [teamId, scores] of byTeam) {
    const points = scores.reduce((sum, s) => sum + s.totalPoints, 0)
    rows.push({
      ...blankRow(),
      teamId,
      name: teamInfo.get(teamId) ?? `Team ${teamId.slice(0, 4)}`,
      points,
      grossPoints: points,
      wins: scores.filter((s) => s.status === 'fin' && s.finishPosition === 1).length,
      seconds: scores.filter((s) => s.status === 'fin' && s.finishPosition === 2).length,
      thirds: scores.filter((s) => s.status === 'fin' && s.finishPosition === 3).length,
      podiums: scores.filter((s) => s.status === 'fin' && (s.finishPosition ?? 99) >= 1 && (s.finishPosition ?? 99) <= 3).length,
      poles: scores.filter((s) => s.earnedPole && s.status !== 'dns' && s.status !== 'dsq').length,
      fastestLaps: scores.filter((s) => s.fastestLap && s.status === 'fin').length,
      starts: scores.filter((s) => didStart(s.status)).length,
    })
  }
  rows.sort(tieBreak)
  rows.forEach((row, index) => {
    row.position = index + 1
  })
  return rows
}

/** Position movement vs a previous standings (positive = gained places). Keys are driver ids, else team ids. */
export function standingsMovement(current: StandingRow[], previous: StandingRow[]): Map<string, number> {
  const key = (r: StandingRow) => r.driverId ?? r.teamId ?? r.name
  const before = new Map(previous.map((r) => [key(r), r.position]))
  const moves = new Map<string, number>()
  for (const row of current) {
    const was = before.get(key(row))
    if (was !== undefined) moves.set(key(row), was - row.position)
  }
  return moves
}

// ---- Sub-series (Overall / Class / Region) evaluator -----------------------------------------

export interface SubSeriesContext {
  /** Events that belong to this series and are not officially completed. */
  remainingEventCount: number
  /** Drivers who may still score in those events (the active season roster). */
  eligibleDriverIds: Set<string>
}

const isComplete = (ctx: SubSeriesContext) => ctx.remainingEventCount === 0

interface Outlook {
  points: number
  wins: number
  seconds: number
  thirds: number
  poles: number
  fastestLaps: number
}

type Outcome = 'ahead' | 'tied' | 'behind'

/** The standings tie-break minus the final alphabetical-name step: a dead heat stays `tied` instead of inventing a winner. */
function compareOutlooks(l: Outlook, r: Outlook): Outcome {
  const pairs: [number, number][] = [
    [l.points, r.points],
    [l.wins, r.wins],
    [l.seconds, r.seconds],
    [l.thirds, r.thirds],
    [l.poles, r.poles],
    [l.fastestLaps, r.fastestLaps],
  ]
  for (const [a, b] of pairs) if (a !== b) return a > b ? 'ahead' : 'behind'
  return 'tied'
}

/** Best case: the driver wins every remaining event they can enter, with pole and fastest lap. */
function bestOutlook(current: Outlook, totals: number[], remaining: number, config: StandingsScoringConfig): Outlook {
  if (remaining <= 0) return current
  const projected = applyDropRounds([...totals, ...Array(remaining).fill(maxEventPoints(config))], config.dropRounds).counted
  return {
    points: Math.max(current.points, projected),
    wins: current.wins + remaining,
    seconds: current.seconds,
    thirds: current.thirds,
    poles: current.poles + remaining,
    fastestLaps: current.fastestLaps + remaining,
  }
}

/** Worst case: the driver scores nothing in the remaining events (with drop rounds a zero can still lower a total). */
function worstOutlook(current: Outlook, totals: number[], remaining: number, config: StandingsScoringConfig): Outlook {
  let lowest = current.points
  const padded = [...totals]
  for (let i = 0; i < Math.max(remaining, 0); i++) {
    padded.push(0)
    lowest = Math.min(lowest, applyDropRounds(padded, config.dropRounds).counted)
  }
  return { ...current, points: lowest }
}

/**
 * Stamps every row with its series status (and the legacy `clinched` / `eliminated` flags that published snapshots carry).
 * Out ⇔ some opponent's worst case already beats this driver's best case; Clinched ⇔ this driver's worst case beats every
 * other best case (including an unscored active-roster driver). A complete series turns Clinched into Champion, and a dead
 * heat for first into Tied. See docs/SUBSERIES_ELIMINATION_PARITY.md in vrc-platform for the contract.
 */
export function applySubSeriesStatus(
  rows: StandingRow[],
  eventTotals: Map<string, number[]>,
  context: SubSeriesContext,
  config: StandingsScoringConfig,
): StandingRow[] {
  if (rows.length === 0) return rows

  const bounds = rows.map((row) => {
    const current: Outlook = {
      points: row.points,
      wins: row.wins,
      seconds: row.seconds,
      thirds: row.thirds,
      poles: row.poles,
      fastestLaps: row.fastestLaps,
    }
    const totals = row.driverId ? (eventTotals.get(row.driverId) ?? []) : []
    const eligible = row.driverId ? context.eligibleDriverIds.has(row.driverId) : false
    const remaining = eligible ? context.remainingEventCount : 0
    return {
      best: bestOutlook(current, totals, remaining, config),
      worst: worstOutlook(current, totals, remaining, config),
    }
  })

  const rowDriverIds = new Set(rows.map((r) => r.driverId).filter((id): id is string => Boolean(id)))
  const hasUnscoredEligibleDriver =
    context.remainingEventCount > 0 && Array.from(context.eligibleDriverIds).some((id) => !rowDriverIds.has(id))
  const unscoredBest = hasUnscoredEligibleDriver
    ? bestOutlook(
        { points: 0, wins: 0, seconds: 0, thirds: 0, poles: 0, fastestLaps: 0 },
        [],
        context.remainingEventCount,
        config,
      )
    : null

  return rows.map((row, index) => {
    const others = rows.map((_, i) => i).filter((i) => i !== index)
    const isOut = others.some((i) => compareOutlooks(bounds[index].best, bounds[i].worst) === 'behind')
    const isClinched =
      !isOut &&
      others.every((i) => compareOutlooks(bounds[index].worst, bounds[i].best) === 'ahead') &&
      (unscoredBest ? compareOutlooks(bounds[index].worst, unscoredBest) === 'ahead' : true)

    let status: SubSeriesStatus
    if (isOut) status = 'out'
    else if (isClinched) status = isComplete(context) ? 'champion' : 'clinched'
    else if (isComplete(context)) status = 'tied'
    else status = 'active'

    return {
      ...row,
      subSeriesStatus: status,
      clinched: status === 'clinched' || status === 'champion',
      eliminated: status === 'out',
    }
  })
}

export function subSeriesStandings(
  eventScores: EventScore[][],
  driverInfo: Map<string, DriverInfo>,
  config: StandingsScoringConfig,
  context: SubSeriesContext,
  filter: (score: EventScore) => boolean,
): StandingRow[] {
  const { rows, totals } = rankedDriverRows(eventScores, driverInfo, config, filter)
  return applySubSeriesStatus(rows, totals, context, config)
}

// ---- Schedule → contexts ----------------------------------------------------------------------

export type SeriesScope = 'overall' | 'class' | 'region'

export interface SeriesKey {
  scope: SeriesScope
  scopeId: string | null
}

export const OVERALL_SERIES: SeriesKey = { scope: 'overall', scopeId: null }
export const classSeries = (id: string): SeriesKey => ({ scope: 'class', scopeId: id })
export const regionSeries = (id: string): SeriesKey => ({ scope: 'region', scopeId: id })
export const seriesKeyId = (key: SeriesKey): string => `${key.scope}:${key.scopeId ?? ''}`

type PlannerEvent = Pick<EventRow, 'id' | 'status' | 'region_id' | 'class_id' | 'round'>

/**
 * Works out, per Region and per Class, which scheduled events can still add points. An event is officially completed once it
 * has persisted Official scoring outputs or a finalized race result set — never inferred from `events.status` or its date
 * (production has `scheduled` events that hold finalized results). Draft, cancelled, archived and completed events never
 * count as remaining.
 */
export class SubSeriesPlanner {
  readonly remainingEvents: PlannerEvent[]
  /** `null` when the event-classes lookup failed: class membership is unknown so every remaining event counts for every class. */
  readonly eventClassIds: Map<string, string[]> | null
  readonly eligibleDriverIds: Set<string>
  /** False when a best-effort lookup failed and remaining counts are deliberately over-inclusive — never used to award or revoke. */
  readonly isReliable: boolean

  constructor(args: {
    seasonEvents: PlannerEvent[]
    officialEventIds: Set<string>
    eventClassIds: Map<string, string[]> | null
    eligibleDriverIds: Set<string>
    isReliable?: boolean
  }) {
    this.remainingEvents = SubSeriesPlanner.unfinishedEvents(args.seasonEvents, args.officialEventIds)
    this.eventClassIds = args.eventClassIds
    this.eligibleDriverIds = args.eligibleDriverIds
    this.isReliable = args.isReliable ?? true
  }

  static officialEventIds(scoringOutputEventIds: Set<string>, raceResultSets: { event_id: string; state: string }[]): Set<string> {
    const official = new Set(scoringOutputEventIds)
    for (const set of raceResultSets) if (set.state === 'finalized') official.add(set.event_id)
    return official
  }

  static unfinishedEvents(events: PlannerEvent[], officialEventIds: Set<string>): PlannerEvent[] {
    return events.filter(
      (e) => (e.status === 'scheduled' || e.status === 'live' || e.status === 'postponed') && !officialEventIds.has(e.id),
    )
  }

  overallContext(): SubSeriesContext {
    return { remainingEventCount: this.remainingEvents.length, eligibleDriverIds: this.eligibleDriverIds }
  }

  regionContext(regionId: string): SubSeriesContext {
    return {
      remainingEventCount: this.remainingEvents.filter((e) => e.region_id === regionId).length,
      eligibleDriverIds: this.eligibleDriverIds,
    }
  }

  classContext(classId: string): SubSeriesContext {
    return {
      remainingEventCount: this.remainingEvents.filter((e) => this.belongsToClass(e, classId)).length,
      eligibleDriverIds: this.eligibleDriverIds,
    }
  }

  private belongsToClass(event: PlannerEvent, classId: string): boolean {
    // Unknown class membership: over-count rather than risk declaring a class finished.
    if (!this.eventClassIds) return true
    const classes = this.eventClassIds.get(event.id)
    if (classes && classes.length > 0) return classes.includes(classId)
    return event.class_id === classId
  }
}

// ---- Series standings + outcome ----------------------------------------------------------------

export function seriesFilter(key: SeriesKey): (score: EventScore) => boolean {
  switch (key.scope) {
    case 'overall':
      return () => true
    case 'class':
      return (s) => s.classId === key.scopeId
    case 'region':
      return (s) => s.regionId === key.scopeId
  }
}

export function seriesContext(key: SeriesKey, planner: SubSeriesPlanner): SubSeriesContext {
  if (key.scope === 'class' && key.scopeId) return planner.classContext(key.scopeId)
  if (key.scope === 'region' && key.scopeId) return planner.regionContext(key.scopeId)
  return planner.overallContext()
}

export function seriesRows(args: {
  key: SeriesKey
  events: SeriesEventScores[]
  driverInfo: Map<string, DriverInfo>
  config: StandingsScoringConfig
  planner: SubSeriesPlanner
}): StandingRow[] {
  return subSeriesStandings(
    args.events.map((e) => e.scores),
    args.driverInfo,
    args.config,
    seriesContext(args.key, args.planner),
    seriesFilter(args.key),
  )
}

export type OutcomeKind = 'clinched' | 'champion' | 'tied'

export interface SeriesOutcome {
  key: SeriesKey
  /** The exact championship / class / region name. */
  seriesName: string
  kind: OutcomeKind
  /** The sole winner for clinched/champion; every driver level for first for tied. */
  leaders: StandingRow[]
  securedRound: number | null
  securedEventId: string | null
  remainingEvents: number
}

export const outcomeWinner = (o: SeriesOutcome): StandingRow | null => (o.kind === 'tied' ? null : (o.leaders[0] ?? null))

export function outcomeTitle(o: SeriesOutcome): string {
  switch (o.kind) {
    case 'clinched':
      return `${o.seriesName} Clinched`
    case 'champion':
      return `${o.seriesName} Champion`
    case 'tied':
      return `${o.seriesName} Tied`
  }
}

export function outcomeStatusLine(o: SeriesOutcome): string {
  const events = `${o.remainingEvents} ${o.remainingEvents === 1 ? 'event' : 'events'}`
  switch (o.kind) {
    case 'clinched':
      return `${o.securedRound != null ? `Clinched after Round ${o.securedRound}` : 'Clinched'} · ${events} remaining`
    case 'champion':
      return `${o.securedRound != null ? `Secured after Round ${o.securedRound}` : 'Champion'} · Series complete`
    case 'tied':
      return 'Level on points and every tie-break · Series complete'
  }
}

export function outcomeTrophyLabel(o: SeriesOutcome): string {
  return o.kind === 'clinched' ? `Clinched ${o.seriesName}` : `${o.seriesName} Champion`
}

/**
 * The earliest scored round after which `winnerId` was — and stayed — Clinched, found by re-running the same evaluator over the
 * standings as they stood after each round (the series' later scored events count as still remaining at that point).
 */
export function securedPoint(args: {
  winnerId: string
  key: SeriesKey
  events: SeriesEventScores[]
  driverInfo: Map<string, DriverInfo>
  config: StandingsScoringConfig
  planner: SubSeriesPlanner
}): { round: number; eventId: string } | null {
  const scopeFilter = seriesFilter(args.key)
  const ordered = [...args.events].sort((a, b) => a.round - b.round || a.eventId.localeCompare(b.eventId))
  const scoped = ordered.filter((e) => e.scores.some(scopeFilter))
  if (scoped.length === 0) return null
  const now = seriesContext(args.key, args.planner)

  const heldTitle = scoped.map((event, index) => {
    const prefix = ordered.filter((e) => e.round <= event.round)
    const context: SubSeriesContext = {
      remainingEventCount: now.remainingEventCount + (scoped.length - 1 - index),
      eligibleDriverIds: now.eligibleDriverIds,
    }
    const rows = subSeriesStandings(
      prefix.map((e) => e.scores),
      args.driverInfo,
      args.config,
      context,
      scopeFilter,
    )
    const status = rows.find((r) => r.driverId === args.winnerId)?.subSeriesStatus
    return status === 'clinched' || status === 'champion'
  })
  if (heldTitle[heldTitle.length - 1] !== true) return null
  let earliest = heldTitle.length - 1
  while (earliest > 0 && heldTitle[earliest - 1]) earliest -= 1
  return { round: scoped[earliest].round, eventId: scoped[earliest].eventId }
}

/** The outcome to announce for `rows` (this series' standings), or null while the series is simply still open. */
export function seriesOutcome(args: {
  key: SeriesKey
  name: string
  rows: StandingRow[]
  events: SeriesEventScores[]
  driverInfo: Map<string, DriverInfo>
  config: StandingsScoringConfig
  planner: SubSeriesPlanner
}): SeriesOutcome | null {
  const remaining = seriesContext(args.key, args.planner).remainingEventCount
  const winner = args.rows.find((r) => r.subSeriesStatus === 'clinched' || r.subSeriesStatus === 'champion')
  if (winner?.driverId) {
    const secured = securedPoint({
      winnerId: winner.driverId,
      key: args.key,
      events: args.events,
      driverInfo: args.driverInfo,
      config: args.config,
      planner: args.planner,
    })
    return {
      key: args.key,
      seriesName: args.name,
      kind: winner.subSeriesStatus === 'champion' ? 'champion' : 'clinched',
      leaders: [winner],
      securedRound: secured?.round ?? null,
      securedEventId: secured?.eventId ?? null,
      remainingEvents: remaining,
    }
  }
  const tied = args.rows.filter((r) => r.subSeriesStatus === 'tied')
  if (tied.length > 1) {
    return {
      key: args.key,
      seriesName: args.name,
      kind: 'tied',
      leaders: tied,
      securedRound: null,
      securedEventId: null,
      remainingEvents: remaining,
    }
  }
  return null
}

// ---- Row markers (presentation rules) ----------------------------------------------------------

export type StandingRowMarker = 'none' | 'trophy' | 'out' | 'tied'

/**
 * The single Out-visibility rule for every standings screen, decided by the *selected series'* authoritative outcome, never
 * by the driver alone: open / unresolved / tied series show Out indicators; a Clinched or Champion series (whose summary card
 * names the winner) shows no Out indicator on any row.
 */
export function showsOutIndicators(outcome: SeriesOutcome | null): boolean {
  return outcome === null || outcome.kind === 'tied'
}

export function standingRowMarker(row: StandingRow, outcome: SeriesOutcome | null): StandingRowMarker {
  const status = row.subSeriesStatus
  if (!status) return 'none'
  if (status === 'out') return showsOutIndicators(outcome) ? 'out' : 'none'
  if (outcome?.kind === 'clinched' && status === 'clinched') return 'trophy'
  if (outcome?.kind === 'champion' && status === 'champion') return 'trophy'
  if (outcome?.kind === 'tied' && status === 'tied') return 'tied'
  return 'none'
}

export function markerAccessibilityPhrase(marker: StandingRowMarker, outcome: SeriesOutcome | null, seriesName: string): string | null {
  switch (marker) {
    case 'none':
      return null
    case 'trophy':
      return outcome ? outcomeTrophyLabel(outcome) : `${seriesName} Champion`
    case 'out':
      return `Out of ${seriesName}`
    case 'tied':
      return `Tied for first in ${seriesName}`
  }
}

export const standingNameLabel = (row: StandingRow): string => (row.number ? `#${row.number} ${row.name}` : row.name)
export const standingPointsLabel = (points: number): string => `${points} ${points === 1 ? 'point' : 'points'}`

// ---- Award claims + reconciliation -------------------------------------------------------------

/** One series' state as reported to `vrc_sync_series_awards`; the server re-verifies it against official points and the schedule. */
export interface SeriesAwardClaim {
  scope: SeriesScope
  scope_id: string | null
  /** `active` | `clinched` | `champion` | `tied` */
  status: 'active' | 'clinched' | 'champion' | 'tied'
  driver_id: string | null
  clinched_event_id: string | null
}

export function awardClaim(key: SeriesKey, outcome: SeriesOutcome | null): SeriesAwardClaim {
  if (!outcome) {
    return { scope: key.scope, scope_id: key.scopeId, status: 'active', driver_id: null, clinched_event_id: null }
  }
  if (outcome.kind === 'tied') {
    return { scope: key.scope, scope_id: key.scopeId, status: 'tied', driver_id: null, clinched_event_id: null }
  }
  return {
    scope: key.scope,
    scope_id: key.scopeId,
    status: outcome.kind,
    driver_id: outcomeWinner(outcome)?.driverId ?? null,
    clinched_event_id: outcome.securedEventId,
  }
}

export interface LiveAward {
  scope: SeriesScope | string
  scope_id: string | null
  driver_id: string
  status: string
}

/** Only the claims whose state differs from the live ledger need a server round trip. */
export function claimsNeedingSync(claims: SeriesAwardClaim[], liveAwards: LiveAward[]): SeriesAwardClaim[] {
  const isLive = (a: LiveAward) => a.status === 'clinched' || a.status === 'champion'
  return claims.filter((claim) => {
    const live = liveAwards.find((a) => isLive(a) && a.scope === claim.scope && (a.scope_id ?? null) === (claim.scope_id ?? null))
    if (claim.status === 'clinched' || claim.status === 'champion') {
      if (!live) return true
      return live.driver_id !== claim.driver_id || live.status !== claim.status
    }
    return live !== undefined
  })
}
