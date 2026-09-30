import { eventDisplayTitle } from '@/utils/currentRace'
import type { DriverHistoryRow, EventRow, SeasonRow } from '@/types/database'

/**
 * Driver profile analytics — a pure port of iOS `VRCDriverStatsAggregator`, `VRCDriverCareerBuilder`, `VRCDriverMilestoneBuilder` and
 * `VRCDriverRecordsBuilder` plus the `VRCGlobalDriverProfileService` builders (recent form, trend label, track history, class strengths,
 * career summary, race log). They consume `driver_history` rows and event/season context only — no backend call, no randomness.
 *
 * What is deliberately NOT here: the telemetry-informed per-driver "rating" and class-strength score. iOS derives those with a client-side
 * calculator from practice telemetry; the website shows the durable, server-stored rating history (`driver_rating_records`) instead of
 * re-deriving a number it cannot fully reproduce.
 */

export type HistoryEntry = DriverHistoryRow
export type ResultStatusKey = 'fin' | 'dnf' | 'dns' | 'dsq' | 'classified' | string

export const statusOf = (entry: Pick<HistoryEntry, 'status'>): string => (entry.status ?? 'fin').toLowerCase()
/** Everything except DNS counts as a start (iOS `VRCResultStatus.didStart`). */
export const didStart = (entry: Pick<HistoryEntry, 'status'>): boolean => statusOf(entry) !== 'dns'
const isFinisher = (entry: HistoryEntry): boolean => statusOf(entry) === 'fin' && entry.finish_position !== null
const isPodiumFinish = (entry: HistoryEntry): boolean => isFinisher(entry) && (entry.finish_position ?? 99) <= 3
export const isRaceEntry = (entry: Pick<HistoryEntry, 'result_kind'>): boolean => entry.result_kind === 'race'

const mean = (values: number[]): number | null => (values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length)

function entryDate(entry: HistoryEntry, eventById: Map<string, EventRow>): string {
  return eventById.get(entry.event_id)?.event_date ?? entry.saved_at ?? entry.created_at ?? ''
}

/** Chronological order: event date (falling back to when the result was saved), then saved time, then id. */
function byDateAsc(eventById: Map<string, EventRow>) {
  return (a: HistoryEntry, b: HistoryEntry): number =>
    entryDate(a, eventById).localeCompare(entryDate(b, eventById)) ||
    (a.saved_at ?? '').localeCompare(b.saved_at ?? '') ||
    a.id.localeCompare(b.id)
}

// ---- Scoped stats (VRCDriverStatsAggregator) ---------------------------------------------------

export interface ScopedStats {
  entries: number
  starts: number
  wins: number
  podiums: number
  poles: number
  fastestLaps: number
  points: number
  bestFinish: number | null
  averageFinish: number | null
  averageStart: number | null
  averagePositionsGained: number | null
  averagePointsPerStart: number | null
  finishRate: number | null
  dnfCount: number
  dnfRate: number | null
  dnsCount: number
  dsqCount: number
  winRate: number | null
  podiumRate: number | null
  poleRate: number | null
}

export const EMPTY_STATS: ScopedStats = {
  entries: 0,
  starts: 0,
  wins: 0,
  podiums: 0,
  poles: 0,
  fastestLaps: 0,
  points: 0,
  bestFinish: null,
  averageFinish: null,
  averageStart: null,
  averagePositionsGained: null,
  averagePointsPerStart: null,
  finishRate: null,
  dnfCount: 0,
  dnfRate: null,
  dnsCount: 0,
  dsqCount: 0,
  winRate: null,
  podiumRate: null,
  poleRate: null,
}

