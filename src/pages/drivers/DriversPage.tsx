import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { assignDriverToSeason, createDriver, getDrivers, getSeasonRoster, removeDriverFromSeason, setDriverActive } from '@/services/drivers'
import { getSeasonScoringOutputs } from '@/services/standings'
import { getSeasonEvents } from '@/services/events'
import { getSeasonTeams } from '@/services/seasonTeams'
import { listLeagueClasses, listLeagueRegions } from '@/services/setup'
import { getLeagueDriverMmrDisplay } from '@/services/mmr'
import { getSeasonRivals, myDriverIn, rivalContextFor, showsRivalIndicator, type SeasonRivalContext, NO_RIVAL_CONTEXT } from '@/services/rivals'
import { standingsConfigForSeason } from '@/services/standingsData'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { eventScoreFromOutput, rankedDriverRows, type DriverInfo, type EventScore } from '@/utils/standingsEngine'
import { backendErrorMessage } from '@/utils/backendErrors'
import { driverNumberMessages } from '@/utils/driverValidation'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { MmrBadge } from '@/components/MmrBadge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { ChampionshipRow, DriverRow, SeasonDriverRow, SeasonRow } from '@/types/database'
import type { LeagueMmrDisplayRow } from '@/types/mmr'

interface DirectoryData {
  drivers: DriverRow[]
  context: { championship: ChampionshipRow; season: SeasonRow } | null
  roster: Map<string, SeasonDriverRow>
  classNames: Map<string, string>
  regionNames: Map<string, string>
  teamNames: Map<string, string>
  positions: Map<string, number>
  mmr: Map<string, LeagueMmrDisplayRow>
  rival: SeasonRivalContext
}

/**
 * Drivers ▸ Directory (iOS `VRCSeasonDriversView`): the active season's participants first — with their season number, class / team /
 * region (only where the feature is enabled), championship position, redacted Global Rating badge and the rival marker — then the rest of
 * the league's driver directory. Owner/Admin can add/remove season participants and create drivers; the server re-checks every write.
 */
