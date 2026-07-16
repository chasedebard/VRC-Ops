import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { getLatestStandings } from '@/services/standings'
import { DriverAvatar } from '@/components/DriverAvatar'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { TargetIcon } from '../icons'
import type { TileComponentProps } from '../types'

interface ClosestRivalSettings extends Record<string, unknown> {
  rivalDriverId: string
}

export function ClosestRivalTile({ settings }: TileComponentProps<ClosestRivalSettings>) {
  const driver = useCurrentDriver()
  const { active, drivers, loading: baseLoading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const query = useQuery({
    queryKey: dashboardKeys.latestStandings(seasonId ?? 'none', 'overall', null),
    queryFn: () => getLatestStandings(seasonId!, 'overall'),
    enabled: Boolean(seasonId),
  })

  if (!driver) return <EmptyState title="No driver profile linked" description="Link a driver profile to see your closest rival." />
  if (baseLoading || query.isLoading) return <LoadingState />
  if (query.error) {
    return <EmptyState title="Could not load standings" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }

  const rows = query.data?.rows ?? []
  const selfRow = rows.find((r) => r.driver_id === driver.id)
  if (!selfRow) return <EmptyState title="Not yet in the standings" description="Results appear here after your first race." />

  let rivalRow = settings.rivalDriverId ? rows.find((r) => r.driver_id === settings.rivalDriverId) : undefined
  if (!rivalRow) {
    const above = rows.find((r) => r.position === selfRow.position - 1)
    const below = rows.find((r) => r.position === selfRow.position + 1)
    const gapAbove = above ? Math.abs(above.points - selfRow.points) : Infinity
    const gapBelow = below ? Math.abs(below.points - selfRow.points) : Infinity
    rivalRow = gapAbove <= gapBelow ? above : below
  }

  if (!rivalRow || !rivalRow.driver_id) return <EmptyState title="No rival yet" description="Standings need at least two drivers." />

  const rivalDriver = drivers.find((d) => d.id === rivalRow!.driver_id)
  const gap = rivalRow.points - selfRow.points

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {rivalDriver && <DriverAvatar driver={rivalDriver} size="md" />}
          <div>
            <Link to={rivalDriver ? `/drivers/${rivalDriver.id}` : '#'} className="font-medium hover:underline">
              {rivalDriver?.display_name ?? 'Driver'}
            </Link>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              P{rivalRow.position}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono font-semibold" style={{ color: gap >= 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {gap >= 0 ? `+${gap}` : gap} pts
          </p>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {gap >= 0 ? 'ahead of you' : 'behind you'}
          </p>
        </div>
      </div>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        You: P{selfRow.position} · {selfRow.points} pts
      </p>
    </div>
  )
}

registerTile({
  type: 'closest_rival',
  displayName: 'Closest Rival',
  description: 'The nearest driver to you in the championship standings.',
  icon: TargetIcon,
  category: 'driver',
  supportedSizes: ['small', 'medium'],
  defaultSize: 'medium',
  minSize: 'small',
  maxSize: 'medium',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: { rivalDriverId: '' },
  configSchema: [
    {
      key: 'rivalDriverId',
      label: 'Rival (optional override)',
      type: 'select',
      options: (ctx) => [
        { value: '', label: 'Automatic' },
        ...ctx.drivers.map((d) => ({ value: d.id, label: d.display_name })),
      ],
      hint: 'Leave on Automatic to use the closest driver by points.',
    },
  ],
  Component: ClosestRivalTile,
})
