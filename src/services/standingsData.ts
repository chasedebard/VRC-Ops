import { getSeasonEvents } from '@/services/events'
import { getEventClassIdsFor, getRaceResultSets } from '@/services/results'
import { getSeasonScoringOutputs } from '@/services/standings'
import { getDrivers, getSeasonRoster } from '@/services/drivers'
import { getSeasonTeams } from '@/services/seasonTeams'
import { listLeagueClasses, listLeagueRegions } from '@/services/setup'
import { buildSeasonScoringRule } from '@/utils/scoring'
import {
  RFS_DEFAULT_CONFIG,
  SubSeriesPlanner,
  eventScoreFromOutput,
  type DriverInfo,
  type SeriesEventScores,
  type StandingsScoringConfig,
} from '@/utils/standingsEngine'
import type {
  ChampionshipRow,
  ClassRow,
  DriverRow,
  EventRow,
  RegionRow,
  ScoringOutputRow,
  SeasonDriverRow,
  SeasonRow,
  TeamRow,
} from '@/types/database'

/** The season's standings config: the season-derived bonus rule + drop rounds (participation points are not configurable). */
export function standingsConfigForSeason(season: SeasonRow | null | undefined): StandingsScoringConfig {
  const rule = buildSeasonScoringRule(season)
  return {
    positionPoints: rule.positionPoints,
    poleBonus: rule.poleBonus,
    fastestLapBonus: rule.fastestLapBonus,
    participationPoints: RFS_DEFAULT_CONFIG.participationPoints,
    dropRounds: season?.drop_rounds ?? 0,
  }
}

export interface SeasonStandingsContext {
  season: SeasonRow
  championship: ChampionshipRow
  config: StandingsScoringConfig
  events: EventRow[]
  outputs: ScoringOutputRow[]
  eventScores: SeriesEventScores[]
  drivers: DriverRow[]
  driverInfo: Map<string, DriverInfo>
  roster: (SeasonDriverRow & { drivers: DriverRow })[]
  teams: TeamRow[]
  teamInfo: Map<string, string>
  classes: ClassRow[]
  regions: RegionRow[]
  planner: SubSeriesPlanner
  hasOfficialResults: boolean
  lastUpdated: string | null
  presentClassIds: Set<string>
  presentRegionIds: Set<string>
  hasTeamData: boolean
}

/** The active season roster: active drivers who are active on this season's roster, alphabetised (results entry starts from here). */
export function activeRosterDrivers(
  drivers: DriverRow[],
  roster: Pick<SeasonDriverRow, 'driver_id' | 'is_active'>[],
): DriverRow[] {
  const active = new Set(roster.filter((r) => r.is_active).map((r) => r.driver_id))
  return drivers
    .filter((d) => d.is_active && active.has(d.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, undefined, { numeric: true, sensitivity: 'base' }))
}

/**
 * Loads everything the standings need in one pass and builds the series planner the same way iOS does
 * (`VRCSubSeriesPlanner.load`): best-effort lookups whose every fallback errs toward MORE remaining events, flagged
 * `isReliable = false` so a degraded read can never award or revoke a series trophy.
 */