/** DNS is never a start; DNF/DSQ count toward reliability but never toward finish averages. */
export function scopedStats(entries: HistoryEntry[]): ScopedStats {
  const races = entries.filter(isRaceEntry)
  if (races.length === 0) return { ...EMPTY_STATS }
  const started = races.filter(didStart)
  const finished = started.filter(isFinisher)
  const wins = finished.filter((r) => r.finish_position === 1).length
  const podiums = finished.filter((r) => (r.finish_position ?? 99) <= 3).length
  const poles = started.filter((r) => r.earned_pole && statusOf(r) !== 'dsq').length
  const dnf = started.filter((r) => statusOf(r) === 'dnf').length
  const points = races.reduce((sum, r) => sum + (r.points ?? 0), 0)
  const starts = started.length
  return {
    entries: races.length,
    starts,
    wins,
    podiums,
    poles,
    fastestLaps: races.filter((r) => r.fastest_lap).length,
    points,
    bestFinish: finished.length ? Math.min(...finished.map((r) => r.finish_position as number)) : null,
    averageFinish: mean(finished.map((r) => r.finish_position as number)),
    averageStart: mean(started.filter((r) => r.start_position !== null).map((r) => r.start_position as number)),
    averagePositionsGained: mean(
      finished.filter((r) => r.start_position !== null).map((r) => (r.start_position as number) - (r.finish_position as number)),
    ),
    averagePointsPerStart: starts > 0 ? points / starts : null,
    finishRate: starts > 0 ? finished.length / starts : null,
    dnfCount: dnf,
    dnfRate: starts > 0 ? dnf / starts : null,
    dnsCount: races.filter((r) => statusOf(r) === 'dns').length,
    dsqCount: started.filter((r) => statusOf(r) === 'dsq').length,
    winRate: starts > 0 ? wins / starts : null,
    podiumRate: starts > 0 ? podiums / starts : null,
    poleRate: starts > 0 ? poles / starts : null,
  }
}

// ---- Career detail (VRCDriverCareerBuilder) ----------------------------------------------------

export interface SeasonPlacement {
  seasonId: string
  seasonName: string
  rank: number | null
  fieldSize: number
  points: number
  isCompleted: boolean
  /** Rank 1 in a completed season (by summed official points). */
  isChampionship: boolean
}

export interface CareerDetail {
  seasonsParticipated: number
  stats: ScopedStats
  placements: SeasonPlacement[]
  championshipsWon: number
  bestChampionshipFinish: number | null
}

/**
 * League-isolated career detail. `leagueHistory` is the league-wide fetch (every driver); entries whose season is not in `seasons` are
 * dropped so over-fetched foreign data can never leak in. Ranks come from summed per-event points across the whole field.
 */
export function careerDetail(driverId: string, leagueHistory: HistoryEntry[], seasons: SeasonRow[]): CareerDetail {
  const seasonById = new Map(seasons.map((s) => [s.id, s]))
  const leagueRaces = leagueHistory.filter((e) => isRaceEntry(e) && seasonById.has(e.season_id))
  const own = leagueRaces.filter((e) => e.driver_id === driverId)

  const bySeason = new Map<string, HistoryEntry[]>()
  for (const entry of leagueRaces) bySeason.set(entry.season_id, [...(bySeason.get(entry.season_id) ?? []), entry])

  const placements: SeasonPlacement[] = []
  for (const [seasonId, entries] of bySeason) {
    const season = seasonById.get(seasonId)
    if (!season) continue
    const totals = new Map<string, number>()
    for (const entry of entries) totals.set(entry.driver_id, (totals.get(entry.driver_id) ?? 0) + (entry.points ?? 0))
    const ownPoints = totals.get(driverId)
    if (ownPoints === undefined) continue
    const ordered = [...totals].sort((a, b) => (a[1] !== b[1] ? b[1] - a[1] : a[0].localeCompare(b[0])))
    const index = ordered.findIndex(([id]) => id === driverId)
    const rank = index >= 0 ? index + 1 : null
    const isCompleted = season.status === 'completed'
    placements.push({ seasonId, seasonName: season.name, rank, fieldSize: totals.size, points: ownPoints, isCompleted, isChampionship: isCompleted && rank === 1 })
  }
  // Newest first, by season end (else start) date then id.
  const seasonDate = (p: SeasonPlacement) => seasonById.get(p.seasonId)?.end_date ?? seasonById.get(p.seasonId)?.start_date ?? ''
  placements.sort((a, b) => seasonDate(b).localeCompare(seasonDate(a)) || b.seasonId.localeCompare(a.seasonId))

  const ranks = placements.map((p) => p.rank).filter((r): r is number => r !== null)
  return {
    seasonsParticipated: new Set(own.map((e) => e.season_id)).size,
    stats: scopedStats(own),
    placements,
    championshipsWon: placements.filter((p) => p.isChampionship).length,
    bestChampionshipFinish: ranks.length ? Math.min(...ranks) : null,
  }
}

