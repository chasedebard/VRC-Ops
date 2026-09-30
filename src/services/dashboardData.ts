import { supabase } from '@/supabase/client'
import { getDrivers, getSeasonRoster } from '@/services/drivers'
import { getSeasonEvents } from '@/services/events'
import { getEventSession } from '@/services/raceControl'
import { getRaceResults, getResultSetsForEvents } from '@/services/results'
import { getSeasonScoringOutputs } from '@/services/standings'
import { getSeasonClassIds, getSeasonRegionIds, listLeagueClasses, listLeagueRegions } from '@/services/setup'
import { getLeagueInvitations } from '@/services/invitations'
import { listAnnouncements } from '@/services/announcements'
import { getTracks } from '@/services/tracks'
import { getSeasonRivals } from '@/services/rivals'
import { getLatestPredictionRuns } from '@/services/predictions'
import { getDriverHistory, getLatestRating, type RatingPoint } from '@/services/driverProfileData'
import { standingsConfigForSeason } from '@/services/standingsData'
import { resolveActiveSeason } from '@/utils/activeSeason'
import {
  NO_SIGNALS,
  adminAttention,
  lastFinalizedRace,
  racePhase,
  setupWarnings,
  upcomingEvent,
  type AdminAttention,
  type PrioritySignals,
  type RaceWeekendPhase,
} from '@/utils/dashboardModel'
import { eventScoreFromOutput, rankedDriverRows, type DriverInfo, type EventScore, type SeriesEventScores, type StandingRow } from '@/utils/standingsEngine'
import { recentForm, type RecentResult } from '@/utils/driverAnalytics'
import { RACE_CATEGORY, CHAMPIONSHIP_CATEGORY, type PredictionSet } from '@/types/predictions'
import type {
  ChampionshipRow,
  ClassRow,
  DriverRow,
  EventRow,
  EventSessionRow,
  LeagueAnnouncementRow,
  PenaltyRow,
  RaceResultRow,
  RegionRow,
  ResultSetRow,
  SeasonDriverRow,
  SeasonRow,
  TrackRow,
  VrcRole,
} from '@/types/database'

/**
 * Home dashboard data (iOS `VRCAdminHomeViewModel.load`). Standings are computed from `scoring_outputs` with the same engine as the Standings
 * screen, predictions are READ from server-computed `prediction_runs` (never calculated here), and every optional read degrades to an empty
 * section instead of failing the whole page. Reads that a viewer's role doesn't need are not issued (invitations: managers only).
 */

export interface LastRace {
  event: EventRow
  resultSet: ResultSetRow
  winner: RaceResultRow | null
  pole: RaceResultRow | null
  fastestLap: RaceResultRow | null
  trackName: string | null
  className: string | null
}

export interface MyDriverDashboard {
  driver: DriverRow
  standing: StandingRow | null
  recent: RecentResult[]
  rating: RatingPoint | null
  rivalName: string | null
  rivalRecord: string | null
}

export interface DashboardPredictions {
  race: PredictionSet | null
  championship: PredictionSet | null
}

export interface DashboardData {
  championship: ChampionshipRow
  season: SeasonRow
  events: EventRow[]
  resultSets: ResultSetRow[]
  drivers: DriverRow[]
  driversById: Map<string, DriverRow>
  roster: SeasonDriverRow[]
  classes: ClassRow[]
  regions: RegionRow[]
  tracks: TrackRow[]
  eventScores: SeriesEventScores[]
  driverInfo: Map<string, DriverInfo>
  standings: StandingRow[]
  seasonClassIds: string[]
  seasonRegionIds: string[]
  upcoming: EventRow | null
  upcomingSession: EventSessionRow | null
  upcomingClassName: string | null
  upcomingRegionName: string | null
  upcomingTrackName: string | null
  lastRace: LastRace | null
  phase: RaceWeekendPhase
  warnings: string[]
  signals: PrioritySignals
  attention: AdminAttention | null
  announcements: LeagueAnnouncementRow[]
  stewardPendingEvents: EventRow[]
  recentPenalties: PenaltyRow[]
  myDriver: MyDriverDashboard | null
  predictions: DashboardPredictions | null
  currentRound: number
  totalEvents: number
}

async function recentPenalties(leagueId: string, limit = 5): Promise<PenaltyRow[]> {
  const { data, error } = await supabase
    .from('penalties')
    .select('*')
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<PenaltyRow[]>()
  if (error) throw error
  return data ?? []
}

