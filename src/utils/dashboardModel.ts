import { dayKey, eventDisplayTitle } from '@/utils/currentRace'
import type { EventScore, SeriesEventScores, StandingRow } from '@/utils/standingsEngine'
import type { ChampionshipRow, DriverRow, EventRow, EventStatus, ResultSetRow, SeasonDriverRow, SeasonRow, SessionState, VrcRole } from '@/types/database'

/**
 * Personalized Home dashboard — a pure port of iOS `VRCDashboardComposer`, `VRCDashboardPhaseLogic`, `VRCDashboardLogic` and
 * `VRCAdminDashboardLogic`. Each card kind qualifies at most once (eligibility + live priority signals), so a multi-role user (Driver + Owner)
 * sees every card exactly once. "Steward" is dashboard vocabulary for the existing `marshal` role — not a new permission.
 */

export type DashboardCardKind =
  | 'raceLeaders'
  | 'myRating'
  | 'seasonProgress'
  | 'stewardReviewQueue'
  | 'stewardPenalties'
  | 'quickActions'
  | 'lastRace'
  | 'driverSpotlight'
  | 'announcements'
  | 'recentActivity'
  | 'pointsTrend'

export const ALL_CARD_KINDS: DashboardCardKind[] = [
  'raceLeaders',
  'myRating',
  'seasonProgress',
  'stewardReviewQueue',
  'stewardPenalties',
  'quickActions',
  'lastRace',
  'driverSpotlight',
  'announcements',
  'recentActivity',
  'pointsTrend',
]

export type DashboardRole = 'owner' | 'admin' | 'steward' | 'driver' | 'viewer'
export type PriorityTier = 0 | 1 | 2 // high, medium, low
export type RaceWeekendPhase = 'preSeason' | 'raceWeek' | 'raceWeekend' | 'postRace' | 'offSeason'

export interface DashboardUserContext {
  roles: Set<DashboardRole>
  myDriverId: string | null
}

export interface PrioritySignals {
  isEventSoon: boolean
  missingResultsCount: number
  pendingInvitationCount: number
  pendingDriverNumberRequestCount: number
  stewardReviewCount: number
}

export const NO_SIGNALS: PrioritySignals = {
  isEventSoon: false,
  missingResultsCount: 0,
  pendingInvitationCount: 0,
  pendingDriverNumberRequestCount: 0,
  stewardReviewCount: 0,
}

export function deriveUserContext(roles: Set<VrcRole>, myDriverId: string | null): DashboardUserContext {
  const out = new Set<DashboardRole>()
  if (roles.has('owner')) out.add('owner')
  if (roles.has('admin')) out.add('admin')
  if (roles.has('marshal')) out.add('steward')
  if (myDriverId) out.add('driver')
  if (out.size === 0) out.add('viewer')
  return { roles: out, myDriverId }
}

const isManager = (c: DashboardUserContext) => c.roles.has('owner') || c.roles.has('admin')

export function isEligible(kind: DashboardCardKind, context: DashboardUserContext): boolean {
  switch (kind) {
    case 'raceLeaders':
    case 'seasonProgress':
    case 'driverSpotlight':
    case 'recentActivity':
      return isManager(context)
    case 'myRating':
      return context.roles.has('driver')
    case 'stewardReviewQueue':
    case 'stewardPenalties':
      return context.roles.has('steward')
    // A driver gets the premium quick-action grid in the driver section instead; this must use the identical condition or a
    // Driver + Admin sees both grids at once (iOS Stage 11 §42/§43).
    case 'quickActions':
      return !context.roles.has('driver')
    case 'lastRace':
    case 'announcements':
    case 'pointsTrend':
      return true
  }
}

export function priority(kind: DashboardCardKind, signals: PrioritySignals): PriorityTier {
  if (kind === 'stewardReviewQueue') return signals.stewardReviewCount > 0 ? 0 : 2
  if (kind === 'quickActions') return 1
  return 2
}

/** Multi-role merge order inside a priority tier: personal-urgent, league-urgent, personal-performance, league-performance, admin-tools, historical. */
export function mergeCategory(kind: DashboardCardKind): number {
  switch (kind) {
    case 'stewardReviewQueue':
      return 1
    case 'myRating':
      return 2
    case 'quickActions':
    case 'recentActivity':
      return 4
    default:
      return 3
  }
}

