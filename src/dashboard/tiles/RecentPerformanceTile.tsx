import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { ActivityIcon } from '../icons'
import type { TileComponentProps } from '../types'

interface RecentPerformanceSettings extends Record<string, unknown> {
  count: number
}

export function RecentPerformanceTile({ settings }: TileComponentProps<RecentPerformanceSettings>) {
  const driver = useCurrentDriver()
  const { active, loading: baseLoading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const query = useQuery({
    queryKey: dashboardKeys.seasonDriverHistory(seasonId ?? 'none'),
    queryFn: () => getSeasonDriverHistory(seasonId!),
    enabled: Boolean(seasonId),
  })

  if (!driver) return <EmptyState title="No driver profile linked" description="Link a driver profile to see recent results." />
  if (baseLoading || query.isLoading) return <LoadingState />
  if (query.error) {
    return <EmptyState title="Could not load recent performance" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }

  const races = (query.data ?? [])
    .filter((h) => h.driver_id === driver.id && h.result_kind === 'race')
    .sort((a, b) => (b.events?.round ?? 0) - (a.events?.round ?? 0))
    .slice(0, settings.count)

  if (races.length === 0) return <EmptyState title="No races yet this season" />

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr style={{ color: 'var(--color-text-muted)' }}>
            <th className="pb-1 pr-2">Rnd</th>
            <th className="pb-1 pr-2">Start</th>
            <th className="pb-1 pr-2">Finish</th>
            <th className="pb-1 pr-2">+/-</th>
            <th className="pb-1 pr-2">Pts</th>
            <th className="pb-1">FL</th>
          </tr>
        </thead>
        <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {races.map((race) => {
            const delta =
              race.start_position != null && race.finish_position != null ? race.start_position - race.finish_position : null
            return (
              <tr key={race.id}>
                <td className="py-1 pr-2 font-medium">{race.events?.round ?? '—'}</td>
                <td className="py-1 pr-2">{race.start_position ?? '—'}</td>
                <td className="py-1 pr-2 font-mono">
                  {race.status === 'fin' ? `P${race.finish_position ?? '—'}` : race.status?.toUpperCase() ?? '—'}
                </td>
                <td
                  className="py-1 pr-2 font-mono"
                  style={{ color: delta == null ? 'var(--color-text-muted)' : delta > 0 ? 'var(--color-success)' : delta < 0 ? 'var(--color-danger)' : undefined }}
                >
                  {delta == null ? '—' : delta > 0 ? `+${delta}` : delta}
                </td>
                <td className="py-1 pr-2 font-mono">{race.points ?? 0}</td>
                <td className="py-1">{race.fastest_lap ? '✓' : ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

registerTile({
  type: 'recent_performance',
  displayName: 'Recent Performance',
  description: 'Your last few race results at a glance.',
  icon: ActivityIcon,
  category: 'driver',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'wide',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: { count: 5 },
  configSchema: [{ key: 'count', label: 'Races to show', type: 'number', min: 3, max: 10 }],
  Component: RecentPerformanceTile,
})
