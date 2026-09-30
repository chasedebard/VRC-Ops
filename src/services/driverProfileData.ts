import { supabase } from '@/supabase/client'
import { getDrivers, getSeasonRoster } from '@/services/drivers'
import { getChampionships } from '@/services/championships'
import { getSeasonScoringOutputs } from '@/services/standings'
import { getDriverLiveStandingAwards } from '@/services/results'
import { getLeagueDriverMmrDisplay } from '@/services/mmr'
import { getSeasonRivals, type SeasonRivalDisplay } from '@/services/rivals'
import { listLeagueClasses, listLeagueRegions } from '@/services/setup'
import { getTracks } from '@/services/tracks'
import { standingsConfigForSeason } from '@/services/standingsData'
import {
  careerDetail as buildCareerDetail,
  careerProgression,
  careerSummary,
  careerTrend,
  classStrengths,
  driverRecords,
  milestones as buildMilestones,
  biggestRival,
  isRaceEntry,
  raceLog,
  recentForm,
  seasonTrend,
  trackHistory,
  trendSummary,
  type BiggestRival,
  type CareerDetail,
  type CareerProgressionPoint,
  type CareerSummary,
  type CareerTrendPoint,
  type ClassStrength,
  type DriverRecords,
  type HistoryEntry,
  type Milestone,
  type RaceLogRow,
  type RecentResult,
  type SeasonTrendPoint,
  type TrackHistory,
} from '@/utils/driverAnalytics'
import {
  awardEntries,
  championshipTitles,
  raceTrophyStats,
  trophyMilestones,
  type AwardEntry,
  type MilestoneState,
  type TrophyCareerStats,
} from '@/utils/trophyCase'
import { eventScoreFromOutput, rankedDriverRows, type DriverInfo, type EventScore } from '@/utils/standingsEngine'
import type {
  ChampionshipRow,
  DriverHistoryRow,
  DriverRatingRecordRow,
  DriverRow,
  EventRow,
  ScoringOutputRow,
  SeasonDriverRow,
  SeasonRow,
} from '@/types/database'
import type { LeagueMmrDisplayRow } from '@/types/mmr'

/**
 * Everything the driver profile shows, assembled from league-scoped reads (RLS scopes every query to the viewer's league) and reduced with
 * the pure analytics modules. Pro enforcement mirrors iOS (`VRCGlobalDriverProfileService`): advanced aggregates are only computed — and the
 * league-wide history / rating history only FETCHED — when `advanced` is true, so a free session never loads what it may not show.
 */

// ---- Raw reads -----------------------------------------------------------------------------------

async function getLeagueEvents(leagueId: string): Promise<EventRow[]> {
  const { data, error } = await supabase.from('events').select('*').eq('league_id', leagueId).returns<EventRow[]>()
  if (error) throw error
  return data ?? []
}

async function getLeagueSeasons(leagueId: string): Promise<SeasonRow[]> {
  const { data, error } = await supabase.from('seasons').select('*').eq('league_id', leagueId).returns<SeasonRow[]>()
  if (error) throw error
  return data ?? []
}

export async function getDriverHistory(driverId: string): Promise<DriverHistoryRow[]> {
  const { data, error } = await supabase.from('driver_history').select('*').eq('driver_id', driverId).returns<DriverHistoryRow[]>()
  if (error) throw error
  return data ?? []
}

async function getDriverAssignments(driverId: string): Promise<SeasonDriverRow[]> {
  const { data, error } = await supabase.from('season_drivers').select('*').eq('driver_id', driverId).returns<SeasonDriverRow[]>()
  if (error) throw error
  return data ?? []
}

async function getDriverScoringOutputs(driverId: string): Promise<ScoringOutputRow[]> {
  const { data, error } = await supabase.from('scoring_outputs').select('*').eq('driver_id', driverId).returns<ScoringOutputRow[]>()
  if (error) throw error
  return data ?? []
}

/** League-wide race history (all drivers) — used for career placements and the biggest rival. Fetched for Pro sessions only. */
async function getLeagueRaceHistory(leagueId: string): Promise<DriverHistoryRow[]> {
  const { data, error } = await supabase
    .from('driver_history')
    .select('*')
    .eq('league_id', leagueId)
    .eq('result_kind', 'race')
    .returns<DriverHistoryRow[]>()
  if (error) throw error
  return data ?? []
}

export type RatingPoint = Pick<DriverRatingRecordRow, 'rating_value' | 'race_craft' | 'consistency' | 'qualifying' | 'confidence' | 'calculated_at' | 'season_id'>