// ---- Profile builders (VRCGlobalDriverProfileService) ------------------------------------------

export interface RecentResult {
  eventId: string
  round: number
  position: number | null
  status: string
  label: string
}

export function recentForm(races: HistoryEntry[], eventById: Map<string, EventRow>, count = 3): RecentResult[] {
  return [...races]
    .sort((a, b) => byDateAsc(eventById)(b, a) || (eventById.get(b.event_id)?.round ?? 0) - (eventById.get(a.event_id)?.round ?? 0))
    .slice(0, count)
    .map((row) => {
      const status = statusOf(row)
      const finishing = status === 'fin' || status === 'classified'
      return {
        eventId: row.event_id,
        round: eventById.get(row.event_id)?.round ?? 0,
        position: row.finish_position,
        status,
        label: finishing ? (row.finish_position !== null ? `P${row.finish_position}` : status.toUpperCase()) : status.toUpperCase(),
      }
    })
}

/** Form label + one-line subtitle from the newest three races (`buildTrendSummary`). Input is newest first, so `last - first` is oldest − newest: positive means the driver improved. */
export function trendSummary(recent: RecentResult[]): { label: string; subtitle: string } {
  if (recent.length === 0) return { label: 'New', subtitle: 'Limited data' }
  if (recent.length < 3) return { label: 'Limited Data', subtitle: 'Limited data' }
  const positions = recent.filter((r) => r.status === 'fin' && r.position !== null).map((r) => r.position as number)
  if (positions.length < 2) return { label: 'Even', subtitle: 'Stable' }
  const change = positions[positions.length - 1] - positions[0]
  const label = change >= 2 ? 'Rising' : change <= -2 ? 'Falling' : 'Even'
  const subtitle = label === 'Rising' ? 'Improving' : label === 'Falling' ? 'Declining' : positions.filter((p) => p <= 3).length >= 2 ? 'Podium form' : 'Stable'
  return { label, subtitle }
}

export interface CareerSummary {
  seasons: number
  starts: number
  wins: number
  podiums: number
  poles: number
  totalPoints: number
}

export function careerSummary(races: HistoryEntry[], assignedSeasonIds: string[] = []): CareerSummary {
  const started = races.filter(didStart)
  const finishes = started.filter((r) => statusOf(r) === 'fin')
  const seasons = new Set([...assignedSeasonIds, ...races.map((r) => r.season_id)])
  return {
    seasons: seasons.size,
    starts: started.length,
    wins: finishes.filter((r) => r.finish_position === 1).length,
    podiums: finishes.filter((r) => (r.finish_position ?? 99) <= 3 && r.finish_position !== null).length,
    poles: races.filter((r) => r.earned_pole && statusOf(r) !== 'dns' && statusOf(r) !== 'dsq').length,
    totalPoints: races.reduce((sum, r) => sum + (r.points ?? 0), 0),
  }
}

export interface TrackHistory {
  key: string
  trackName: string
  starts: number
  wins: number
  podiums: number
  averageFinish: number | null
  bestFinish: number | null
}

/** Circuit identity is track + layout (a different layout is a different circuit), like iOS `trackKey`. */
export function trackKey(event: Pick<EventRow, 'id' | 'track_id' | 'track_layout'>): string {
  return `${event.track_id ?? `event:${event.id}`}|${(event.track_layout ?? '').trim().toLowerCase()}`
}

