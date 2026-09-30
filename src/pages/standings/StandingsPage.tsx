import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useAuth } from '@/hooks/useAuth'
import { useEntitlement } from '@/hooks/useEntitlement'
import { resolveActiveSeason } from '@/utils/activeSeason'
import {
  buildStandingsTabs,
  loadSeasonStandingsContext,
  type SeasonStandingsContext,
  type StandingsTab,
} from '@/services/standingsData'
import { getLiveStandingAwards, syncSeriesAwards } from '@/services/results'
import { loadRivalContext, myDriverIn, showsRivalIndicator, NO_RIVAL_CONTEXT, type SeasonRivalContext } from '@/services/rivals'
import {
  OVERALL_SERIES,
  awardClaim,
  claimsNeedingSync,
  classSeries,
  markerAccessibilityPhrase,
  outcomeStatusLine,
  outcomeTitle,
  outcomeWinner,
  regionSeries,
  seriesOutcome,
  seriesRows,
  standingNameLabel,
  standingPointsLabel,
  standingRowMarker,
  standingsMovement,
  teamStandings,
  type SeriesKey,
  type SeriesOutcome,
  type StandingRow,
} from '@/utils/standingsEngine'
import { isFeatureProLocked } from '@/config/featureRegistry'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { StandingsMovementIndicator } from '@/components/StandingsMovementIndicator'
import { ProLockedState } from '@/components/ProLockedState'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDateTime } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { ChampionshipRow, SeasonRow } from '@/types/database'

type Scope = 'overall' | 'class' | 'region' | 'team'

const SCOPE_LABEL: Record<Scope, string> = {
  overall: 'Drivers',
  class: 'Class',
  region: 'Region',
  team: 'Teams',
}

function keyFor(tab: StandingsTab): SeriesKey | null {
  switch (tab.kind) {
    case 'overall':
      return OVERALL_SERIES
    case 'class':
      return tab.scopeId ? classSeries(tab.scopeId) : null
    case 'region':
      return tab.scopeId ? regionSeries(tab.scopeId) : null
    default:
      return null
  }
}

/**
 * Standings (iOS `VRCStandingsView`). Like iOS, rows are computed on load from the season's persisted Official
 * `scoring_outputs` — Overall, each Class and each Region all run through the same series evaluator, so Out / Clinched /
 * Champion / Tied mean the same thing on every tab — rather than read back from possibly-stale snapshots. Owners/Admins also
 * reconcile the series-award ledger (`vrc_sync_series_awards`) from a complete, reliable read. Class and Region standings
 * are Pro / League Plus features; Overall and Team stay free.
 */