export function composeCards(context: DashboardUserContext, signals: PrioritySignals = NO_SIGNALS): DashboardCardKind[] {
  return ALL_CARD_KINDS.filter((k) => isEligible(k, context))
    .map((k) => ({ k, p: priority(k, signals) }))
    .sort((a, b) => a.p - b.p || mergeCategory(a.k) - mergeCategory(b.k) || a.k.localeCompare(b.k))
    .map((x) => x.k)
}

/** Adjacent compact cards share a row; every other card is full width. Pure layout grouping — order comes entirely from `composeCards`. */
export function cardRows(cards: DashboardCardKind[]): DashboardCardKind[][] {
  const gridEligible = new Set<DashboardCardKind>(['lastRace', 'driverSpotlight', 'myRating', 'stewardPenalties'])
  const rows: DashboardCardKind[][] = []
  let buffer: DashboardCardKind[] = []
  for (const card of cards) {
    if (gridEligible.has(card)) buffer.push(card)
    else {
      if (buffer.length) {
        rows.push(buffer)
        buffer = []
      }
      rows.push([card])
    }
  }
  if (buffer.length) rows.push(buffer)
  return rows
}

// ---- Phase ----------------------------------------------------------------------------------------

const DAY_MS = 86_400_000
/** Whole calendar days from `from` to `to` (yyyy-MM-dd keys), timezone-safe. */
export function daysBetween(fromKey: string, toKey: string): number {
  const parse = (k: string) => Date.UTC(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1, Number(k.slice(8, 10)))
  return Math.round((parse(toKey) - parse(fromKey)) / DAY_MS)
}

export function racePhase(args: {
  hasActiveSeason: boolean
  hasSchedule: boolean
  hasRoster: boolean
  upcomingEvent: EventRow | null
  isUpcomingEventLive: boolean
  lastFinalizedEvent: EventRow | null
  now?: Date
}): RaceWeekendPhase {
  if (!args.hasActiveSeason || !args.hasSchedule || !args.hasRoster) return 'preSeason'
  if (args.isUpcomingEventLive) return 'raceWeekend'
  const today = dayKey(args.now)
  if (args.upcomingEvent?.event_date) {
    const days = daysBetween(today, args.upcomingEvent.event_date)
    if (days <= 0) return 'raceWeekend'
    if (days <= 7) return 'raceWeek'
  }
  if (args.lastFinalizedEvent?.event_date) {
    const since = daysBetween(args.lastFinalizedEvent.event_date, today)
    if (since >= 0 && since <= 3) return 'postRace'
  }
  return 'offSeason'
}

// ---- Events ---------------------------------------------------------------------------------------

/** An event is concluded when completed/cancelled/archived, or when its RACE result set has been finalized (never inferred from status alone). */
export function isEventConcluded(event: Pick<EventRow, 'id' | 'status'>, resultSets: Pick<ResultSetRow, 'event_id' | 'kind' | 'state'>[]): boolean {
  switch (event.status) {
    case 'completed':
    case 'cancelled':
    case 'archived':
      return true
    default:
      return resultSets.some((s) => s.event_id === event.id && s.kind === 'race' && s.state === 'finalized')
  }
}

export function upcomingEvent(events: EventRow[], resultSets: Pick<ResultSetRow, 'event_id' | 'kind' | 'state'>[], now: Date = new Date()): EventRow | null {
  const today = dayKey(now)
  const candidates = events.filter((event) => {
    if (isEventConcluded(event, resultSets)) return false
    if (event.status === 'live') return true
    if (event.status !== 'scheduled' && event.status !== 'postponed') return false
    return !event.event_date || event.event_date >= today
  })
  return (
    candidates.sort((a, b) => {
      if (a.status === 'live' && b.status !== 'live') return -1
      if (b.status === 'live' && a.status !== 'live') return 1
      if (a.event_date && b.event_date && a.event_date !== b.event_date) return a.event_date < b.event_date ? -1 : 1
      if (a.event_date && !b.event_date) return -1
      if (!a.event_date && b.event_date) return 1
      return a.round - b.round
    })[0] ?? null
  )
}