export function trackHistory(races: HistoryEntry[], eventById: Map<string, EventRow>, trackNames: Map<string, string> = new Map()): TrackHistory[] {
  const groups = new Map<string, HistoryEntry[]>()
  for (const row of races.filter(didStart)) {
    const event = eventById.get(row.event_id)
    const key = event ? trackKey(event) : `event:${row.event_id}`
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  return [...groups].map(([key, rows]) => {
    const finishes = rows.filter((r) => statusOf(r) === 'fin' && r.finish_position !== null).map((r) => r.finish_position as number)
    const event = rows.map((r) => eventById.get(r.event_id)).find(Boolean)
    const name = (event?.track_id ? trackNames.get(event.track_id) : undefined) ?? (event ? eventDisplayTitle(event) : 'Unknown circuit')
    return {
      key,
      trackName: name,
      starts: rows.length,
      wins: finishes.filter((p) => p === 1).length,
      podiums: finishes.filter((p) => p <= 3).length,
      averageFinish: mean(finishes),
      bestFinish: finishes.length ? Math.min(...finishes) : null,
    }
  }).sort((a, b) => b.starts - a.starts || (a.averageFinish ?? Infinity) - (b.averageFinish ?? Infinity))
}

export interface ClassStrength {
  classId: string
  className: string
  starts: number
  wins: number
  podiums: number
  averageFinish: number | null
  isLimitedData: boolean
}

/** Per-class results. iOS also ranks by a client-side rating score; the web orders by wins, podiums, then average finish. */
export function classStrengths(races: HistoryEntry[], eventById: Map<string, EventRow>, classNames: Map<string, string>): ClassStrength[] {
  const classOf = (e: HistoryEntry): string | null => e.class_id ?? eventById.get(e.event_id)?.class_id ?? null
  const ids = new Set(races.filter(didStart).map(classOf).filter((id): id is string => id !== null))
  return [...ids].map((classId) => {
    const rows = races.filter((r) => classOf(r) === classId)
    const started = rows.filter(didStart)
    const finishes = started.filter((r) => statusOf(r) === 'fin' && r.finish_position !== null).map((r) => r.finish_position as number)
    return {
      classId,
      className: classNames.get(classId) ?? 'Class',
      starts: started.length,
      wins: finishes.filter((p) => p === 1).length,
      podiums: finishes.filter((p) => p <= 3).length,
      averageFinish: mean(finishes),
      isLimitedData: started.length < 5,
    }
  }).sort((a, b) => b.wins - a.wins || b.podiums - a.podiums || (a.averageFinish ?? Infinity) - (b.averageFinish ?? Infinity) || b.starts - a.starts)
}

export interface RaceLogRow {
  id: string
  eventId: string
  seasonId: string
  round: number
  title: string
  className: string | null
  position: number | null
  status: string
  points: number
  fastestLap: boolean
  bestLapMs: number | null
  resultLabel: string
}

export function raceLog(races: HistoryEntry[], eventById: Map<string, EventRow>, classNames: Map<string, string>): RaceLogRow[] {
  return [...races]
    .sort((a, b) => byDateAsc(eventById)(b, a))
    .map((row) => {
      const event = eventById.get(row.event_id)
      const classId = row.class_id ?? event?.class_id ?? null
      const status = statusOf(row)
      const finishing = status === 'fin' || status === 'classified'
      return {
        id: row.id,
        eventId: row.event_id,
        seasonId: row.season_id,
        round: event?.round ?? 0,
        title: event ? eventDisplayTitle(event) : 'Unknown circuit',
        className: classId ? classNames.get(classId) ?? null : null,
        position: row.finish_position,
        status,
        points: row.points ?? 0,
        fastestLap: row.fastest_lap,
        bestLapMs: row.best_lap_ms,
        resultLabel: finishing ? (row.finish_position !== null ? `P${row.finish_position}` : status.toUpperCase()) : status.toUpperCase(),
      }
    })
}

// ---- Trend series -------------------------------------------------------------------------------

export interface SeasonTrendPoint {
  round: number
  points: number
  finish: number | null
  qualifying: number | null
}

/** Season trend: cumulative points per scored event plus per-race finish and qualifying position (oldest → newest by round). */
export function seasonTrend(
  driverId: string,
  seasonId: string,
  events: EventRow[],
  pointsByEvent: Map<string, number>,
  races: HistoryEntry[],
  qualifying: HistoryEntry[],
): SeasonTrendPoint[] {
  const ordered = events.filter((e) => e.season_id === seasonId).sort((a, b) => a.round - b.round || (a.event_date ?? '').localeCompare(b.event_date ?? ''))
  let cumulative = 0
  const out: SeasonTrendPoint[] = []
  for (const event of ordered) {
    const eventPoints = pointsByEvent.get(event.id)
    const race = races.find((r) => r.event_id === event.id && r.driver_id === driverId && statusOf(r) === 'fin' && r.finish_position !== null)
    const qual = qualifying.find((r) => r.event_id === event.id && r.driver_id === driverId)
    if (eventPoints === undefined && !race && !qual) continue
    if (eventPoints !== undefined) cumulative += eventPoints
    out.push({
      round: event.round,
      points: cumulative,
      finish: race?.finish_position ?? null,
      qualifying: qual ? qual.qualifying_position ?? qual.finish_position : null,
    })
  }
  return out
}

export interface CareerTrendPoint {
  round: number
  points: number
  finish: number | null
}

/** One sample per race across every season, oldest → newest, with a sequential career round. */
export function careerTrend(races: HistoryEntry[], eventById: Map<string, EventRow>): CareerTrendPoint[] {
  return [...races].sort(byDateAsc(eventById)).map((race, index) => ({
    round: index + 1,
    points: race.points ?? 0,
    finish: statusOf(race) === 'fin' ? race.finish_position : null,
  }))
}

export interface CareerProgressionPoint {
  round: number
  cumulativePoints: number
  winRate: number
  podiumRate: number
}

export function careerProgression(races: HistoryEntry[], eventById: Map<string, EventRow>): CareerProgressionPoint[] {
  const ordered = races.filter(didStart).sort(byDateAsc(eventById))
  let cumulativePoints = 0
  let starts = 0
  let wins = 0
  let podiums = 0
  return ordered.map((race, index) => {
    cumulativePoints += race.points ?? 0
    starts += 1
    if (statusOf(race) === 'fin') {
      if (race.finish_position === 1) wins += 1
      if (race.finish_position !== null && race.finish_position <= 3) podiums += 1
    }
    return { round: index + 1, cumulativePoints, winRate: wins / starts, podiumRate: podiums / starts }
  })
}

// ---- Milestones and records ----------------------------------------------------------------------

export type MilestoneKind = 'joinedLeague' | 'firstRace' | 'firstPole' | 'firstPodium' | 'firstWin' | 'championship'

export interface Milestone {
  kind: MilestoneKind
  title: string
  detail: string
  date: string | null
}

export function milestones(args: {
  races: HistoryEntry[]
  qualifying: HistoryEntry[]
  joinedAt: string | null
  career: CareerDetail | null
  seasons: Map<string, SeasonRow>
  eventById: Map<string, EventRow>
}): Milestone[] {
  const { races, qualifying, joinedAt, career, seasons, eventById } = args
  const dateOf = (entry: HistoryEntry) => eventById.get(entry.event_id)?.event_date ?? entry.saved_at ?? entry.created_at
  const titleOf = (entry: HistoryEntry) => {
    const event = eventById.get(entry.event_id)
    return event ? eventDisplayTitle(event) : ''
  }
  const out: Milestone[] = []
  if (joinedAt) out.push({ kind: 'joinedLeague', title: 'Joined League', detail: '', date: joinedAt })
  const orderedRaces = [...races].sort(byDateAsc(eventById))
  const first = orderedRaces[0]
  if (first) out.push({ kind: 'firstRace', title: 'First Race', detail: titleOf(first), date: dateOf(first) })
  const firstPole = [...qualifying].sort(byDateAsc(eventById)).find((q) => q.earned_pole)
  if (firstPole) out.push({ kind: 'firstPole', title: 'First Pole', detail: titleOf(firstPole), date: dateOf(firstPole) })
  const firstPodium = orderedRaces.find(isPodiumFinish)
  if (firstPodium) out.push({ kind: 'firstPodium', title: 'First Podium', detail: titleOf(firstPodium), date: dateOf(firstPodium) })
  const firstWin = orderedRaces.find((r) => isFinisher(r) && r.finish_position === 1)
  if (firstWin) out.push({ kind: 'firstWin', title: 'First Win', detail: titleOf(firstWin), date: dateOf(firstWin) })
  for (const placement of career?.placements ?? []) {
    if (!placement.isChampionship) continue
    const season = seasons.get(placement.seasonId)
    out.push({ kind: 'championship', title: `Championship — ${placement.seasonName}`, detail: `${placement.points} points`, date: season?.end_date ?? season?.start_date ?? null })
  }
  // Dated first; chronological.
  return out.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'))
}

export interface BiggestRival {
  driverId: string
  sharedRaces: number
  aheadCount: number
  record: string
}

/** The rival with the closest average finishing-position gap across races both finished, among rivals with ≥ 3 shared races. */
export function biggestRival(driverId: string, leagueHistory: HistoryEntry[]): BiggestRival | null {
  const byEvent = new Map<string, HistoryEntry[]>()
  for (const entry of leagueHistory.filter((e) => isRaceEntry(e) && e.finish_position !== null)) {
    byEvent.set(entry.event_id, [...(byEvent.get(entry.event_id) ?? []), entry])
  }
  const shared = new Map<string, number>()
  const ahead = new Map<string, number>()
  const gap = new Map<string, number>()
  for (const entries of byEvent.values()) {
    const mine = entries.find((e) => e.driver_id === driverId)
    if (!mine || mine.finish_position === null) continue
    for (const other of entries) {
      if (other.driver_id === driverId || other.finish_position === null) continue
      shared.set(other.driver_id, (shared.get(other.driver_id) ?? 0) + 1)
      gap.set(other.driver_id, (gap.get(other.driver_id) ?? 0) + Math.abs(mine.finish_position - other.finish_position))
      if (mine.finish_position < other.finish_position) ahead.set(other.driver_id, (ahead.get(other.driver_id) ?? 0) + 1)
    }
  }
  const candidates = [...shared].filter(([, count]) => count >= 3)
  if (candidates.length === 0) return null
  const [best] = candidates.sort((a, b) => {
    const avgA = (gap.get(a[0]) ?? 0) / a[1]
    const avgB = (gap.get(b[0]) ?? 0) / b[1]
    return avgA !== avgB ? avgA - avgB : a[0].localeCompare(b[0])
  })
  const count = best[1]
  const aheadCount = ahead.get(best[0]) ?? 0
  return { driverId: best[0], sharedRaces: count, aheadCount, record: `Finished ahead in ${aheadCount} of ${count} shared race${count === 1 ? '' : 's'}` }
}

export interface DriverRecords {
  bestFinish: number | null
  worstFinish: number | null
  favoriteTrack: string | null
  mostSuccessfulTrack: string | null
  mostImprovedSeason: string | null
}

/** `placements` is newest first, so index i is the season immediately after i+1 chronologically. */
export function mostImprovedSeasonText(placements: SeasonPlacement[]): string | null {
  if (placements.length < 2) return null
  let best: { name: string; improvement: number } | null = null
  for (let i = 0; i < placements.length - 1; i++) {
    const later = placements[i].rank
    const earlier = placements[i + 1].rank
    if (later === null || earlier === null) continue
    const improvement = earlier - later
    if (improvement > 0 && (best === null || improvement > best.improvement)) best = { name: placements[i].seasonName, improvement }
  }
  return best ? `${best.name}: up ${best.improvement} position${best.improvement === 1 ? '' : 's'}` : null
}

export function driverRecords(races: HistoryEntry[], tracks: TrackHistory[], career: CareerDetail | null): DriverRecords {
  const finishes = races.filter((r) => statusOf(r) === 'fin' && r.finish_position !== null).map((r) => r.finish_position as number)
  const favorite = tracks.length ? tracks.reduce((best, t) => (t.starts > best.starts ? t : best)) : null
  const successful = tracks.filter((t) => t.starts >= 3).sort((a, b) => (a.averageFinish ?? Infinity) - (b.averageFinish ?? Infinity))[0] ?? null
  return {
    bestFinish: finishes.length ? Math.min(...finishes) : null,
    worstFinish: finishes.length ? Math.max(...finishes) : null,
    favoriteTrack: favorite?.trackName ?? null,
    mostSuccessfulTrack: successful?.trackName ?? null,
    mostImprovedSeason: mostImprovedSeasonText(career?.placements ?? []),
  }
}
