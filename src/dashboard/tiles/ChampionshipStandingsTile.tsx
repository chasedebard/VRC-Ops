import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { getLatestStandings, getPreviousStandingsRows } from '@/services/standings'
import { DriverAvatar } from '@/components/DriverAvatar'
import { StandingsMovementIndicator } from '@/components/StandingsMovementIndicator'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { ListIcon } from '../icons'
import type { StandingsType } from '@/types/database'
import type { TileComponentProps } from '../types'

interface ChampionshipStandingsSettings extends Record<string, unknown> {
  standingsType: StandingsType
  count: number
}

export function ChampionshipStandingsTile({ settings }: TileComponentProps<ChampionshipStandingsSettings>) {
  const { active, drivers, loading } = useDashboardBaseData()
  const self = useCurrentDriver()
  const seasonId = active?.season.id ?? null
  const query = useQuery({
    queryKey: dashboardKeys.latestStandings(seasonId ?? 'none', settings.standingsType, null),
    queryFn: () => getLatestStandings(seasonId!, settings.standingsType),
    enabled: Boolean(seasonId),
  })
  const previousQuery = useQuery({
    queryKey: dashboardKeys.previousStandings(seasonId ?? 'none', settings.standingsType, null),
    queryFn: () => getPreviousStandingsRows(seasonId!, settings.standingsType),
    enabled: Boolean(seasonId),
  })

  if (loading || query.isLoading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />
  if (query.error) {
    return <EmptyState title="Could not load standings" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }
  const rows = query.data?.rows ?? []
  if (rows.length === 0) return <EmptyState title="No standings yet" description="Standings appear after the first race." />

  const previousPositionByDriver = new Map(
    (previousQuery.data ?? []).filter((r) => r.driver_id).map((r) => [r.driver_id as string, r.position]),
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {rows.slice(0, settings.count).map((row) => {
            const driver = row.driver_id ? drivers.find((d) => d.id === row.driver_id) : undefined
            const movement = row.driver_id
              ? (previousPositionByDriver.get(row.driver_id) ?? row.position) - row.position
              : 0
            const isSelf = self && row.driver_id === self.id
            return (
              <tr key={row.id} style={isSelf ? { backgroundColor: 'color-mix(in srgb, var(--color-accent) 12%, transparent)' } : undefined}>
                <td className="py-1.5 pr-2 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                  {row.position}
                </td>
                <td className="py-1.5 pr-2">
                  <Link to={row.driver_id ? `/drivers/${row.driver_id}` : '/standings'} className="flex items-center gap-2 hover:underline">
                    {driver && <DriverAvatar driver={driver} size="sm" />}
                    <span className="font-medium">{driver?.display_name ?? 'Team'}</span>
                    <StandingsMovementIndicator movement={movement} />
                  </Link>
                </td>
                <td className="py-1.5 text-right font-mono">{row.points}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <Link to="/standings" className="mt-2 inline-block text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
        Full standings →
      </Link>
    </div>
  )
}

registerTile({
  type: 'championship_standings',
  displayName: 'Championship Standings',
  description: 'Position, points, and movement for the league.',
  icon: ListIcon,
  category: 'standings',
  supportedSizes: ['medium', 'wide', 'large', 'full'],
  defaultSize: 'wide',
  minSize: 'medium',
  maxSize: 'full',
  allowMultipleInstances: true,
  requiresPro: false,
  defaultSettings: { standingsType: 'overall', count: 8 },
  configSchema: [
    {
      key: 'standingsType',
      label: 'Standings',
      type: 'select',
      options: [
        { value: 'overall', label: 'Overall' },
        { value: 'class', label: 'Class' },
        { value: 'regional', label: 'Regional' },
      ],
    },
    { key: 'count', label: 'Drivers to show', type: 'number', min: 3, max: 20 },
  ],
  Component: ChampionshipStandingsTile,
})