/** Durable rating snapshots written by the apps after result saves (oldest first). The website shows them; it does not recompute them. */
async function getRatingHistory(driverId: string): Promise<RatingPoint[]> {
  const { data, error } = await supabase
    .from('driver_rating_records')
    .select('rating_value, race_craft, consistency, qualifying, confidence, calculated_at, season_id')
    .eq('driver_id', driverId)
    .order('calculated_at', { ascending: true })
    .limit(500)
    .returns<RatingPoint[]>()
  if (error) throw error
  return data ?? []
}

/** The newest stored rating snapshot for a driver (written by the apps after result saves), or null. */
export async function getLatestRating(driverId: string): Promise<RatingPoint | null> {
  const { data, error } = await supabase
    .from('driver_rating_records')
    .select('rating_value, race_craft, consistency, qualifying, confidence, calculated_at, season_id')
    .eq('driver_id', driverId)
    .order('calculated_at', { ascending: false })
    .limit(1)
    .returns<RatingPoint[]>()
  if (error) throw error
  return data?.[0] ?? null
}

/** A `scoring_outputs` row as a history row — for events scored but not yet committed to `driver_history` (keeps the profile in sync with Results). */
function outputAsHistory(output: ScoringOutputRow): HistoryEntry {
  return {
    id: output.id,
    league_id: output.league_id,
    championship_id: output.championship_id,
    season_id: output.season_id,
    event_id: output.event_id,
    driver_id: output.driver_id,
    result_kind: 'race',
    track_id: null,
    region_id: output.region_id,
    class_id: output.class_id,
    team_id: output.team_id,
    finish_position: output.finish_position,
    start_position: null,
    qualifying_position: null,
    best_lap_ms: null,
    earned_pole: output.earned_pole,
    fastest_lap: output.fastest_lap,
    status: output.status,
    points: output.total_points,
    is_team_event: output.team_id !== null,
    result_revision: null,
    saved_at: output.created_at,
    created_at: output.created_at,
  }
}

// ---- Snapshot -------------------------------------------------------------------------------------

export interface ContextOption {
  seasonId: string
  championshipId: string
  label: string
  isActive: boolean
}

export interface SeasonSummary {
  title: string
  rank: number | null
  points: number
  wins: number
  podiums: number
  starts: number
  poles: number
  fastestLaps: number
  averageFinish: number | null
  hasResults: boolean
}

export interface DriverProfileSnapshot {
  driver: DriverRow
  options: ContextOption[]
  selected: ContextOption | null
  season: SeasonSummary
  recent: RecentResult[]
  trend: { label: string; subtitle: string }
  mmr: LeagueMmrDisplayRow | null
  isViewerRival: boolean
  trophies: { stats: TrophyCareerStats; states: MilestoneState[]; awards: AwardEntry[] } | null
  advanced: boolean
  // Pro only — empty for a free session (never computed, not merely hidden).
  seasonTrend: SeasonTrendPoint[]
  career: CareerSummary | null
  careerDetail: CareerDetail | null
  careerTrend: CareerTrendPoint[]
  progression: CareerProgressionPoint[]
  milestones: Milestone[]
  records: (DriverRecords & { biggestRival: BiggestRival | null; biggestRivalName: string | null }) | null
  classStrengths: ClassStrength[]
  trackHistory: TrackHistory[]
  raceLog: RaceLogRow[]
  ratingHistory: RatingPoint[]
}

export interface ProfileRequest {
  driverId: string
  leagueId: string
  advanced: boolean
  /** The viewer's own linked driver (for the rival marker); null if none. */
  viewerDriverId: string | null
  seasonId?: string | null
}

const EMPTY_SEASON: SeasonSummary = { title: 'No active season', rank: null, points: 0, wins: 0, podiums: 0, starts: 0, poles: 0, fastestLaps: 0, averageFinish: null, hasResults: false }

function contextOptions(assignments: SeasonDriverRow[], history: HistoryEntry[], seasons: Map<string, SeasonRow>, championships: Map<string, ChampionshipRow>): ContextOption[] {
  const seasonIds = new Set([...assignments.map((a) => a.season_id), ...history.map((h) => h.season_id)])
  const options: ContextOption[] = []
  for (const id of seasonIds) {
    const season = seasons.get(id)
    const championship = season ? championships.get(season.championship_id) : undefined
    if (!season || !championship) continue
    options.push({
      seasonId: id,
      championshipId: championship.id,
      label: `${championship.name} · ${season.name}`,
      isActive: season.is_active && season.status === 'active' && championship.status === 'active',
    })
  }
  const start = (o: ContextOption) => seasons.get(o.seasonId)?.start_date ?? ''
  return options.sort((a, b) => Number(b.isActive) - Number(a.isActive) || start(b).localeCompare(start(a)))
}

