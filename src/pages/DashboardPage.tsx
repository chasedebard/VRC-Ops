import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { getDrivers } from '@/services/drivers'
import { getSeasonEvents, resolveLastCompletedEvent, resolveUpcomingEvent } from '@/services/events'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { getRaceResults, getResultSet } from '@/services/results'
import {
  getAvailableStandingsGroups,
  getLatestStandings,
  getPreviousStandingsRows,
  getStandingsHistory,
} from '@/services/standings'
import { classesService, regionsService } from '@/services/catalog'
import { getTracks } from '@/services/tracks'
import { DEFAULT_SCORING_RULE } from '@/utils/scoring'
import {
  buildChampionshipForecast,
  buildFactorInputs,
  computePace,
  normalizeToProbabilities,
  poleScore,
  raceWinnerScore,
  simulateChampionshipOutlook,
  type ChampionshipForecast,
  type DriverOutlook,
} from '@/utils/predictions'
import { seriesColor } from '@/utils/colors'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { StandingsMovementIndicator } from '@/components/StandingsMovementIndicator'
import { MultiSeriesTrendChart, type TrendSeries } from '@/components/charts/MultiSeriesTrendChart'
import { EmptyState, LoadingState } from '@/components/States'
import { formatDate, formatLapTime } from '@/utils/format'
import { ROLE_LABEL } from '@/permissions/resolver'
import type {
  ChampionshipRow,
  DriverRow,
  EventRow,
  RaceResultRow,
  SeasonRow,
  StandingsSnapshotRowRow,
} from '@/types/database'

const MAX_POINTS_PER_ROUND =
  DEFAULT_SCORING_RULE.positionPoints[0] + DEFAULT_SCORING_RULE.poleBonus + DEFAULT_SCORING_RULE.fastestLapBonus
const TREND_CHART_ROUNDS = 5

interface GroupLeader {
  label: string
  driverId: string
  displayName: string
}

const QUICK_LINKS: { to: string; label: string; description: string; adminOnly?: boolean }[] = [
  { to: '/championships', label: 'Championship', description: 'Championships, seasons, and the calendar.' },
  { to: '/race-weekend', label: 'Race Weekend', description: 'Current event, practice, qualifying, and results.' },
  { to: '/standings', label: 'Standings', description: 'Overall, class, region, and team standings.' },
  { to: '/predictions', label: 'Predictions', description: 'Forecasts for the next race and the title fight.' },
  { to: '/drivers', label: 'Drivers', description: 'Roster and driver profiles.' },
  { to: '/tracks', label: 'Tracks', description: 'Per-game track catalog.' },
]

interface DashboardData {
  championship: ChampionshipRow
  season: SeasonRow
  events: EventRow[]
  drivers: DriverRow[]
  upcoming: EventRow | null
  lastEvent: EventRow | null
  racesCompleted: number
  lastRace: { winner?: RaceResultRow; pole?: RaceResultRow; fastest?: RaceResultRow } | null
  standingsRows: StandingsSnapshotRowRow[]
  movement: Map<string, number>
  raceWinFavorite: { driverId: string; displayName: string; probability: number } | null
  poleFavorite: { driverId: string; displayName: string; probability: number } | null
  forecast: ChampionshipForecast | null
  outlook: DriverOutlook[]
  pointsSeries: { xLabels: string[]; series: TrendSeries[] }
  upcomingTrackName: string | null
  classLeaders: GroupLeader[]
  regionLeaders: GroupLeader[]
  setupWarnings: string[]
}

