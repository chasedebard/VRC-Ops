import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useEntitlement } from '@/hooks/useEntitlement'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { isFeatureProLocked, isFeatureUnlocked } from '@/config/featureRegistry'
import { loadDashboard, type DashboardData } from '@/services/dashboardData'
import { postAnnouncement } from '@/services/announcements'
import { hasAcceptedCurrentDoc } from '@/utils/legalState'
import {
  cardRows,
  championshipBattle,
  composeCards,
  deriveUserContext,
  formTrendLabel,
  gapLabel,
  performanceGap,
  stableSpotlightDriver,
  timeOfDayGreeting,
  type DashboardCardKind,
} from '@/utils/dashboardModel'
import { favoriteOf, findMarket, percentText } from '@/utils/predictionPresentation'
import { backendErrorMessage } from '@/utils/backendErrors'
import { ROLE_LABEL } from '@/permissions/resolver'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import {
  AnnouncementsCard,
  DriverSpotlightCard,
  HeroCard,
  LastRaceCard,
  MyRatingCard,
  PointsTrendCard,
  QuickActionsCard,
  QuickActionsGrid,
  RaceLeadersCard,
  RecentActivityCard,
  SeasonProgressCard,
  SetupWarningBanner,
  StewardPenaltiesCard,
  StewardReviewCard,
} from '@/pages/dashboard/DashboardCards'

const muted = { color: 'var(--color-text-muted)' }

/**
 * Home (iOS `VRCAdminHomeView`): the championship header and any setup warnings, a greeting for linked drivers, the universal next-race hero,
 * the premium driver section (performance, championship battle, forecast, recent form, quick actions), then the role-aware cards in composer
 * order — each card kind shows at most once. Predictions are read from server-calculated runs and only when the viewer has Pro / League Plus AND
 * the current AI consent; nothing is computed in the browser. "Driver comparison" is hidden in the registry and therefore not offered here.
 */