function selectContext(requestedSeasonId: string | null | undefined, options: ContextOption[], seasons: Map<string, SeasonRow>): ContextOption | null {
  if (requestedSeasonId) {
    const exact = options.find((o) => o.seasonId === requestedSeasonId)
    if (exact) return exact
  }
  const active = options.find((o) => o.isActive)
  if (active) return active
  const latest = (o: ContextOption) => seasons.get(o.seasonId)?.end_date ?? seasons.get(o.seasonId)?.start_date ?? ''
  return [...options].sort((a, b) => latest(b).localeCompare(latest(a)))[0] ?? null
}

export async function loadDriverProfile(request: ProfileRequest): Promise<DriverProfileSnapshot> {
  const { driverId, leagueId, advanced } = request
  const [drivers, championships, seasons, events, assignments, classes, history] = await Promise.all([
    getDrivers(leagueId, true),
    getChampionships(leagueId),
    getLeagueSeasons(leagueId),
    getLeagueEvents(leagueId),
    getDriverAssignments(driverId),
    listLeagueClasses(leagueId),
    getDriverHistory(driverId),
  ])
  const driver = drivers.find((d) => d.id === driverId)
  if (!driver) throw new Error('Driver not found.')

  const championshipById = new Map(championships.map((c) => [c.id, c]))
  const seasonById = new Map(seasons.map((s) => [s.id, s]))
  const eventById = new Map(events.map((e) => [e.id, e]))
  const classNames = new Map(classes.map((c) => [c.id, c.name]))

  const options = contextOptions(assignments, history, seasonById, championshipById)
  const selected = selectContext(request.seasonId, options, seasonById)
  const selectedSeason = selected ? seasonById.get(selected.seasonId) ?? null : null

  const [outputs, allDriverOutputs, leagueHistory, ratingHistory, mmr, rivals] = await Promise.all([
    selectedSeason ? getSeasonScoringOutputs(selectedSeason.id).catch(() => [] as ScoringOutputRow[]) : Promise.resolve([] as ScoringOutputRow[]),
    getDriverScoringOutputs(driverId).catch(() => [] as ScoringOutputRow[]),
    advanced ? getLeagueRaceHistory(leagueId).catch(() => [] as DriverHistoryRow[]) : Promise.resolve([] as DriverHistoryRow[]),
    advanced ? getRatingHistory(driverId).catch(() => [] as RatingPoint[]) : Promise.resolve([] as RatingPoint[]),
    getLeagueDriverMmrDisplay(leagueId, { seasonId: selected?.seasonId ?? null }).catch(() => null),
    selectedSeason && request.viewerDriverId && request.viewerDriverId !== driverId
      ? getSeasonRivals(selectedSeason.id).catch(() => null as SeasonRivalDisplay | null)
      : Promise.resolve(null as SeasonRivalDisplay | null),
  ])

  // Season summary: the SAME standings engine and tie-break as the Standings screen (all classes — never filtered by one class).
  let season: SeasonSummary = EMPTY_SEASON
  if (selectedSeason && selected) {
    const roster = await getSeasonRoster(selectedSeason.id).catch(() => [])
    const rosterByDriver = new Map(roster.map((r) => [r.driver_id, r]))
    const byEvent = new Map<string, EventScore[]>()
    for (const output of outputs) {
      const score = eventScoreFromOutput(output, eventById.get(output.event_id), rosterByDriver.get(output.driver_id))
      byEvent.set(output.event_id, [...(byEvent.get(output.event_id) ?? []), score])
    }
    const info = new Map<string, DriverInfo>(
      drivers.map((d) => [d.id, { name: d.display_name, number: rosterByDriver.get(d.id)?.number_override?.trim() || (d.driver_number ?? '') }]),
    )
    const { rows } = rankedDriverRows([...byEvent.values()], info, standingsConfigForSeason(selectedSeason))
    const row = rows.find((r) => r.driverId === driverId)
    season = row
      ? { title: selected.label, rank: row.position, points: row.points, wins: row.wins, podiums: row.podiums, starts: row.starts, poles: row.poles, fastestLaps: row.fastestLaps, averageFinish: row.averageFinish, hasResults: true }
      : { ...EMPTY_SEASON, title: selected.label }
  }

  // Individual performance excludes team-event history; scored-but-not-yet-committed events are folded in from scoring_outputs.
  const historyEventIds = new Set(history.map((h) => h.event_id))
  const merged: HistoryEntry[] = [...history, ...allDriverOutputs.filter((o) => !historyEventIds.has(o.event_id)).map(outputAsHistory)]
  const individualRaces = merged.filter((h) => isRaceEntry(h) && !h.is_team_event)
  const qualifying = merged.filter((h) => !isRaceEntry(h) && !h.is_team_event)
  const selectedRaces = selected ? individualRaces.filter((h) => h.season_id === selected.seasonId) : individualRaces
  const recent = recentForm(selectedRaces, eventById)

  const isViewerRival =
    Boolean(request.viewerDriverId) &&
    (rivals?.rivals?.find((r) => r.driver_id === request.viewerDriverId)?.rival_driver_id ?? null) === driverId

  // Trophy Case (free): scoped to the selected championship, like iOS.
  let trophies: DriverProfileSnapshot['trophies'] = null
  if (selected) {
    const championshipSeasons = seasons.filter((s) => s.championship_id === selected.championshipId)
    const completed = championshipSeasons.filter((s) => s.status === 'completed')
    const [awards, completedOutputs, regions] = await Promise.all([
      getDriverLiveStandingAwards(selected.championshipId, driverId).catch(() => []),
      Promise.all(completed.map(async (s) => [s.id, await getSeasonScoringOutputs(s.id).catch(() => [] as ScoringOutputRow[])] as const)),
      listLeagueRegions(leagueId).catch(() => []),
    ])
    const info = new Map<string, DriverInfo>(drivers.map((d) => [d.id, { name: d.display_name, number: d.driver_number ?? '' }]))
    const stats = raceTrophyStats(history, selected.championshipId, eventById)
    const titles = championshipTitles({
      driverId,
      completedSeasons: completed,
      outputsBySeason: new Map(completedOutputs),
      eventById,
      driverInfo: info,
      configFor: standingsConfigForSeason,
      awards,
    })
    stats.championshipTitles = titles.championships
    stats.subseriesTitles = titles.subseries
    trophies = {
      stats,
      states: trophyMilestones(stats),
      awards: awardEntries({
        awards,
        seasonNames: new Map(seasons.map((s) => [s.id, s.name])),
        classNames,
        regionNames: new Map(regions.map((r) => [r.id, r.name])),
        championshipName: championshipById.get(selected.championshipId)?.name ?? 'Championship',
      }),
    }
  }

  const base: DriverProfileSnapshot = {
    driver,
    options,
    selected,
    season,
    recent,
    trend: trendSummary(recent),
    mmr: mmr?.ok && mmr.state === 'public' ? (mmr.drivers ?? []).find((d) => d.driver_id === driverId) ?? null : null,
    isViewerRival,
    trophies,
    advanced,
    seasonTrend: [],
    career: null,
    careerDetail: null,
    careerTrend: [],
    progression: [],
    milestones: [],
    records: null,
    classStrengths: [],
    trackHistory: [],
    raceLog: [],
    ratingHistory: [],
  }
  if (!advanced) return base

  // ---- Pro analytics ----------------------------------------------------------------------------
  let trackNames = new Map<string, string>()
  if (selected) {
    const game = championshipById.get(selected.championshipId)?.game_id
    if (game) trackNames = new Map((await getTracks(game, leagueId).catch(() => [])).map((t) => [t.id, t.name]))
  }
  const detail = buildCareerDetail(driverId, leagueHistory, seasons)
  const tracks = trackHistory(individualRaces, eventById, trackNames)
  const rival = biggestRival(driverId, leagueHistory)
  const pointsByEvent = new Map<string, number>()
  for (const output of outputs.filter((o) => o.driver_id === driverId)) pointsByEvent.set(output.event_id, (pointsByEvent.get(output.event_id) ?? 0) + output.total_points)
  const joinedAt = assignments.map((a) => a.created_at).filter(Boolean).sort()[0] ?? null

  return {
    ...base,
    seasonTrend: selected ? seasonTrend(driverId, selected.seasonId, events, pointsByEvent, selectedRaces, qualifying.filter((q) => q.season_id === selected.seasonId)) : [],
    career: careerSummary(individualRaces, assignments.map((a) => a.season_id)),
    careerDetail: detail,
    careerTrend: careerTrend(individualRaces, eventById),
    progression: careerProgression(individualRaces, eventById),
    milestones: buildMilestones({ races: individualRaces, qualifying, joinedAt, career: detail, seasons: seasonById, eventById }),
    records: {
      ...driverRecords(individualRaces, tracks, detail),
      biggestRival: rival,
      biggestRivalName: rival ? drivers.find((d) => d.id === rival.driverId)?.display_name ?? null : null,
    },
    classStrengths: classStrengths(individualRaces, eventById, classNames),
    trackHistory: tracks,
    raceLog: raceLog(merged.filter(isRaceEntry), eventById, classNames),
    ratingHistory,
  }
}