export default function DashboardPage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const [data, setData] = useState<DashboardData | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedLeague) return
    let cancelled = false
    setData(undefined)
    setError(null)

    async function load() {
      const leagueId = selectedLeague!.league.id
      try {
        const [active, drivers] = await Promise.all([resolveActiveSeason(leagueId), getDrivers(leagueId, false)])
        if (!active) {
          if (!cancelled) setData(null)
          return
        }

        const [events, standingsResult, previousRows, history, snapshotHistory] = await Promise.all([
          getSeasonEvents(active.season.id),
          getLatestStandings(active.season.id, 'overall'),
          getPreviousStandingsRows(active.season.id, 'overall'),
          getSeasonDriverHistory(active.season.id),
          getStandingsHistory(active.season.id, 'overall'),
        ])

        // events.status is administrative workflow state, not a reliable "this race
        // happened" signal — it can stay 'scheduled' even after results are finalized.
        // The only trustworthy signal is a race-kind driver_history entry for the event.
        const completedEventIds = new Set(
          history.filter((h) => h.result_kind === 'race').map((h) => h.event_id),
        )

        const upcoming = resolveUpcomingEvent(events)
        const lastEvent = resolveLastCompletedEvent(events, completedEventIds)

        let lastRace: DashboardData['lastRace'] = null
        if (lastEvent) {
          const resultSet = await getResultSet(lastEvent.id, 'race')
          if (resultSet) {
            const raceResults = await getRaceResults(resultSet.id)
            lastRace = {
              winner: raceResults.find((r) => r.finish_position === 1 && r.status === 'fin'),
              pole: raceResults.find((r) => r.earned_pole),
              fastest: raceResults.find((r) => r.fastest_lap),
            }
          }
        }

        const standingsRows = standingsResult?.rows ?? []
        const previousPositionByDriver = new Map(
          previousRows.filter((r) => r.driver_id).map((r) => [r.driver_id as string, r.position]),
        )
        const movement = new Map(
          standingsRows
            .filter((r) => r.driver_id)
            .map((r) => {
              const previous = previousPositionByDriver.get(r.driver_id as string)
              return [r.driver_id as string, previous != null ? previous - r.position : 0]
            }),
        )

        const driverIds = Array.from(new Set(history.map((h) => h.driver_id)))
        const factorInputs = driverIds.map((id) => {
          const driver = drivers.find((d) => d.id === id)
          return buildFactorInputs(id, driver?.display_name ?? 'Driver', history, upcoming?.track_id ?? null)
        })
        function topPick(scoreFn: (f: (typeof factorInputs)[number]) => number) {
          const scored = factorInputs.map((f) => ({ driverId: f.driverId, score: scoreFn(f) }))
          const best = normalizeToProbabilities(scored).sort((a, b) => b.probability - a.probability)[0]
          if (!best) return null
          const driver = factorInputs.find((f) => f.driverId === best.driverId)
          return { driverId: best.driverId, displayName: driver?.displayName ?? 'Driver', probability: best.probability }
        }

        const completedRaceCount = new Set(history.filter((h) => h.result_kind === 'race').map((h) => h.event_id)).size
        const standingsInput = standingsRows
          .filter((r) => r.driver_id)
          .map((r) => ({
            driverId: r.driver_id as string,
            displayName: drivers.find((d) => d.id === r.driver_id)?.display_name ?? 'Driver',
            points: r.points,
            position: r.position,
          }))
        const paceByDriver = new Map(driverIds.map((id) => [id, computePace(history, id)]))
        const forecast = buildChampionshipForecast(
          standingsInput,
          paceByDriver,
          completedRaceCount,
          events.length,
          MAX_POINTS_PER_ROUND,
        )
        const pastPointsByDriver = new Map(
          driverIds.map((id) => [
            id,
            history.filter((h) => h.result_kind === 'race' && h.driver_id === id).map((h) => h.points ?? 0),
          ]),
        )
        const outlook = simulateChampionshipOutlook(
          standingsInput,
          pastPointsByDriver,
          completedRaceCount,
          events.length,
          MAX_POINTS_PER_ROUND,
        )

        const roundByEvent = new Map(events.map((e) => [e.id, e.round]))
        const recentSnapshotHistory = snapshotHistory.slice(-TREND_CHART_ROUNDS)
        const allStandingsDriverIds = standingsRows
          .map((r) => r.driver_id)
          .filter((id): id is string => Boolean(id))
        const pointsSeries = {
          xLabels: recentSnapshotHistory.map(({ snapshot }) =>
            snapshot.event_id ? `R${roundByEvent.get(snapshot.event_id) ?? '?'}` : '—',
          ),
          series: allStandingsDriverIds.map((id, index) => ({
            id,
            label: drivers.find((d) => d.id === id)?.display_name ?? 'Driver',
            color: seriesColor(index),
            values: recentSnapshotHistory.map(({ rows }) => rows.find((r) => r.driver_id === id)?.points ?? 0),
          })),
        }

        const tracks = await getTracks(active.championship.game_id, leagueId)
        const upcomingTrackName = upcoming?.track_id ? tracks.find((t) => t.id === upcoming.track_id)?.name ?? null : null

        async function loadGroupLeaders(
          standingsType: 'class' | 'regional',
          catalog: { list(leagueId: string): Promise<{ id: string; name: string }[]> },
        ): Promise<GroupLeader[]> {
          const keys = await getAvailableStandingsGroups(active!.season.id, standingsType)
          if (keys.length === 0) return []
          const catalogRows = await catalog.list(leagueId)
          const leaders = await Promise.all(
            keys.map(async (key) => {
              const result = await getLatestStandings(active!.season.id, standingsType, key)
              const leaderRow = result?.rows[0]
              if (!leaderRow?.driver_id) return null
              const label = catalogRows.find((c) => c.id.toLowerCase() === key.toLowerCase())?.name ?? key
              const displayName = drivers.find((d) => d.id === leaderRow.driver_id)?.display_name ?? 'Driver'
              return { label, driverId: leaderRow.driver_id, displayName }
            }),
          )
          return leaders.filter((l): l is GroupLeader => Boolean(l))
        }

        const [classLeaders, regionLeaders] = await Promise.all([
          active.championship.classes_enabled ? loadGroupLeaders('class', classesService) : Promise.resolve([]),
          active.championship.regions_enabled ? loadGroupLeaders('regional', regionsService) : Promise.resolve([]),
        ])

        let setupWarnings: string[] = []
        if (permissions.canManageMembers) {
          setupWarnings = []
          if (events.length === 0) setupWarnings.push('No events scheduled yet for this season.')
          if (drivers.length === 0) setupWarnings.push('No drivers in the league roster yet.')
          if (tracks.length === 0) setupWarnings.push('No tracks in the catalog for this game yet.')
          if (active.championship.classes_enabled) {
            const classes = await classesService.list(leagueId)
            if (classes.length === 0) setupWarnings.push('Classes are enabled but none have been created yet.')
          }
          if (active.championship.regions_enabled) {
            const regions = await regionsService.list(leagueId)
            if (regions.length === 0) setupWarnings.push('Regions are enabled but none have been created yet.')
          }
        }

        if (cancelled) return
        setData({
          championship: active.championship,
          season: active.season,
          events,
          drivers,
          upcoming,
          lastEvent,
          racesCompleted: completedEventIds.size,
          lastRace,
          standingsRows,
          movement,
          raceWinFavorite: topPick(raceWinnerScore),
          poleFavorite: topPick(poleScore),
          forecast,
          outlook,
          pointsSeries,
          upcomingTrackName,
          classLeaders,
          regionLeaders,
          setupWarnings,
        })
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the dashboard.')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedLeague, permissions.canManageMembers])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <EmptyState title="Could not load dashboard" description={error} />
  if (data === undefined) return <LoadingState />

  const racesCompleted = data?.racesCompleted ?? 0
  const seasonProgress = data && data.events.length > 0 ? Math.round((racesCompleted / data.events.length) * 100) : 0
  const activeDrivers = data?.drivers.filter((d) => d.is_active).length ?? 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{selectedLeague.league.name}</h1>
        {data ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {data.championship.name} · {data.season.name} · Signed in as{' '}
            {selectedLeague.roles.map((r) => ROLE_LABEL[r]).join(' · ')}
          </p>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Signed in as {selectedLeague.roles.map((r) => ROLE_LABEL[r]).join(' · ')}
          </p>
        )}
      </div>

      {data === null ? (
        <EmptyState
          title="No active season yet"
          description="Create a championship and season to start seeing league information here."
          action={
            <Link to="/championships" className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
              Go to championships
            </Link>
          }
        />
      ) : (
        <>
          {data.setupWarnings.length > 0 && (
            <Card style={{ borderColor: 'var(--color-warning)' }}>
              <CardHeader>
                <CardTitle style={{ color: 'var(--color-warning)' }}>Setup checklist</CardTitle>
              </CardHeader>
              <ul className="list-inside list-disc space-y-1 text-sm">
                {data.setupWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="Active drivers" value={activeDrivers} />
            <StatTile label="Races scheduled" value={data.events.length} />
            <StatTile label="Races completed" value={racesCompleted} />
            <StatTile label="Season progress" value={`${seasonProgress}%`} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Link to={data.upcoming ? `/race-weekend/${data.upcoming.id}` : '/race-weekend'}>
              <Card className="h-full transition hover:shadow-md" style={{ borderColor: 'var(--color-accent)' }}>
                <CardHeader>
                  <CardTitle>Upcoming race</CardTitle>
                  {data.upcoming && <Badge tone={data.upcoming.status === 'live' ? 'success' : 'neutral'}>{data.upcoming.status}</Badge>}
                </CardHeader>
                {data.upcoming ? (
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">
                      Round {data.upcoming.round}
                      {data.upcoming.custom_title ? ` — ${data.upcoming.custom_title}` : ''}
                    </p>
                    <p style={{ color: 'var(--color-text-muted)' }}>{formatDate(data.upcoming.event_date)}</p>
                    {data.upcomingTrackName && (
                      <p style={{ color: 'var(--color-text-muted)' }}>
                        {data.upcomingTrackName}
                        {data.upcoming.track_layout ? ` · ${data.upcoming.track_layout}` : ''}
                      </p>
                    )}
                    {data.upcoming.race_distance_type && (
                      <p style={{ color: 'var(--color-text-muted)' }}>
                        {data.upcoming.race_distance_type === 'laps'
                          ? `${data.upcoming.race_value ?? '?'} laps`
                          : `${data.upcoming.race_value ?? '?'} min endurance`}
                        {data.upcoming.qualifying_minutes ? ` · ${data.upcoming.qualifying_minutes} min qualifying` : ''}
                      </p>
                    )}
                    {(data.classLeaders.length > 0 || data.regionLeaders.length > 0) && (
                      <div className="mt-2 space-y-1 border-t pt-2" style={{ borderColor: 'var(--color-border)' }}>
                        {data.classLeaders.map((l) => (
                          <div key={`class-${l.label}`} className="flex items-center justify-between text-xs">
                            <span style={{ color: 'var(--color-text-muted)' }}>{l.label} leader</span>
                            <span className="font-medium">{l.displayName}</span>
                          </div>
                        ))}
                        {data.regionLeaders.map((l) => (
                          <div key={`region-${l.label}`} className="flex items-center justify-between text-xs">
                            <span style={{ color: 'var(--color-text-muted)' }}>{l.label} leader</span>
                            <span className="font-medium">{l.displayName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No upcoming event scheduled.</p>
                )}
              </Card>
            </Link>

            <Link to={data.lastEvent ? `/results/${data.lastEvent.id}` : '/race-weekend'}>
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardTitle>Last race</CardTitle>
                </CardHeader>
                {data.lastEvent && data.lastRace ? (
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">
                      Round {data.lastEvent.round}
                      {data.lastEvent.custom_title ? ` — ${data.lastEvent.custom_title}` : ''}
                    </p>
                    <ResultLine label="Winner" result={data.lastRace.winner} drivers={data.drivers} />
                    <ResultLine label="Pole" result={data.lastRace.pole} drivers={data.drivers} />
                    <ResultLine
                      label="Fastest lap"
                      result={data.lastRace.fastest}
                      drivers={data.drivers}
                      extra={data.lastRace.fastest ? formatLapTime(data.lastRace.fastest.best_lap_ms) : undefined}
                    />
                  </div>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No completed races yet.</p>
                )}
              </Card>
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Standings snapshot</CardTitle>
              </CardHeader>
              {data.standingsRows.length === 0 ? (
                <EmptyState title="No standings yet" />
              ) : (
                <ul className="space-y-2 text-sm">
                  {data.standingsRows.slice(0, 5).map((row) => {
                    const driver = row.driver_id ? data.drivers.find((d) => d.id === row.driver_id) : undefined
                    return (
                      <li key={row.id} className="flex items-center justify-between gap-2">
                        <Link
                          to={row.driver_id ? `/drivers/${row.driver_id}` : '/standings'}
                          className="flex items-center gap-2 font-medium hover:underline"
                        >
                          <span style={{ color: 'var(--color-text-muted)' }}>{row.position}</span>
                          {driver && <DriverAvatar driver={driver} size="sm" />}
                          {driver?.display_name ?? 'Team'}
                          <StandingsMovementIndicator movement={row.driver_id ? data.movement.get(row.driver_id) ?? 0 : 0} />
                        </Link>
                        <span className="font-mono">{row.points} pts</span>
                      </li>
                    )
                  })}
                </ul>
              )}
              <Link to="/standings" className="mt-3 inline-block text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
                Full standings →
              </Link>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Forecast highlights</CardTitle>
              </CardHeader>
              <div className="space-y-2 text-sm">
                <ForecastLine label="Race winner favorite" pick={data.raceWinFavorite} />
                <ForecastLine label="Pole favorite" pick={data.poleFavorite} />
                {data.forecast && (
                  <p className="pt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {data.forecast.narrative}
                  </p>
                )}
              </div>
              <Link to="/predictions" className="mt-3 inline-block text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
                Full predictions →
              </Link>
            </Card>
          </div>

          {data.outlook.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Championship outlook</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr style={{ color: 'var(--color-text-muted)' }}>
                      <th className="pb-2 pr-4">Driver</th>
                      <th className="pb-2 pr-4">Clinch probability</th>
                      <th className="pb-2 pr-4">Elimination probability</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                    {data.outlook.map((o) => (
                      <tr key={o.driverId}>
                        <td className="py-2 pr-4 font-medium">
                          <Link to={`/drivers/${o.driverId}`} className="hover:underline">
                            {o.displayName}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">
                          <span className="font-mono">{Math.round(o.clinchProbability * 100)}%</span>
                          {o.estimatedClinchRound != null && (
                            <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                              Est. clinch round {o.estimatedClinchRound}
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-4">
                          <span className="font-mono">{Math.round(o.eliminationProbability * 100)}%</span>
                          {o.estimatedEliminationRound != null && (
                            <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                              Est. elimination round {o.estimatedEliminationRound}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Championship points progression</CardTitle>
            </CardHeader>
            <MultiSeriesTrendChart xLabels={data.pointsSeries.xLabels} series={data.pointsSeries.series} />
          </Card>

          <div>
            <h2 className="mb-3 text-lg font-semibold">Quick links</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {QUICK_LINKS.map((link) => (
                <Link key={link.to} to={link.to}>
                  <Card className="h-full transition hover:shadow-md">
                    <CardHeader>
                      <CardTitle>{link.label}</CardTitle>
                    </CardHeader>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      {link.description}
                    </p>
                  </Card>
                </Link>
              ))}
              {permissions.usesAdminShell && (
                <Link to="/admin">
                  <Card className="h-full transition hover:shadow-md" style={{ borderColor: 'var(--color-accent)' }}>
                    <CardHeader>
                      <CardTitle>Administration</CardTitle>
                    </CardHeader>
                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                      Members, invites, tracks, classes, and regions.
                    </p>
                  </Card>
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
    </Card>
  )
}

function ResultLine({
  label,
  result,
  drivers,
  extra,
}: {
  label: string
  result: RaceResultRow | undefined
  drivers: DriverRow[]
  extra?: string
}) {
  const driver = result ? drivers.find((d) => d.id === result.driver_id) : undefined
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      {driver ? (
        <span className="flex items-center gap-1.5 font-medium">
          <DriverAvatar driver={driver} size="sm" />
          {driver.display_name}
          {extra && <span className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>{extra}</span>}
        </span>
      ) : (
        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
      )}
    </div>
  )
}

function ForecastLine({
  label,
  pick,
}: {
  label: string
  pick: { driverId: string; displayName: string; probability: number } | null
}) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      {pick ? (
        <Link to={`/drivers/${pick.driverId}`} className="font-medium hover:underline">
          {pick.displayName}{' '}
          <span className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {Math.round(pick.probability * 100)}%
          </span>
        </Link>
      ) : (
        <span style={{ color: 'var(--color-text-muted)' }}>Not enough data yet</span>
      )}
    </div>
  )
}
