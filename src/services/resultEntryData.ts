import { getEvent, getEventDrivers } from '@/services/events'
import { getChampionship, getSeason } from '@/services/championships'
import { getDrivers, getSeasonRoster } from '@/services/drivers'
import { getSeasonTeams } from '@/services/seasonTeams'
import {
  getEventClassIds,
  getEventDnsDriverIds,
  getPenalties,
  getQualifyingResults,
  getRaceResults,
  getResultSet,
  getScoreAdjustments,
} from '@/services/results'
import { getSeasonClassIds, getSeasonRegionIds, listLeagueClasses, listLeagueRegions } from '@/services/setup'
import { activeRosterDrivers } from '@/services/standingsData'
import type {
  ChampionshipRow,
  ClassRow,
  DriverRow,
  EventRow,
  PenaltyRow,
  QualifyingResultRow,
  RaceResultRow,
  RegionRow,
  ResultSetRow,
  ScoreAdjustmentRow,
  SeasonDriverRow,
  SeasonRow,
  TeamRow,
} from '@/types/database'

/** Everything the qualifying and race entry screens need for one event (mirror of `VRCResultEntryStore.load`). */
export interface ResultEntryContext {
  event: EventRow
  season: SeasonRow
  championship: ChampionshipRow
  allDrivers: DriverRow[]
  /** The active season roster — results entry always starts from it; drivers who did not take part are recorded as DNS. */
  rosterDrivers: DriverRow[]
  roster: (SeasonDriverRow & { drivers: DriverRow })[]
  classes: ClassRow[]
  /** Classes allowed on this season (the picker list when classes are enabled). */
  seasonClassIds: Set<string>
  regions: RegionRow[]
  seasonRegionIds: Set<string>
  teams: TeamRow[]
  eventClassIds: string[]
  dnsDriverIds: Set<string>
  /** Event-level entry list (legacy eligibility); never used to hide a roster driver. */
  eventEntryDriverIds: Set<string>
  qualifyingSet: ResultSetRow | null
  raceSet: ResultSetRow | null
  qualifyingRows: QualifyingResultRow[]
  raceRows: RaceResultRow[]
  penalties: PenaltyRow[]
  adjustments: ScoreAdjustmentRow[]
}

export async function loadResultEntryContext(eventId: string): Promise<ResultEntryContext> {
  const event = await getEvent(eventId)
  if (!event) throw new Error('Event not found.')
  const [season, championship] = await Promise.all([getSeason(event.season_id), getChampionship(event.championship_id)])
  if (!season || !championship) throw new Error('This event’s season or championship could not be found.')

  const [allDrivers, roster, classes, regions, seasonClassIds, seasonRegionIds, teams, eventClassIds, dnsDriverIds, entries, qualifyingSet, raceSet, penalties, adjustments] =
    await Promise.all([
      getDrivers(event.league_id, true),
      getSeasonRoster(season.id),
      listLeagueClasses(event.league_id),
      listLeagueRegions(event.league_id),
      getSeasonClassIds(season.id),
      getSeasonRegionIds(season.id),
      // Season-scoped, not league-wide: a result row can only carry a team from this same season (server-enforced).
      season.teams_enabled ? getSeasonTeams(season.id) : Promise.resolve([] as TeamRow[]),
      getEventClassIds(event.id),
      getEventDnsDriverIds(event.id).catch(() => new Set<string>()),
      getEventDrivers(event.id).catch(() => []),
      getResultSet(event.id, 'qualifying'),
      getResultSet(event.id, 'race'),
      getPenalties(event.id).catch(() => []),
      getScoreAdjustments(event.id).catch(() => []),
    ])

  const [qualifyingRows, raceRows] = await Promise.all([
    qualifyingSet ? getQualifyingResults(qualifyingSet.id) : Promise.resolve([] as QualifyingResultRow[]),
    raceSet ? getRaceResults(raceSet.id) : Promise.resolve([] as RaceResultRow[]),
  ])

  return {
    event,
    season,
    championship,
    allDrivers,
    rosterDrivers: activeRosterDrivers(allDrivers, roster),
    roster,
    classes,
    seasonClassIds: new Set(seasonClassIds),
    regions,
    seasonRegionIds: new Set(seasonRegionIds),
    teams,
    eventClassIds,
    dnsDriverIds,
    eventEntryDriverIds: new Set(entries.map((e) => e.driver_id)),
    qualifyingSet,
    raceSet,
    qualifyingRows,
    raceRows,
    penalties,
    adjustments,
  }
}

/** A blocking event-setup problem that prevents any results/qualifying entry (region is event-level; ≥ 1 class required). */
export function eventSetupIssue(event: Pick<EventRow, 'region_id'>, eventClassIds: string[]): string | null {
  if (!event.region_id) {
    return 'This event is missing region data. Edit the race and re-save it, or contact support if the problem persists.'
  }
  if (eventClassIds.length === 0) return 'Add at least one class to the event before entering results or qualifying.'
  return null
}