export default function DriversPage() {
  const { state } = useAuth()
  const { selectedLeague, permissions } = useLeagueSession()
  const leagueId = selectedLeague?.league.id ?? null
  const userId = state.kind === 'authenticated' ? state.user.id : null
  const [data, setData] = useState<DirectoryData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [number, setNumber] = useState('')
  const [addToSeason, setAddToSeason] = useState(true)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!leagueId) return
    setError(null)
    try {
      const [drivers, context] = await Promise.all([getDrivers(leagueId, true), resolveActiveSeason(leagueId)])
      const base: DirectoryData = {
        drivers,
        context,
        roster: new Map(),
        classNames: new Map(),
        regionNames: new Map(),
        teamNames: new Map(),
        positions: new Map(),
        mmr: new Map(),
        rival: NO_RIVAL_CONTEXT,
      }
      setData(base)
      const mmrPromise = getLeagueDriverMmrDisplay(leagueId, { seasonId: context?.season.id ?? null }).catch(() => null)
      if (!context) {
        const mmr = await mmrPromise
        setData({ ...base, mmr: new Map(mmr?.ok && mmr.state === 'public' ? (mmr.drivers ?? []).map((d) => [d.driver_id, d]) : []) })
        return
      }
      const season = context.season
      const [roster, classes, regions, teams, outputs, events, mmr, rivals] = await Promise.all([
        getSeasonRoster(season.id).catch(() => []),
        listLeagueClasses(leagueId).catch(() => []),
        listLeagueRegions(leagueId).catch(() => []),
        season.teams_enabled ? getSeasonTeams(season.id).catch(() => []) : Promise.resolve([]),
        getSeasonScoringOutputs(season.id).catch(() => []),
        getSeasonEvents(season.id).catch(() => []),
        mmrPromise,
        getSeasonRivals(season.id).catch(() => null),
      ])
      const rosterByDriver = new Map(roster.map((r) => [r.driver_id, r as SeasonDriverRow]))
      const eventById = new Map(events.map((e) => [e.id, e]))
      const byEvent = new Map<string, EventScore[]>()
      for (const output of outputs) {
        byEvent.set(output.event_id, [...(byEvent.get(output.event_id) ?? []), eventScoreFromOutput(output, eventById.get(output.event_id), rosterByDriver.get(output.driver_id))])
      }
      const info = new Map<string, DriverInfo>(drivers.map((d) => [d.id, { name: d.display_name, number: rosterByDriver.get(d.id)?.number_override ?? d.driver_number ?? '' }]))
      const { rows } = rankedDriverRows([...byEvent.values()], info, standingsConfigForSeason(season))
      setData({
        drivers,
        context,
        roster: rosterByDriver,
        classNames: new Map(classes.map((c) => [c.id, c.name])),
        regionNames: new Map(regions.map((r) => [r.id, r.name])),
        teamNames: new Map(teams.map((t) => [t.id, t.name])),
        positions: new Map(rows.filter((r) => r.driverId).map((r) => [r.driverId as string, r.position])),
        mmr: new Map(mmr?.ok && mmr.state === 'public' ? (mmr.drivers ?? []).map((d) => [d.driver_id, d]) : []),
        rival: rivalContextFor(rivals, myDriverIn(drivers, userId)?.id ?? null),
      })
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load drivers.'))
    }
  }, [leagueId, userId])

  useEffect(() => {
    void load()
  }, [load])

  const matches = useCallback(
    (d: DriverRow) => {
      const q = search.trim().toLowerCase()
      return !q || d.display_name.toLowerCase().includes(q) || (d.driver_number ?? '').toLowerCase().includes(q)
    },
    [search],
  )

  const { participants, others } = useMemo(() => {
    if (!data) return { participants: [] as DriverRow[], others: [] as DriverRow[] }
    const inSeason = (d: DriverRow) => data.roster.has(d.id) && data.roster.get(d.id)?.is_active !== false
    return {
      participants: data.drivers.filter((d) => inSeason(d) && matches(d)),
      others: data.drivers.filter((d) => !inSeason(d) && matches(d) && (showInactive || d.is_active)),
    }
  }, [data, matches, showInactive])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    try {
      await action()
      await load()
    } catch (err) {
      setActionError(backendErrorMessage(err, 'That change could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!leagueId || !data) return
    await run(async () => {
      const created = await createDriver({ league_id: leagueId, display_name: name.trim(), driver_number: number.trim() || null })
      if (addToSeason && data.context) {
        await assignDriverToSeason({ season_id: data.context.season.id, driver_id: created.id, league_id: leagueId })
      }
      setName('')
      setNumber('')
      setShowCreate(false)
    })
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!data) return <LoadingState label="Loading drivers…" />

  const { context } = data
  const numberProblems = driverNumberMessages(number, null, data.drivers)
  const canManage = permissions.canManageSetup

  function subline(driver: DriverRow): string {
    const assignment = data?.roster.get(driver.id)
    if (!assignment) return 'Not in current season'
    const parts: string[] = []
    if (context?.championship.classes_enabled && assignment.class_id) parts.push(data?.classNames.get(assignment.class_id) ?? 'Class')
    if (context?.season.teams_enabled && assignment.team_id) parts.push(data?.teamNames.get(assignment.team_id) ?? 'Team')
    if (context?.championship.regions_enabled && assignment.region_id) parts.push(data?.regionNames.get(assignment.region_id) ?? 'Region')
    const position = data?.positions.get(driver.id)
    if (position) parts.push(`P${position}`)
    return parts.join(' · ') || 'Season participant'
  }

  const numberFor = (d: DriverRow) => data.roster.get(d.id)?.number_override || d.driver_number

  function Row({ driver, inSeason }: { driver: DriverRow; inSeason: boolean }) {
    const mmr = data?.mmr.get(driver.id)
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
        <Link to={`/drivers/${driver.id}`} className="flex min-w-0 items-center gap-3 hover:underline">
          <DriverAvatar driver={driver} size="sm" />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              {driver.display_name}
              {numberFor(driver) ? <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>#{numberFor(driver)}</span> : null}
              {showsRivalIndicator(data?.rival ?? NO_RIVAL_CONTEXT, driver.id) && (
                <span title="Your current rival this season" aria-label="Your current rival this season">
                  Ⓡ
                </span>
              )}
              {mmr && <MmrBadge tier={mmr.tier} globalRank={mmr.global_rank} titleBadge={mmr.title_badge} />}
            </span>
            <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {inSeason ? subline(driver) : driver.is_active ? 'Not in current season' : 'Inactive'}
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-2">
          {!driver.is_active && <Badge tone="warning">Inactive</Badge>}
          {driver.driver_number_request_status === 'pending' && canManage && <Badge tone="warning">Number request</Badge>}
          {canManage && context && (
            inSeason ? (
              <Button variant="secondary" disabled={busy} onClick={() => run(() => removeDriverFromSeason(data?.roster.get(driver.id)?.id as string))} aria-label={`Remove ${driver.display_name} from ${context.season.name}`}>
                Remove from season
              </Button>
            ) : (
              driver.is_active && (
                <Button variant="secondary" disabled={busy} onClick={() => run(async () => void (await assignDriverToSeason({ season_id: context.season.id, driver_id: driver.id, league_id: driver.league_id })))} aria-label={`Add ${driver.display_name} to ${context.season.name}`}>
                  Add to season
                </Button>
              )
            )
          )}
          {canManage && !inSeason && (
            <Button variant="ghost" disabled={busy} onClick={() => run(() => setDriverActive(driver.id, !driver.is_active))}>
              {driver.is_active ? 'Set inactive' : 'Set active'}
            </Button>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Drivers</h1>
          {context && (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {context.season.name} · {data.roster.size} season participant{data.roster.size === 1 ? '' : 's'}
            </p>
          )}
        </div>
        {canManage && <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New driver'}</Button>}
      </div>

      {showCreate && (
        <Card>
          <form onSubmit={handleCreate} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Display name" required value={name} onChange={(e) => setName(e.target.value)} />
              <Field label="Number (optional)" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            {numberProblems.map((m) => (
              <p key={m} className="text-xs" style={{ color: 'var(--color-warning)' }}>
                {m}
              </p>
            ))}
            {context && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={addToSeason} onChange={(e) => setAddToSeason(e.target.checked)} />
                Also add to {context.season.name}
              </label>
            )}
            <Button type="submit" disabled={busy || !name.trim() || numberProblems.length > 0}>
              {busy ? 'Adding…' : 'Add driver'}
            </Button>
          </form>
        </Card>
      )}

      {actionError && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {actionError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <label className="min-w-[14rem] flex-1 text-sm">
          <span className="sr-only">Search drivers</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or number"
            className="w-full rounded-lg border bg-transparent px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          Show inactive drivers
        </label>
      </div>

      {context && (
        <Card>
          <CardHeader>
            <CardTitle>Season participants ({participants.length})</CardTitle>
          </CardHeader>
          {participants.length === 0 ? (
            <EmptyState
              title="No season participants"
              description={data.roster.size === 0 ? (canManage ? 'Add existing drivers to this season below.' : 'Drivers appear here once the season roster is set.') : 'No participants match your search.'}
            />
          ) : (
            <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {participants.map((d) => (
                <Row key={d.id} driver={d} inSeason />
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{context ? `League directory (${others.length})` : `Drivers (${others.length})`}</CardTitle>
        </CardHeader>
        {others.length === 0 ? (
          <EmptyState title={data.drivers.length === 0 ? 'No drivers yet' : 'No other drivers'} description={data.drivers.length === 0 ? 'Add drivers to build your league roster.' : undefined} />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {others.map((d) => (
              <Row key={d.id} driver={d} inSeason={false} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
