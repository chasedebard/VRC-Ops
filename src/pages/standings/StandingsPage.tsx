import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { resolveActiveSeason } from '@/utils/activeSeason'
import {
  getLatestStandings,
  getAvailableStandingsGroups,
  getPreviousStandingsRows,
} from '@/services/standings'
import { getDriversByIds } from '@/services/driverProfile'
import { classesService, regionsService, teamsService } from '@/services/catalog'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { StandingsMovementIndicator } from '@/components/StandingsMovementIndicator'
import { ProLockedState } from '@/components/ProLockedState'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { useEntitlement } from '@/hooks/useEntitlement'
import type {
  ChampionshipRow,
  DriverRow,
  SeasonRow,
  StandingsSnapshotRowRow,
  StandingsType,
} from '@/types/database'

export default function StandingsPage() {
  const { selectedLeague } = useLeagueSession()
  const { hasAccess } = useEntitlement()
  const [context, setContext] = useState<{ championship: ChampionshipRow; season: SeasonRow } | null | undefined>(
    undefined,
  )
  const [type, setType] = useState<StandingsType>('overall')
  // Class and regional breakdowns are VRC Ops Pro features (VRCSubseriesStandingsGate on
  // iOS); overall and team standings stay free. Nav stays discoverable — only the table
  // content is gated, matching iOS's "premium features stay visible" pattern.
  const locked = (type === 'class' || type === 'regional') && !hasAccess
  const [groupOptions, setGroupOptions] = useState<{ id: string; label: string }[]>([])
  const [groupKey, setGroupKey] = useState<string | null>(null)
  const [rows, setRows] = useState<StandingsSnapshotRowRow[] | null>(null)
  const [movement, setMovement] = useState<Map<string, number>>(new Map())
  const [drivers, setDrivers] = useState<Map<string, DriverRow>>(new Map())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedLeague) return
    resolveActiveSeason(selectedLeague.league.id).then(setContext).catch((err) => setError(err.message))
  }, [selectedLeague])

  useEffect(() => {
    if (!context || !selectedLeague) return
    async function loadGroups() {
      if (type === 'overall' || locked) {
        setGroupOptions([])
        setGroupKey(null)
        return
      }
      const keys = await getAvailableStandingsGroups(context!.season.id, type)
      const catalog =
        type === 'class' ? classesService : type === 'regional' ? regionsService : teamsService
      const all = await catalog.list(selectedLeague!.league.id)
      // group_key values written by the native app are uppercase UUID strings
      // (Swift's `UUID().uuidString`), while classes/regions/teams ids come
      // back from Postgres lowercase — compare case-insensitively.
      const options = keys.map((k) => ({
        id: k,
        label: all.find((c) => c.id.toLowerCase() === k.toLowerCase())?.name ?? k,
      }))
      setGroupOptions(options)
      setGroupKey(options[0]?.id ?? null)
    }
    loadGroups()
  }, [context, type, selectedLeague, locked])

  async function load() {
    if (!context || locked) {
      setRows(locked ? [] : null)
      return
    }
    setError(null)
    try {
      const [result, previousRows] = await Promise.all([
        getLatestStandings(context.season.id, type, groupKey),
        getPreviousStandingsRows(context.season.id, type, groupKey),
      ])
      setRows(result?.rows ?? [])
      const previousPositionByDriver = new Map(
        previousRows.filter((r) => r.driver_id).map((r) => [r.driver_id as string, r.position]),
      )
      setMovement(
        new Map(
          (result?.rows ?? [])
            .filter((r) => r.driver_id)
            .map((r) => {
              const previous = previousPositionByDriver.get(r.driver_id as string)
              return [r.driver_id as string, previous != null ? previous - r.position : 0]
            }),
        ),
      )
      const ids = (result?.rows ?? []).map((r) => r.driver_id).filter((id): id is string => Boolean(id))
      const driverRows = await getDriversByIds(ids)
      setDrivers(new Map(driverRows.map((d) => [d.id, d])))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load standings.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, type, groupKey, locked])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (context === undefined) return <LoadingState />
  if (context === null) {
    return <EmptyState title="No active season" description="Standings will appear once a season has results." />
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Standings</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {context.championship.name} · {context.season.name}
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--color-border)' }}>
        {(['overall', 'class', 'regional', 'team'] as StandingsType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className="rounded-md px-3 py-1.5 text-sm font-medium capitalize"
            style={{
              backgroundColor: type === t ? 'var(--color-accent)' : 'transparent',
              color: type === t ? 'var(--color-accent-contrast)' : 'var(--color-text)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {groupOptions.length > 0 && (
        <select
          value={groupKey ?? ''}
          onChange={(e) => setGroupKey(e.target.value)}
          className="rounded-lg border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
        >
          {groupOptions.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      )}

      {locked ? (
        <ProLockedState
          title="Class & Regional standings require VRC Ops Pro"
          description="Overall and team standings stay free — class and regional breakdowns are part of VRC Ops Pro."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Standings</CardTitle>
          </CardHeader>
          {rows === null ? (
            <LoadingState />
          ) : rows.length === 0 ? (
            <EmptyState title="No standings yet" description="Standings update automatically once results are saved." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: 'var(--color-text-muted)' }}>
                    <th className="pb-2 pr-4">#</th>
                    <th className="pb-2 pr-4">Driver</th>
                    <th className="pb-2 pr-4">Points</th>
                    <th className="pb-2 pr-4">Wins</th>
                    <th className="pb-2 pr-4">Podiums</th>
                    <th className="pb-2 pr-4">Poles</th>
                    <th className="pb-2 pr-4">FL</th>
                    <th className="pb-2 pr-4">Starts</th>
                    <th className="pb-2 pr-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-1.5">
                          {row.position}
                          {row.driver_id && <StandingsMovementIndicator movement={movement.get(row.driver_id) ?? 0} />}
                        </div>
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        {row.driver_id ? (
                          <Link to={`/drivers/${row.driver_id}`} className="flex items-center gap-2 hover:underline">
                            {drivers.get(row.driver_id) && (
                              <DriverAvatar driver={drivers.get(row.driver_id)!} size="sm" />
                            )}
                            {drivers.get(row.driver_id)?.display_name ?? 'Driver'}
                          </Link>
                        ) : (
                          'Team'
                        )}
                      </td>
                      <td className="py-2 pr-4">{row.points}</td>
                      <td className="py-2 pr-4">{row.wins}</td>
                      <td className="py-2 pr-4">{row.podiums}</td>
                      <td className="py-2 pr-4">{row.poles}</td>
                      <td className="py-2 pr-4">{row.fastest_laps}</td>
                      <td className="py-2 pr-4">{row.starts}</td>
                      <td className="py-2 pr-4">
                        {row.clinched && <Badge tone="success">Clinched</Badge>}
                        {row.eliminated && <Badge tone="danger">Eliminated</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