// ---- Driver management & self-service ------------------------------------------------------------

export interface SelfProfilePatch {
  display_name: string
  first_name: string | null
  last_name: string | null
  requested_driver_number: string | null
  driver_number_request_status: 'pending' | null
  bio: string | null
  platform_id: string | null
  racing_id: string | null
  profile_image_path?: string | null
  image_url?: string | null
}

/** Only self-service fields — the `vrc_guard_driver_self_update` trigger rejects any protected column for a non-manager. */
export async function updateSelfDriverProfile(driverId: string, patch: Partial<SelfProfilePatch>): Promise<void> {
  const { error } = await supabase
    .from('drivers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', driverId)
  if (error) throw error
}

export async function getLinkedDriver(leagueId: string, userId: string): Promise<DriverRow | null> {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .eq('league_id', leagueId)
    .eq('user_id', userId)
    .limit(1)
    .returns<DriverRow[]>()
  if (error) throw error
  return data?.[0] ?? null
}

export interface MemberAccount {
  membership_id: string
  user_id: string
  email: string | null
  display_name: string | null
  roles: string[]
  assigned_driver_id: string | null
  assigned_driver_name: string | null
}

/** Manager-only (the RPC returns no rows otherwise) and the only place an account email is exposed. */
export async function getLeagueMemberAccounts(leagueId: string): Promise<MemberAccount[]> {
  const { data, error } = await supabase.rpc('vrc_league_member_accounts', { p_league: leagueId })
  if (error) throw error
  return (data ?? []) as MemberAccount[]
}