export interface DashboardRequest {
  leagueId: string
  roles: Set<VrcRole>
  userId: string | null
  /** Predictions enabled for this viewer: premium entitlement AND current AI consent (the server enforces both regardless). */
  includePredictions: boolean
}

export async function loadDashboard(request: DashboardRequest): Promise<DashboardData | null> {
  const { leagueId, roles } = request
  const active = await resolveActiveSeason(leagueId)
  if (!active) return null
  const { championship, season } = active
  const isManager = roles.has('owner') || roles.has('admin')
  const isSteward = roles.has('marshal')

  const [events, roster, drivers, classes, regions, seasonClassIds, seasonRegionIds, tracks, outputs, announcements, invitations, penalties] = await Promise.all([
    getSeasonEvents(season.id),
    getSeasonRoster(season.id).catch(() => []),
    getDrivers(leagueId, true),
    listLeagueClasses(leagueId).catch(() => [] as ClassRow[]),
    listLeagueRegions(leagueId).catch(() => [] as RegionRow[]),
    getSeasonClassIds(season.id).catch(() => [] as string[]),
    getSeasonRegionIds(season.id).catch(() => [] as string[]),
    getTracks(championship.game_id, leagueId).catch(() => [] as TrackRow[]),
    getSeasonScoringOutputs(season.id).catch(() => []),
    listAnnouncements(leagueId).catch(() => [] as LeagueAnnouncementRow[]),
    isManager ? getLeagueInvitations(leagueId).catch(() => []) : Promise.resolve([]),
    isSteward ? recentPenalties(leagueId).catch(() => [] as PenaltyRow[]) : Promise.resolve([] as PenaltyRow[]),
  ])
  const resultSets = await getResultSetsForEvents(events.map((e) => e.id)).catch(() => [] as ResultSetRow[])

  const eventById = new Map(events.map((e) => [e.id, e]))
  const rosterByDriver = new Map(roster.map((r) => [r.driver_id, r as SeasonDriverRow]))
  const driversById = new Map(drivers.map((d) => [d.id, d]))
  const driverInfo = new Map<string, DriverInfo>(
    drivers.map((d) => [d.id, { name: d.display_name, number: rosterByDriver.get(d.id)?.number_override?.trim() || (d.driver_number ?? '') }]),
  )
  const byEvent = new Map<string, EventScore[]>()
  for (const output of outputs) {
    byEvent.set(output.event_id, [...(byEvent.get(output.event_id) ?? []), eventScoreFromOutput(output, eventById.get(output.event_id), rosterByDriver.get(output.driver_id))])
  }
  const eventScores: SeriesEventScores[] = [...byEvent].map(([eventId, scores]) => ({ eventId, round: eventById.get(eventId)?.round ?? 0, scores }))
  const config = standingsConfigForSeason(season)
  const standings = rankedDriverRows(eventScores.map((e) => e.scores), driverInfo, config).rows

  const upcoming = upcomingEvent(events, resultSets)
  const last = lastFinalizedRace(events, resultSets)
  const upcomingSession = upcoming ? await getEventSession(upcoming.id).catch(() => null) : null
  const classNames = new Map(classes.map((c) => [c.id, c.name]))
  const regionNames = new Map(regions.map((r) => [r.id, r.name]))
  const trackNames = new Map(tracks.map((t) => [t.id, t.name]))

  let lastRace: LastRace | null = null
  if (last) {
    const rows = await getRaceResults(last.raceSet.id).catch(() => [] as RaceResultRow[])
    const classId = last.event.class_id
    lastRace = {
      event: last.event,
      resultSet: last.raceSet,
      winner: rows.find((r) => r.finish_position === 1 && r.status === 'fin') ?? null,
      pole: rows.find((r) => r.earned_pole) ?? null,
      fastestLap: rows.find((r) => r.fastest_lap) ?? null,
      trackName: last.event.track_id ? trackNames.get(last.event.track_id) ?? null : null,
      className: classId ? classNames.get(classId) ?? null : null,
    }
  }

  const activeRoster = roster.filter((r) => r.is_active)
  const pendingNumberRequests = isManager ? drivers.filter((d) => d.driver_number_request_status === 'pending').map((d) => d.display_name) : []
  const pendingInvitationCount = invitations.filter((i) => i.status === 'pending').length
  const stewardPendingEvents = isSteward
    ? events
        .filter((e) => resultSets.some((s) => s.event_id === e.id && (s.state === 'submitted' || s.state === 'in_review')))
        .sort((a, b) => a.round - b.round)
    : []
  const attention = isManager
    ? adminAttention({
        events,
        resultSets,
        roster,
        seasonClassCount: seasonClassIds.length,
        seasonRegionCount: seasonRegionIds.length,
        upcomingEvent: upcoming,
        pendingInvitationCount,
        pendingDriverNumberRequests: pendingNumberRequests,
      })
    : null
  const signals: PrioritySignals = {
    ...NO_SIGNALS,
    isEventSoon: upcoming?.event_date ? upcoming.event_date <= new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10) : false,
    missingResultsCount: attention ? attention.missingRaceEvents.length : 0,
    pendingInvitationCount,
    pendingDriverNumberRequestCount: pendingNumberRequests.length,
    stewardReviewCount: stewardPendingEvents.length,
  }

  const phase = racePhase({
    hasActiveSeason: season.is_active || season.status === 'active',
    hasSchedule: events.length > 0,
    hasRoster: activeRoster.length > 0,
    upcomingEvent: upcoming,
    isUpcomingEventLive: upcoming?.status === 'live',
    lastFinalizedEvent: last?.event ?? null,
  })

  // My driver (the signed-in user's linked driver in this league).
  const mine = request.userId ? drivers.find((d) => d.user_id === request.userId) ?? null : null
  let myDriver: MyDriverDashboard | null = null
  if (mine) {
    const [history, rating, rivals] = await Promise.all([
      getDriverHistory(mine.id).catch(() => []),
      getLatestRating(mine.id).catch(() => null),
      getSeasonRivals(season.id).catch(() => null),
    ])
    const races = history.filter((h) => h.result_kind === 'race' && !h.is_team_event)
    const rivalRow = rivals?.ok ? rivals.rivals?.find((r) => r.driver_id === mine.id) : undefined
    const rivalId = rivalRow?.rival_driver_id ?? null
    myDriver = {
      driver: mine,
      standing: standings.find((s) => s.driverId === mine.id) ?? null,
      recent: recentForm(races, eventById, 5),
      rating,
      rivalName: rivalId ? rivalRow?.rival_display_name ?? driversById.get(rivalId)?.display_name ?? null : null,
      rivalRecord: rivalRow?.record_text ?? null,
    }
  }

  // Predictions: server-calculated runs only; nothing is computed or estimated on the client.
  let predictions: DashboardPredictions | null = null
  if (request.includePredictions && championship.predictions_enabled) {
    const runs = await getLatestPredictionRuns(season.id).catch(() => [])
    predictions = {
      race: runs.find((r) => r.category === RACE_CATEGORY && r.event_id === (upcoming?.id ?? null) && r.payload)?.payload ?? null,
      championship: runs.find((r) => r.category === CHAMPIONSHIP_CATEGORY && r.payload)?.payload ?? null,
    }
  }

  const scored = new Set(outputs.map((o) => o.event_id))
  return {
    championship,
    season,
    events,
    resultSets,
    drivers,
    driversById,
    roster,
    classes,
    regions,
    tracks,
    eventScores,
    driverInfo,
    standings,
    seasonClassIds,
    seasonRegionIds,
    upcoming,
    upcomingSession,
    upcomingClassName: upcoming?.class_id ? classNames.get(upcoming.class_id) ?? null : null,
    upcomingRegionName: upcoming?.region_id ? regionNames.get(upcoming.region_id) ?? null : null,
    upcomingTrackName: upcoming?.track_id ? trackNames.get(upcoming.track_id) ?? null : null,
    lastRace,
    phase,
    warnings: isManager
      ? setupWarnings({
          championship,
          season,
          eventCount: events.length,
          activeRosterCount: activeRoster.length,
          trackCount: tracks.length,
          seasonClassCount: seasonClassIds.length,
          seasonRegionCount: seasonRegionIds.length,
        })
      : [],
    signals,
    attention,
    announcements,
    stewardPendingEvents,
    recentPenalties: penalties,
    myDriver,
    predictions,
    currentRound: Math.max(0, ...[...scored].map((id) => eventById.get(id)?.round ?? 0)),
    totalEvents: events.filter((e) => e.status !== 'cancelled' && e.status !== 'archived').length,
  }
}