export default function DashboardPage() {
  const { state } = useAuth()
  const { selectedLeague, permissions, legal } = useLeagueSession()
  const { hasAccess, status: entitlementStatus } = useEntitlement()
  const [data, setData] = useState<DashboardData | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const userId = state.kind === 'authenticated' ? state.user.id : null
  const leagueId = selectedLeague?.league.id ?? null
  const roles = selectedLeague?.roles
  const predictionsUnlocked = isFeatureUnlocked('predictions', hasAccess) && hasAcceptedCurrentDoc(legal, 'ai')

  const load = useCallback(async () => {
    if (!leagueId || !roles || entitlementStatus === 'loading') return
    setError(null)
    try {
      setData(await loadDashboard({ leagueId, roles: new Set(roles), userId, includePredictions: predictionsUnlocked }))
    } catch (err) {
      setError(backendErrorMessage(err, 'The race dashboard could not be loaded.'))
    }
  }, [leagueId, roles, userId, predictionsUnlocked, entitlementStatus])

  useEffect(() => {
    setData(undefined)
    void load()
  }, [load])

  const classLocked = isFeatureProLocked('classStandings', hasAccess)
  const regionLocked = isFeatureProLocked('regionalStandings', hasAccess)

  const userContext = useMemo(() => (roles ? deriveUserContext(new Set(roles), data?.myDriver?.driver.id ?? null) : null), [roles, data?.myDriver])
  const rows = useMemo(() => (userContext && data ? cardRows(composeCards(userContext, data.signals)) : []), [userContext, data])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (data === undefined) return <LoadingState label="Loading your dashboard…" />
  if (data === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">{selectedLeague.league.name}</h1>
        <EmptyState
          title="No active season yet"
          description={permissions.canManageSetup ? 'Create a championship and activate a season to see your race dashboard.' : 'Your league has no active season yet. Check back once an Owner or Admin sets one up.'}
          action={
            permissions.canManageSetup ? (
              <Link to="/championships" className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
                Go to championships
              </Link>
            ) : undefined
          }
        />
      </div>
    )
  }

  const dashboard = data
  const isDriver = userContext?.roles.has('driver') ?? false
  const canOpenRaceWeekend = permissions.roles.has('driver') || permissions.canOperateRaceControl
  const spotlightDriver = stableSpotlightDriver({
    roster: dashboard.roster,
    drivers: dashboard.drivers,
    seasonId: dashboard.season.id,
    upcomingEventId: dashboard.upcoming?.id ?? null,
    preferredDriverIds: new Set(
      [...(dashboard.predictions?.race?.markets ?? []), ...(dashboard.predictions?.championship?.markets ?? [])].flatMap((m) => m.entries.map((e) => e.driver_id)),
    ),
  })

  async function onPost(title: string, body: string): Promise<string | null> {
    if (!leagueId || !selectedLeague) return 'Select a league first.'
    try {
      await postAnnouncement(leagueId, selectedLeague.membershipId, title, body)
      await load()
      return null
    } catch (err) {
      return backendErrorMessage(err, 'Could not post the announcement.')
    }
  }

  const quickActions = [
    ...(canOpenRaceWeekend ? [{ to: '/race-weekend', label: 'Race Weekend' }] : []),
    { to: '/standings', label: 'Standings' },
    ...(dashboard.championship.predictions_enabled ? [{ to: '/predictions', label: 'Predictions', locked: isFeatureProLocked('predictions', hasAccess) }] : []),
    ...(canOpenRaceWeekend ? [{ to: '/pit-wall', label: 'Pit Wall', locked: isFeatureProLocked('pitWall', hasAccess) }] : []),
    ...(isDriver ? [{ to: '/drivers/me', label: 'My Driver' }] : []),
  ]

  function renderCard(kind: DashboardCardKind) {
    switch (kind) {
      case 'raceLeaders':
        return <RaceLeadersCard data={dashboard} classLocked={classLocked} regionLocked={regionLocked} />
      case 'myRating':
        return <MyRatingCard data={dashboard} />
      case 'seasonProgress':
        return <SeasonProgressCard data={dashboard} />
      case 'stewardReviewQueue':
        return <StewardReviewCard data={dashboard} />
      case 'stewardPenalties':
        return <StewardPenaltiesCard data={dashboard} />
      case 'recentActivity':
        return <RecentActivityCard data={dashboard} />
      case 'quickActions':
        return <QuickActionsCard actions={quickActions} />
      case 'lastRace':
        return <LastRaceCard data={dashboard} />
      case 'driverSpotlight':
        return <DriverSpotlightCard driver={spotlightDriver} data={dashboard} />
      case 'announcements':
        return <AnnouncementsCard data={dashboard} canPost={permissions.canManageContent} onPost={onPost} />
      case 'pointsTrend':
        return <PointsTrendCard data={dashboard} classLocked={classLocked} regionLocked={regionLocked} />
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{dashboard.championship.name}</h1>
        <p className="text-sm" style={muted}>
          {dashboard.season.name} · {selectedLeague.league.name} · {selectedLeague.roles.map((r) => ROLE_LABEL[r]).join(' · ')}
        </p>
      </div>

      <SetupWarningBanner items={dashboard.warnings} />

      {dashboard.myDriver && (
        <div className="flex items-center gap-3">
          <DriverAvatar driver={dashboard.myDriver.driver} size="md" />
          <div>
            <p className="text-sm" style={muted}>{timeOfDayGreeting()}</p>
            <p className="text-lg font-bold">
              {dashboard.myDriver.driver.display_name}
              {dashboard.myDriver.driver.driver_number ? <span className="ml-2 text-sm font-normal" style={muted}>#{dashboard.myDriver.driver.driver_number}</span> : null}
            </p>
          </div>
        </div>
      )}

      <HeroCard data={dashboard} canOpenRaceWeekend={canOpenRaceWeekend} />

      {isDriver && dashboard.myDriver && <DriverSection data={dashboard} quickActions={quickActions} />}

      <div className="space-y-5">
        {rows.map((row) => (
          <div key={row.join('-')} className={row.length > 1 ? 'grid gap-4 md:grid-cols-2' : undefined}>
            {row.map((kind) => (
              <div key={kind}>{renderCard(kind)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function DriverSection({ data, quickActions }: { data: DashboardData; quickActions: { to: string; label: string; locked?: boolean }[] }) {
  const mine = data.myDriver
  if (!mine) return null
  const battle = championshipBattle(data.standings, mine.driver.id)
  const gap = performanceGap(battle)
  const standing = battle.standing
  const form = formTrendLabel(mine.recent.map((r) => (r.status === 'fin' ? r.position : null)))
  const raceFavorites = data.predictions?.race ? findMarket(data.predictions.race, 'race_win') : null
  const myWinEntry = raceFavorites?.entries.find((e) => e.driver_id === mine.driver.id) ?? null
  const titleForecast = data.predictions?.championship?.forecast ?? null

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance</CardTitle>
            {standing && <Badge tone="accent">P{standing.position}</Badge>}
          </CardHeader>
          {standing ? (
            <div className="grid grid-cols-4 gap-3 text-center">
              <div><p className="text-xl font-bold">{standing.points}</p><p className="text-xs" style={muted}>Points</p></div>
              <div><p className="text-xl font-bold">{standing.wins}</p><p className="text-xs" style={muted}>Wins</p></div>
              <div><p className="text-xl font-bold">{standing.podiums}</p><p className="text-xs" style={muted}>Podiums</p></div>
              <div>
                <p className="text-xl font-bold" style={{ color: gap.tone === 'cushion' ? '#c8a23a' : gap.tone === 'atBack' ? 'var(--color-danger)' : 'var(--color-text)' }}>{gap.value ?? '—'}</p>
                <p className="text-xs" style={muted}>{gapLabel(gap.tone)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm" style={muted}>No official results for you yet this season.</p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Championship battle</CardTitle>
            <Link to="/standings" className="text-xs underline" style={{ color: 'var(--color-accent)' }}>Standings</Link>
          </CardHeader>
          {standing ? (
            <ul className="space-y-1 text-sm">
              {data.standings[0] && data.standings[0].driverId !== mine.driver.id && <li>Leader: <strong>{data.standings[0].name}</strong> ({battle.gapToLeader} pts ahead)</li>}
              {battle.driverBehind && <li>Behind you: <strong>{battle.driverBehind.name}</strong> ({battle.gapBehind} pts back)</li>}
              {mine.rivalName && <li>Rival: <strong>{mine.rivalName}</strong>{mine.rivalRecord ? <span style={muted}> — {mine.rivalRecord}</span> : null}</li>}
              {standing.averageFinish !== null && <li style={muted}>Average finish {standing.averageFinish.toFixed(1)}</li>}
            </ul>
          ) : (
            <p className="text-sm" style={muted}>The battle appears once you have a standing.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent form</CardTitle>
            <Badge tone="neutral">{form}</Badge>
          </CardHeader>
          {mine.recent.length === 0 ? (
            <p className="text-sm" style={muted}>No races yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {mine.recent.map((r) => (
                <span key={r.eventId} className="rounded-lg border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: 'var(--color-border)' }} title={`Round ${r.round}`}>
                  {r.label}
                </span>
              ))}
            </div>
          )}
        </Card>

        {data.predictions && (data.predictions.race || data.predictions.championship) && (
          <Card>
            <CardHeader>
              <CardTitle>Forecast</CardTitle>
              <Link to="/predictions" className="text-xs underline" style={{ color: 'var(--color-accent)' }}>Predictions</Link>
            </CardHeader>
            <ul className="space-y-1 text-sm">
              {raceFavorites && favoriteOf(raceFavorites) && (
                <li>
                  Race favourite: <strong>{favoriteOf(raceFavorites)?.driver_name}</strong> ({percentText(favoriteOf(raceFavorites)?.probability ?? 0)})
                </li>
              )}
              {myWinEntry && <li>Your win chance: <strong>{percentText(myWinEntry.probability)}</strong></li>}
              {titleForecast && <li style={muted}>{titleForecast.narrative}</li>}
            </ul>
            <p className="mt-2 text-xs" style={muted}>Calculated by the VRC Ops forecast service.</p>
          </Card>
        )}
      </div>

      <QuickActionsGrid actions={quickActions} />
    </div>
  )
}