/** Assign, change or (userId = null) clear the account linked to a driver. The RPC enforces manager permission and one-account-per-driver. */
export async function assignDriverAccount(driverId: string, userId: string | null): Promise<void> {
  const { error } = await supabase.rpc('vrc_assign_driver_account', { p_driver: driverId, p_user: userId })
  if (error) throw error
}

export interface DriverLinkResult {
  ok: boolean
  status?: string | null
  error?: string | null
  link_valid_at?: string | null
}

export function driverLinkFailureMessage(error: string | null | undefined): string {
  switch (error) {
    case 'not_authorized':
      return 'Only a league Owner or Admin can create a Global Rating link.'
    case 'mfa_required':
      return 'Confirm a fresh two-factor code to create this permanent link.'
    case 'account_ineligible':
      return 'That account is not an active member of this league.'
    case 'account_mfa_required':
      return 'That account must have two-factor authentication enabled before it can be linked.'
    case 'account_already_linked':
      return 'That account is already permanently linked to another driver in this league.'
    case 'link_immutable':
      return 'This driver is already permanently linked to an account and can’t be reassigned. Archive it and create a new driver to use a different account.'
    case 'rate_limited':
      return 'Too many attempts just now. Wait a minute and try again.'
    default:
      return 'The Global Rating link could not be created. Try again.'
  }
}

/** Permanent Global Rating link (server re-verifies a FRESH MFA confirmation on this session; the caller must step up immediately before). */
export async function linkDriverToAccount(driverId: string, accountId: string): Promise<DriverLinkResult> {
  const { data, error } = await supabase.rpc('vrc_link_league_driver_to_account', { p_league_driver_id: driverId, p_account_id: accountId })
  if (error) throw error
  return data as DriverLinkResult
}

export interface DriverLinkStatus {
  driver_id: string
  is_linked: boolean
  link_status: string | null
  link_valid_at: string | null
}

/** Manager-only, privacy-safe: whether a permanent link exists — never the account. */
export async function getDriverLinkStatuses(leagueId: string): Promise<DriverLinkStatus[]> {
  const { data, error } = await supabase.rpc('vrc_league_driver_link_status', { p_league: leagueId })
  if (error) throw error
  return (data ?? []) as DriverLinkStatus[]
}

export async function archiveDriver(driverId: string): Promise<void> {
  const { error } = await supabase.rpc('vrc_archive_driver', { p_driver: driverId })
  if (error) throw error
}

export async function updateDriverAsManager(driverId: string, patch: Partial<DriverRow> & { driver_number_request_status?: string | null; requested_driver_number?: string | null }): Promise<void> {
  const { error } = await supabase
    .from('drivers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', driverId)
  if (error) throw error
}
