/**
 * Centralized TanStack Query key builders. Two tile instances requesting the
 * same data (e.g. two Championship Standings tiles on the same season) share
 * one cache entry/network call as long as they build their key from here
 * rather than inlining ad hoc arrays — this file is the thing that actually
 * guarantees the "no duplicate queries" requirement, not TanStack Query
 * itself.
 */
export const dashboardKeys = {
  activeSeason: (leagueId: string) => ['league', leagueId, 'activeSeason'] as const,
  drivers: (leagueId: string) => ['league', leagueId, 'drivers'] as const,
  driver: (driverId: string) => ['driver', driverId] as const,
  seasonEvents: (seasonId: string) => ['season', seasonId, 'events'] as const,
  event: (eventId: string) => ['event', eventId] as const,
  eventSession: (eventId: string) => ['event', eventId, 'session'] as const,
  driverHistory: (driverId: string) => ['driver', driverId, 'history'] as const,
  seasonDriverHistory: (seasonId: string) => ['season', seasonId, 'driverHistory'] as const,
  latestStandings: (seasonId: string, type: string, groupKey: string | null) =>
    ['season', seasonId, 'standings', type, groupKey ?? 'all'] as const,
  previousStandings: (seasonId: string, type: string, groupKey: string | null) =>
    ['season', seasonId, 'standings', type, groupKey ?? 'all', 'previous'] as const,
  standingsHistory: (seasonId: string, type: string) => ['season', seasonId, 'standingsHistory', type] as const,
  standingsGroups: (seasonId: string, type: string) => ['season', seasonId, 'standingsGroups', type] as const,
  resultSet: (eventId: string, kind: string) => ['event', eventId, 'resultSet', kind] as const,
  raceResults: (resultSetId: string) => ['resultSet', resultSetId, 'raceResults'] as const,
  qualifyingResults: (resultSetId: string) => ['resultSet', resultSetId, 'qualifyingResults'] as const,
  practiceAggregates: (eventId: string, phase: string) => ['event', eventId, 'practiceAggregates', phase] as const,
  predictionRun: (eventId: string, category: string) => ['event', eventId, 'predictionRun', category] as const,
  leagueMembers: (leagueId: string) => ['league', leagueId, 'members'] as const,
  leagueInvitations: (leagueId: string) => ['league', leagueId, 'invitations'] as const,
  leagueAnnouncements: (leagueId: string) => ['league', leagueId, 'announcements'] as const,
  tracks: (game: string, leagueId: string) => ['league', leagueId, 'tracks', game] as const,
  classes: (leagueId: string) => ['league', leagueId, 'classes'] as const,
  regions: (leagueId: string) => ['league', leagueId, 'regions'] as const,
  teams: (leagueId: string) => ['league', leagueId, 'teams'] as const,
  scoringOutputs: (seasonId: string) => ['season', seasonId, 'scoringOutputs'] as const,
  resultAudit: (eventId: string) => ['event', eventId, 'resultAudit'] as const,
  captureSummaries: (eventId: string) => ['event', eventId, 'captureSummaries'] as const,
}