/** "Last race" is the most recent race BY SCHEDULE — a late correction to an earlier round never bumps it ahead of a later one. */
export function lastFinalizedRace(events: EventRow[], resultSets: ResultSetRow[]): { event: EventRow; raceSet: ResultSetRow } | null {
  const byId = new Map(events.map((e) => [e.id, e]))
  const pairs = resultSets
    .filter((s) => s.kind === 'race' && s.state === 'finalized')
    .flatMap((raceSet) => {
      const event = byId.get(raceSet.event_id)
      return event && event.status !== 'cancelled' && event.status !== 'archived' ? [{ event, raceSet }] : []
    })
  return (
    pairs.sort((a, b) => {
      const ad = a.event.event_date
      const bd = b.event.event_date
      if (ad && bd && ad !== bd) return ad > bd ? -1 : 1
      if (ad && !bd) return -1
      if (!ad && bd) return 1
      if (a.event.round !== b.event.round) return b.event.round - a.event.round
      const af = a.raceSet.finalized_at
      const bf = b.raceSet.finalized_at
      if (af && bf && af !== bf) return af > bf ? -1 : 1
      if (af && !bf) return -1
      if (!af && bf) return 1
      return 0
    })[0] ?? null
  )
}

export function setupWarnings(args: {
  championship: Pick<ChampionshipRow, 'status' | 'classes_enabled' | 'regions_enabled'>
  season: Pick<SeasonRow, 'is_active' | 'status' | 'year'>
  eventCount: number
  activeRosterCount: number
  trackCount: number
  seasonClassCount: number
  seasonRegionCount: number
}): string[] {
  const missing: string[] = []
  if (args.championship.status !== 'active') missing.push('active championship')
  if (!(args.season.is_active || args.season.status === 'active')) missing.push('active season')
  if (args.season.year === null) missing.push('season year')
  if (args.activeRosterCount === 0) missing.push('season drivers')
  if (args.trackCount === 0) missing.push('tracks')
  if (args.eventCount === 0) missing.push('schedule')
  if (args.championship.classes_enabled && args.seasonClassCount === 0) missing.push('season classes')
  if (args.championship.regions_enabled && args.seasonRegionCount === 0) missing.push('season regions')
  return missing
}

// ---- Hero -----------------------------------------------------------------------------------------

/**
 * The hero's phase label comes from `event_sessions.state`, NEVER `events.status` alone — `vrc_session_transition` flips an event to `live`
 * the moment practice opens, so `live` only means "some session is open", not "the race is live".
 */
export function eventPhaseLabel(eventStatus: EventStatus, sessionState: SessionState | null): string | null {
  if (eventStatus === 'postponed') return 'Postponed'
  switch (sessionState) {
    case 'practice_available':
      return 'Practice is live'
    case 'qualifying_active':
      return 'Qualifying is live'
    case 'race_active':
      return 'Race is live'
    default:
      return null
  }
}

export const isRaceSessionLive = (sessionState: SessionState | null): boolean => sessionState === 'race_active'

export interface RaceCountdown {
  isLive: boolean
  isToday: boolean
  primaryText: string
  unitText: string
}

/** Day granularity only — the schedule stores a calendar day with no verified timezone-aware start, so hours/minutes would be fabricated precision. */
export function raceCountdown(eventDate: string | null, isLive: boolean, now: Date = new Date()): RaceCountdown {
  const today = dayKey(now)
  const isToday = eventDate === today
  if (isLive) return { isLive: true, isToday, primaryText: 'LIVE', unitText: 'NOW' }
  if (isToday) return { isLive: false, isToday: true, primaryText: 'TODAY', unitText: '' }
  if (!eventDate) return { isLive: false, isToday: false, primaryText: '—', unitText: '' }
  const days = daysBetween(today, eventDate)
  if (days <= 0) return { isLive: false, isToday: true, primaryText: 'TODAY', unitText: '' }
  return { isLive: false, isToday: false, primaryText: String(days), unitText: days === 1 ? 'DAY' : 'DAYS' }
}

export const heroRoundLabel = (round: number): string => (round > 0 ? `ROUND ${round}` : 'ROUND —')

/** `class · date · time`; a missing applicable field shows `N/A` (never 00:00 or an invented date); the class segment is omitted when classes are off. */
export function heroMetadataText(args: { classesEnabled: boolean; className: string | null; dateText: string | null; timeText: string | null }): string {
  const parts: string[] = []
  if (args.classesEnabled) parts.push(args.className?.trim() || 'N/A')
  parts.push(args.dateText?.trim() || 'N/A')
  parts.push(args.timeText?.trim() || 'N/A')
  return parts.join(' · ')
}