export default function StandingsPage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const { state } = useAuth()
  const { hasAccess } = useEntitlement()
  const userId = state.kind === 'authenticated' ? state.user.id : null

  const [active, setActive] = useState<{ championship: ChampionshipRow; season: SeasonRow } | null | undefined>(undefined)
  const [ctx, setCtx] = useState<SeasonStandingsContext | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [scope, setScope] = useState<Scope>('overall')
  const [groupId, setGroupId] = useState<string | null>(null)
  const [rival, setRival] = useState<SeasonRivalContext>(NO_RIVAL_CONTEXT)
  const syncedFor = useRef<string | null>(null)

  const load = useCallback(async () => {
    if (!selectedLeague) return
    setError(null)
    try {
      const resolved = await resolveActiveSeason(selectedLeague.league.id)
      setActive(resolved)
      if (!resolved) {
        setCtx(null)
        return
      }
      const loaded = await loadSeasonStandingsContext(resolved.season, resolved.championship)
      setCtx(loaded)
      const mine = myDriverIn(loaded.drivers, userId)
      setRival(await loadRivalContext(resolved.season.id, mine?.id ?? null))
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load standings.'))
    }
  }, [selectedLeague, userId])

  useEffect(() => {
    void load()
  }, [load])

  const tabs = useMemo(() => (ctx ? buildStandingsTabs(ctx) : []), [ctx])

  // The Teams scope is gated purely on season.teams_enabled — never on whether a team or scored event already exists (a
  // newly-enabled season must show it immediately); Class/Region follow the championship's feature flags.
  const scopes: Scope[] = useMemo(() => {
    if (!ctx) return ['overall']
    const list: Scope[] = ['overall']
    if (ctx.championship.classes_enabled) list.push('class')
    if (ctx.championship.regions_enabled) list.push('region')
    if (ctx.season.teams_enabled) list.push('team')
    return list
  }, [ctx])

  useEffect(() => {
    if (ctx && !scopes.includes(scope)) setScope('overall')
  }, [ctx, scopes, scope])

  const scopedTabs = useMemo(() => tabs.filter((t) => t.kind === scope), [tabs, scope])
  useEffect(() => {
    if (scopedTabs.length > 0 && !scopedTabs.some((t) => t.id === groupId)) setGroupId(scopedTabs[0].id)
    if (scopedTabs.length === 0) setGroupId(null)
  }, [scopedTabs, groupId])

  const selectedTab = scopedTabs.find((t) => t.id === groupId) ?? scopedTabs[0] ?? null
  const gateFeature = scope === 'class' ? 'classStandings' : scope === 'region' ? 'regionalStandings' : null
  const locked = gateFeature ? isFeatureProLocked(gateFeature, hasAccess) : false

  function seriesName(tab: StandingsTab): string {
    if (tab.kind === 'overall') return ctx?.championship.name ?? ctx?.season.name ?? 'Championship'
    return tab.title
  }

  const computed = useMemo(() => {
    if (!ctx || !selectedTab || locked) return null
    if (selectedTab.kind === 'team') {
      const rows = teamStandings(ctx.eventScores.map((e) => e.scores), ctx.teamInfo)
      return { rows, previous: [] as StandingRow[], outcome: null as SeriesOutcome | null, name: selectedTab.title }
    }
    const key = keyFor(selectedTab)
    if (!key) return null
    const rows = seriesRows({ key, events: ctx.eventScores, driverInfo: ctx.driverInfo, config: ctx.config, planner: ctx.planner })
    const latestRound = Math.max(0, ...ctx.eventScores.map((e) => e.round))
    const previous = seriesRows({
      key,
      events: ctx.eventScores.filter((e) => e.round < latestRound),
      driverInfo: ctx.driverInfo,
      config: ctx.config,
      planner: ctx.planner,
    })
    const name = seriesName(selectedTab)
    return {
      rows,
      previous,
      outcome: seriesOutcome({ key, name, rows, events: ctx.eventScores, driverInfo: ctx.driverInfo, config: ctx.config, planner: ctx.planner }),
      name,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, selectedTab, locked])

  const movement = useMemo(() => (computed ? standingsMovement(computed.rows, computed.previous) : new Map<string, number>()), [computed])

  // Reconcile the award ledger — Owner/Admin only, and only after a clean, reliable read (a viewer never awards, and
  // stale/failed data never creates or revokes anything). Off the render path: it must never delay or fail the screen.
  useEffect(() => {
    if (!ctx || !permissions.canManageSetup || !ctx.hasOfficialResults || !ctx.planner.isReliable) return
    const signature = `${ctx.season.id}:${ctx.outputs.length}:${ctx.lastUpdated}`
    if (syncedFor.current === signature) return
    syncedFor.current = signature
    void (async () => {
      try {
        const claims = buildStandingsTabs(ctx)
          .map((tab) => {
            const key = keyFor(tab)
            if (!key) return null
            const rows = seriesRows({ key, events: ctx.eventScores, driverInfo: ctx.driverInfo, config: ctx.config, planner: ctx.planner })
            const outcome = seriesOutcome({
              key,
              name: seriesName(tab),
              rows,
              events: ctx.eventScores,
              driverInfo: ctx.driverInfo,
              config: ctx.config,
              planner: ctx.planner,
            })
            return awardClaim(key, outcome)
          })
          .filter((c): c is NonNullable<typeof c> => c !== null)
        if (claims.length === 0) return
        const live = await getLiveStandingAwards(ctx.season.id)
        const pending = claimsNeedingSync(claims, live)
        if (pending.length > 0) await syncSeriesAwards(ctx.season.id, pending)
      } catch {
        // Best-effort; the next Owner/Admin standings load reconciles anything this misses.
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, permissions.canManageSetup])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (active === undefined || (active && !ctx)) return <LoadingState label="Loading standings…" />
  if (active === null || !ctx) {
    return <EmptyState title="No active season" description="Standings will appear once a season has results." />
  }

  const isTeam = scope === 'team'
  const winner = computed?.outcome ? outcomeWinner(computed.outcome) : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Standings</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {ctx.championship.name} · {ctx.season.name}
          {ctx.lastUpdated ? ` · Updated ${formatDateTime(ctx.lastUpdated)}` : ''}
        </p>
      </div>

      <div role="tablist" aria-label="Standings scope" className="flex flex-wrap gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--color-border)' }}>
        {scopes.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            onClick={() => setScope(s)}
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={{
              backgroundColor: scope === s ? 'var(--color-accent)' : 'transparent',
              color: scope === s ? 'var(--color-accent-contrast)' : 'var(--color-text)',
            }}
          >
            {SCOPE_LABEL[s]}
          </button>
        ))}
      </div>

      {(scope === 'class' || scope === 'region') && scopedTabs.length > 0 && !locked && (
        <label className="block text-sm">
          <span className="sr-only">{scope === 'class' ? 'Class' : 'Region'}</span>
          <select
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          >
            {scopedTabs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {locked ? (
        <ProLockedState
          title="Class & Regional standings require VRC Ops Pro"
          description="Overall and team standings stay free — class and regional breakdowns are part of VRC Ops Pro or League Plus."
        />
      ) : (
        <>
          {computed?.outcome && (
            <Card style={{ borderColor: computed.outcome.kind === 'tied' ? 'var(--color-warning)' : 'var(--color-warning)' }}>
              <div role="status" aria-label={`${outcomeTitle(computed.outcome)}. ${outcomeStatusLine(computed.outcome)}`}>
                <p className="text-base font-semibold">
                  <span aria-hidden>{computed.outcome.kind === 'tied' ? '⚖️ ' : '🏆 '}</span>
                  {outcomeTitle(computed.outcome)}
                </p>
                {winner ? (
                  <>
                    <p className="mt-1 text-lg font-bold">{standingNameLabel(winner)}</p>
                    <p className="tabular-nums text-sm">{standingPointsLabel(winner.points)}</p>
                  </>
                ) : (
                  <>
                    {computed.outcome.leaders.map((l) => (
                      <p key={l.driverId} className="mt-1 text-base font-semibold">
                        {standingNameLabel(l)}
                      </p>
                    ))}
                    {computed.outcome.leaders[0] && (
                      <p className="tabular-nums text-sm">{standingPointsLabel(computed.outcome.leaders[0].points)} each</p>
                    )}
                  </>
                )}
                <p className="mt-1 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {outcomeStatusLine(computed.outcome)}
                </p>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{isTeam ? 'Team standings' : (computed?.name ?? 'Standings')}</CardTitle>
            </CardHeader>
            {!computed || computed.rows.length === 0 ? (
              isTeam && ctx.teams.filter((t) => !t.archived_at).length === 0 ? (
                <EmptyState
                  title="No teams configured for this season."
                  description={permissions.canManageSetup ? undefined : 'Ask a league owner or admin to add teams.'}
                  action={
                    permissions.canManageSetup ? (
                      <Link to={`/seasons/${ctx.season.id}/teams`} className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
                        Manage teams →
                      </Link>
                    ) : undefined
                  }
                />
              ) : isTeam ? (
                <EmptyState title="No team standings yet." description="Standings update automatically once results are saved." />
              ) : (
                <EmptyState title="No standings yet" description="Standings update automatically once results are saved." />
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">{computed.name} standings</caption>
                  <thead>
                    <tr style={{ color: 'var(--color-text-muted)' }}>
                      <th scope="col" className="pb-2 pr-4">#</th>
                      <th scope="col" className="pb-2 pr-4">{isTeam ? 'Team' : 'Driver'}</th>
                      <th scope="col" className="pb-2 pr-4">Points</th>
                      <th scope="col" className="pb-2 pr-4">Wins</th>
                      <th scope="col" className="pb-2 pr-4">Podiums</th>
                      <th scope="col" className="pb-2 pr-4">Poles</th>
                      <th scope="col" className="pb-2 pr-4">FL</th>
                      <th scope="col" className="pb-2 pr-4">Starts</th>
                      <th scope="col" className="pb-2 pr-4"><span className="sr-only">Status</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                    {computed.rows.map((row) => {
                      const id = row.driverId ?? row.teamId ?? row.name
                      const marker = isTeam ? 'none' : standingRowMarker(row, computed.outcome)
                      const phrase = markerAccessibilityPhrase(marker, computed.outcome, computed.name)
                      const driver = row.driverId ? ctx.drivers.find((d) => d.id === row.driverId) : undefined
                      const team = row.teamId ? ctx.teams.find((t) => t.id === row.teamId) : undefined
                      const isRival = showsRivalIndicator(rival, row.driverId)
                      return (
                        <tr key={id}>
                          <td className="py-2 pr-4">
                            <div className="flex items-center gap-1.5">
                              {row.position}
                              <StandingsMovementIndicator movement={movement.get(id) ?? 0} />
                            </div>
                          </td>
                          <td className="py-2 pr-4 font-medium">
                            {row.driverId ? (
                              <Link to={`/drivers/${row.driverId}`} className="flex items-center gap-2 hover:underline">
                                {driver && <DriverAvatar driver={driver} size="sm" />}
                                <span>{row.name}</span>
                                {isRival && (
                                  <span title="Your rival" aria-label="Your rival" className="rounded-full border px-1 text-xs" style={{ borderColor: 'var(--color-accent)', color: 'var(--color-accent)' }}>
                                    R
                                  </span>
                                )}
                                {row.droppedRounds > 0 && (
                                  <span className="text-xs font-normal" style={{ color: 'var(--color-text-muted)' }} title={`${row.grossPoints} gross points, ${row.droppedRounds} dropped round(s)`}>
                                    ({row.grossPoints} gross)
                                  </span>
                                )}
                              </Link>
                            ) : (
                              <span className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team?.color ?? 'var(--color-border)' }} />
                                {row.name}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-4 tabular-nums">{row.points}</td>
                          <td className="py-2 pr-4 tabular-nums">{row.wins}</td>
                          <td className="py-2 pr-4 tabular-nums">{row.podiums}</td>
                          <td className="py-2 pr-4 tabular-nums">{row.poles}</td>
                          <td className="py-2 pr-4 tabular-nums">{row.fastestLaps}</td>
                          <td className="py-2 pr-4 tabular-nums">{row.starts}</td>
                          <td className="py-2 pr-4">
                            {marker === 'trophy' && (
                              <span role="img" aria-label={phrase ?? 'Champion'} title={phrase ?? undefined}>
                                🏆
                              </span>
                            )}
                            {marker === 'out' && <Badge tone="danger"><span className="sr-only">{phrase}</span><span aria-hidden>Out</span></Badge>}
                            {marker === 'tied' && <Badge tone="warning"><span className="sr-only">{phrase}</span><span aria-hidden>Tied</span></Badge>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