export async function loadSeasonStandingsContext(
  season: SeasonRow,
  championship: ChampionshipRow,
): Promise<SeasonStandingsContext> {
  const leagueId = season.league_id
  const [outputs, drivers, classes, regions, teams, events, roster] = await Promise.all([
    getSeasonScoringOutputs(season.id),
    getDrivers(leagueId, true),
    listLeagueClasses(leagueId),
    listLeagueRegions(leagueId),
    getSeasonTeams(season.id, true),
    getSeasonEvents(season.id),
    getSeasonRoster(season.id),
  ])

  const outputEventIds = new Set(outputs.map((o) => o.event_id))
  const undecided = events.map((e) => e.id).filter((id) => !outputEventIds.has(id))
  let resultSets: { event_id: string; state: string }[] | null = null
  try {
    resultSets = await getRaceResultSets(undecided)
  } catch {
    resultSets = null
  }
  const official = SubSeriesPlanner.officialEventIds(outputEventIds, resultSets ?? [])
  const remaining = SubSeriesPlanner.unfinishedEvents(events, official)
  let eventClassIds: Map<string, string[]> | null
  try {
    eventClassIds = await getEventClassIdsFor(remaining.map((e) => e.id))
  } catch {
    eventClassIds = null
  }
  const eligible = new Set(activeRosterDrivers(drivers, roster).map((d) => d.id))
  const planner = new SubSeriesPlanner({
    seasonEvents: events,
    officialEventIds: official,
    eventClassIds,
    eligibleDriverIds: eligible,
    isReliable: resultSets !== null && eventClassIds !== null,
  })

  const rosterByDriver = new Map(roster.map((r) => [r.driver_id, r]))
  const eventsById = new Map(events.map((e) => [e.id, e]))
  const byEvent = new Map<string, ScoringOutputRow[]>()
  for (const output of outputs) byEvent.set(output.event_id, [...(byEvent.get(output.event_id) ?? []), output])
  const eventScores: SeriesEventScores[] = Array.from(byEvent, ([eventId, rows]) => ({
    eventId,
    round: eventsById.get(eventId)?.round ?? 0,
    scores: rows.map((o) => eventScoreFromOutput(o, eventsById.get(o.event_id), rosterByDriver.get(o.driver_id))),
  }))

  const driverInfo = new Map<string, DriverInfo>(
    drivers.map((d) => [
      d.id,
      { name: d.display_name, number: rosterByDriver.get(d.id)?.number_override?.toString().trim() || (d.driver_number?.toString() ?? '') },
    ]),
  )
  const allScores = eventScores.flatMap((e) => e.scores)
  const createdAt = outputs.map((o) => o.created_at).filter(Boolean).sort()

  return {
    season,
    championship,
    config: standingsConfigForSeason(season),
    events,
    outputs,
    eventScores,
    drivers,
    driverInfo,
    roster,
    teams,
    teamInfo: new Map(teams.map((t) => [t.id, t.name])),
    classes,
    regions,
    planner,
    hasOfficialResults: outputs.length > 0,
    lastUpdated: createdAt[createdAt.length - 1] ?? null,
    presentClassIds: new Set(allScores.map((s) => s.classId).filter((id): id is string => Boolean(id))),
    presentRegionIds: new Set(allScores.map((s) => s.regionId).filter((id): id is string => Boolean(id))),
    hasTeamData: allScores.some((s) => s.teamId),
  }
}

export interface StandingsTab {
  id: string
  title: string
  kind: 'overall' | 'class' | 'region' | 'team'
  scopeId: string | null
}

/**
 * Standings tabs follow the Official data (only groupings that actually scored get a tab) AND respect the championship
 * feature flags: a disabled grouping never produces a tab even when historical rows still carry those ids.
 */
export function buildStandingsTabs(ctx: SeasonStandingsContext): StandingsTab[] {
  const classesEnabled = ctx.championship.classes_enabled
  const regionsEnabled = ctx.championship.regions_enabled
  const teamsEnabled = ctx.season.teams_enabled
  const tabs: StandingsTab[] = [{ id: 'overall', title: 'Championship', kind: 'overall', scopeId: null }]
  if (classesEnabled) {
    for (const c of ctx.classes) {
      if (ctx.presentClassIds.has(c.id)) tabs.push({ id: `class-${c.id}`, title: c.name, kind: 'class', scopeId: c.id })
    }
  }
  if (regionsEnabled) {
    for (const r of ctx.regions) {
      if (ctx.presentRegionIds.has(r.id)) tabs.push({ id: `region-${r.id}`, title: r.name, kind: 'region', scopeId: r.id })
    }
  }
  if (teamsEnabled && ctx.hasTeamData) tabs.push({ id: 'team', title: 'Team', kind: 'team', scopeId: null })
  return tabs
}