export function distanceText(event: Pick<EventRow, 'race_value' | 'race_distance_type'>): string {
  if (!event.race_value || event.race_value <= 0) return 'Distance TBA'
  return event.race_distance_type === 'endurance' ? `${event.race_value} min` : `${event.race_value} ${event.race_value === 1 ? 'Lap' : 'Laps'}`
}

export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours()
  return hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
}

// ---- Driver section ------------------------------------------------------------------------------

/** Newest-first finishes → a coarse label. Splits the window in half so one outlier result can't flip it. */
export function formTrendLabel(recentFinishes: (number | null)[]): string {
  const finishes = recentFinishes.filter((f): f is number => f !== null)
  if (finishes.length < 2) return 'Not enough races yet'
  const half = Math.max(1, Math.floor(finishes.length / 2))
  const newer = finishes.slice(0, half)
  const older = finishes.slice(half)
  if (older.length === 0) return 'Building form'
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const delta = avg(older) - avg(newer) // positive → newer finishes are better (lower position)
  if (delta > 0.75) return 'Improving'
  if (delta < -0.75) return 'Slipping'
  return 'Steady'
}

export interface ChampionshipBattle {
  standing: StandingRow | null
  gapToLeader: number | null
  driverBehind: StandingRow | null
  gapBehind: number | null
}

export function championshipBattle(rows: StandingRow[], driverId: string): ChampionshipBattle {
  const standing = rows.find((r) => r.driverId === driverId) ?? null
  const leader = rows[0] ?? null
  const behind = standing ? rows.find((r) => r.position === standing.position + 1) ?? null : null
  return {
    standing,
    gapToLeader: standing && leader ? Math.max(0, leader.points - standing.points) : null,
    driverBehind: behind,
    gapBehind: standing && behind ? Math.max(0, standing.points - behind.points) : null,
  }
}

export type PerformanceGapTone = 'cushion' | 'contested' | 'atBack' | 'unavailable'

/** The leader sees their cushion over 2nd; everyone else their gap to the leader (contested while someone is behind, at-back once last). */
export function performanceGap(battle: ChampionshipBattle): { tone: PerformanceGapTone; value: number | null } {
  if (!battle.standing) return { tone: 'unavailable', value: null }
  if (battle.standing.position === 1) return battle.gapBehind === null ? { tone: 'unavailable', value: null } : { tone: 'cushion', value: battle.gapBehind }
  if (battle.gapToLeader === null) return { tone: 'unavailable', value: null }
  return { tone: battle.driverBehind === null ? 'atBack' : 'contested', value: battle.gapToLeader }
}

const GAP_LABEL: Record<PerformanceGapTone, string> = {
  cushion: 'Lead over 2nd',
  contested: 'Gap to leader',
  atBack: 'Gap to leader',
  unavailable: 'Gap',
}
export const gapLabel = (tone: PerformanceGapTone): string => GAP_LABEL[tone]

// ---- Admin ----------------------------------------------------------------------------------------

export interface AdminAttention {
  rosterCount: number
  upcomingEventTitle: string | null
  missingQualifyingEvents: string[]
  missingRaceEvents: string[]
  pendingInvitationCount: number
  pendingDriverNumberRequests: string[]
  healthSummaryText: string
  hasAnything: boolean
}

