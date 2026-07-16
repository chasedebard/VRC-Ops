import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { MultiSeriesTrendChart, type TrendSeries } from '@/components/charts/MultiSeriesTrendChart'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { SplitIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function QualifyingVsRaceTile(_props: TileComponentProps) {
  const { active, loading } = useDashboardBaseData()
  const driver = useCurrentDriver()
  const seasonId = active?.season.id ?? null
  const query = useQuery({
    queryKey: dashboardKeys.seasonDriverHistory(seasonId ?? 'none'),
    queryFn: () => getSeasonDriverHistory(seasonId!),
    enabled: Boolean(seasonId),
  })

  if (!driver) return <EmptyState title="No driver profile linked" description="Link a driver profile to compare qualifying vs race." />
  if (loading || query.isLoading) return <LoadingState />
  if (query.error) {
    return <EmptyState title="Could not load this comparison" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }

  const races = (query.data ?? [])
    .filter((h) => h.driver_id === driver.id && h.result_kind === 'race')
    .sort((a, b) => (a.events?.round ?? 0) - (b.events?.round ?? 0))
    .filter((r) => r.qualifying_position != null || r.start_position != null)

  if (races.length < 2) return <EmptyState title="Not enough races yet" />

  const xLabels = races.map((r) => `R${r.events?.round ?? '?'}`)
  const series: TrendSeries[] = [
    {
      id: 'qualifying',
      label: 'Qualifying',
      color: '#3b82f6',
      values: races.map((r) => r.qualifying_position ?? r.start_position ?? 0),
    },
    {
      id: 'race',
      label: 'Race finish',
      color: '#f97316',
      values: races.map((r) => r.finish_position ?? 0),
    },
  ]

  const gained = races.filter((r) => {
    const start = r.qualifying_position ?? r.start_position
    return start != null && r.finish_position != null && r.finish_position < start
  }).length

  return (
    <div>
      <MultiSeriesTrendChart xLabels={xLabels} series={series} height={180} />
      <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Lower is better · gained positions in {gained} of {races.length} races.
      </p>
    </div>
  )
}

registerTile({
  type: 'qualifying_vs_race',
  displayName: 'Qualifying vs. Race Performance',
  description: 'Compare your qualifying position to your race finish.',
  icon: SplitIcon,
  category: 'chart',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'wide',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: QualifyingVsRaceTile,
})
