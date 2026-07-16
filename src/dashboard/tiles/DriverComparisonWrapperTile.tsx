import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { getLatestStandings } from '@/services/standings'
import { classesService, regionsService } from '@/services/catalog'
import { buildDriverComparisonStats } from '@/utils/driverComparison'
import { DriverComparisonTile as DriverComparisonInner } from '@/components/DriverComparisonTile'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { SplitIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function DriverComparisonWrapperTile(_props: TileComponentProps) {
  const { leagueId, active, drivers, loading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const historyQuery = useQuery({
    queryKey: dashboardKeys.seasonDriverHistory(seasonId ?? 'none'),
    queryFn: () => getSeasonDriverHistory(seasonId!),
    enabled: Boolean(seasonId),
  })
  const standingsQuery = useQuery({
    queryKey: dashboardKeys.latestStandings(seasonId ?? 'none', 'overall', null),
    queryFn: () => getLatestStandings(seasonId!, 'overall'),
    enabled: Boolean(seasonId),
  })
  const classesQuery = useQuery({ queryKey: dashboardKeys.classes(leagueId), queryFn: () => classesService.list(leagueId) })
  const regionsQuery = useQuery({ queryKey: dashboardKeys.regions(leagueId), queryFn: () => regionsService.list(leagueId) })

  if (loading || historyQuery.isLoading || standingsQuery.isLoading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />
  if (historyQuery.error) {
    return <EmptyState title="Could not load comparison data" description={toSafeErrorMessage(historyQuery.error, 'Try again later.')} />
  }

  const stats = buildDriverComparisonStats({
    drivers,
    history: historyQuery.data ?? [],
    standingsRows: standingsQuery.data?.rows ?? [],
    classLabelById: new Map((classesQuery.data ?? []).map((c) => [c.id, c.name])),
    regionLabelById: new Map((regionsQuery.data ?? []).map((r) => [r.id, r.name])),
  })

  return <DriverComparisonInner drivers={drivers} stats={stats} />
}

registerTile({
  type: 'driver_comparison',
  displayName: 'Driver Comparison',
  description: 'Head-to-head comparison across two or three drivers.',
  icon: SplitIcon,
  category: 'chart',
  supportedSizes: ['large', 'full'],
  defaultSize: 'full',
  minSize: 'large',
  maxSize: 'full',
  allowMultipleInstances: false,
  requiresPro: true,
  defaultSettings: {},
  Component: DriverComparisonWrapperTile,
})