export function adminAttention(args: {
  events: EventRow[]
  resultSets: Pick<ResultSetRow, 'event_id' | 'kind' | 'state'>[]
  roster: Pick<SeasonDriverRow, 'is_active'>[]
  seasonClassCount: number
  seasonRegionCount: number
  upcomingEvent: EventRow | null
  pendingInvitationCount: number
  pendingDriverNumberRequests?: string[]
}): AdminAttention {
  const rosterCount = args.roster.filter((r) => r.is_active).length
  // "Missing" only applies to events that have actually happened — future rounds aren't yet due for results.
  const pastDue = args.events.filter((e) => e.status === 'completed' || e.status === 'live')
  const missing = (kind: 'qualifying' | 'race') => {
    const finalized = new Set(args.resultSets.filter((s) => s.kind === kind && s.state === 'finalized').map((s) => s.event_id))
    return pastDue
      .filter((e) => !finalized.has(e.id))
      .sort((a, b) => a.round - b.round)
      .map(eventDisplayTitle)
  }
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
  const missingQualifyingEvents = missing('qualifying')
  const missingRaceEvents = missing('race')
  const pendingDriverNumberRequests = args.pendingDriverNumberRequests ?? []
  return {
    rosterCount,
    upcomingEventTitle: args.upcomingEvent ? eventDisplayTitle(args.upcomingEvent) : null,
    missingQualifyingEvents,
    missingRaceEvents,
    pendingInvitationCount: args.pendingInvitationCount,
    pendingDriverNumberRequests,
    healthSummaryText: `${plural(rosterCount, 'active driver')} · ${plural(args.seasonClassCount, 'class', 'classes')} · ${plural(args.seasonRegionCount, 'region')}`,
    hasAnything:
      args.upcomingEvent !== null || missingQualifyingEvents.length > 0 || missingRaceEvents.length > 0 || args.pendingInvitationCount > 0 || pendingDriverNumberRequests.length > 0,
  }
}

/** FNV-1a 64-bit, identical to the app's `stableHash`, so the same spotlight driver is picked on every platform. */
export function stableHash(key: string): bigint {
  let hash = 14695981039346656037n
  const prime = 1099511628211n
  const mask = (1n << 64n) - 1n
  for (const byte of new TextEncoder().encode(key)) {
    hash ^= BigInt(byte)
    hash = (hash * prime) & mask
  }
  return hash
}

export function spotlightPeriodKey(seasonId: string, upcomingEventId: string | null, now: Date = new Date()): string {
  if (upcomingEventId) return `${seasonId.toLowerCase()}:event:${upcomingEventId.toLowerCase()}`
  const utc = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
  return `${seasonId.toLowerCase()}:day:${utc}`
}

/** Deterministic driver of the week for one period (upcoming event, else UTC day) — stable across reloads and platforms. */
export function stableSpotlightDriver(args: {
  roster: Pick<SeasonDriverRow, 'driver_id' | 'is_active'>[]
  drivers: DriverRow[]
  seasonId: string
  upcomingEventId: string | null
  now?: Date
  preferredDriverIds?: Set<string>
}): DriverRow | null {
  const activeIds = new Set(args.roster.filter((r) => r.is_active).map((r) => r.driver_id))
  const active = args.drivers
    .filter((d) => d.is_active && activeIds.has(d.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { numeric: true, sensitivity: 'base' }))
  if (active.length === 0) return null
  const preferred = active.filter((d) => args.preferredDriverIds?.has(d.id))
  const pool = preferred.length > 0 ? preferred : active
  const index = Number(stableHash(spotlightPeriodKey(args.seasonId, args.upcomingEventId, args.now)) % BigInt(pool.length))
  return pool[index]
}


// ---- Points trend -----------------------------------------------------------------------------------

export interface PointsTrend {
  xLabels: string[]
  series: { driverId: string; label: string; values: number[] }[]
}

/**
 * Cumulative points after each scored round for the current top drivers of a series (overall, a class or a region). Raw per-event totals are
 * summed — drop rounds are a standings-table concern, so this chart shows "total points after each round" like the app.
 */
export function pointsTrend(
  events: SeriesEventScores[],
  filter: (score: EventScore) => boolean,
  driverNames: Map<string, string>,
  topN = 5,
): PointsTrend {
  const ordered = [...events].sort((a, b) => a.round - b.round || a.eventId.localeCompare(b.eventId))
  const scored = ordered.map((e) => ({ round: e.round, scores: e.scores.filter(filter) })).filter((e) => e.scores.length > 0)
  const totals = new Map<string, number>()
  for (const event of scored) for (const s of event.scores) totals.set(s.driverId, (totals.get(s.driverId) ?? 0) + s.totalPoints)
  const top = [...totals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topN).map(([id]) => id)
  return {
    xLabels: scored.map((e) => `R${e.round}`),
    series: top.map((driverId) => {
      let running = 0
      return {
        driverId,
        label: driverNames.get(driverId) ?? 'Driver',
        values: scored.map((e) => {
          running += e.scores.filter((s) => s.driverId === driverId).reduce((sum, s) => sum + s.totalPoints, 0)
          return running
        }),
      }
    }),
  }
}
