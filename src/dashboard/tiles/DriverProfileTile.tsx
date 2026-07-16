import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { classesService, regionsService, teamsService } from '@/services/catalog'
import { DriverAvatar } from '@/components/DriverAvatar'
import { LoadingState, EmptyState } from '@/components/States'
import { UserIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function DriverProfileTile(_props: TileComponentProps) {
  const { selectedLeague } = useLeagueSession()
  const { leagueId, active, loading: baseLoading } = useDashboardBaseData()
  const driver = useCurrentDriver()

  const classesQuery = useQuery({ queryKey: dashboardKeys.classes(leagueId), queryFn: () => classesService.list(leagueId) })
  const regionsQuery = useQuery({ queryKey: dashboardKeys.regions(leagueId), queryFn: () => regionsService.list(leagueId) })
  const teamsQuery = useQuery({ queryKey: dashboardKeys.teams(leagueId), queryFn: () => teamsService.list(leagueId) })

  if (baseLoading) return <LoadingState />
  if (!driver) {
    return (
      <EmptyState
        title="No driver profile linked"
        description="Link a driver profile in Account settings to see it here."
      />
    )
  }

  const className = classesQuery.data?.find((c) => c.id === driver.class_id)?.name
  const regionName = regionsQuery.data?.find((r) => r.id === driver.region_id)?.name
  const teamName = teamsQuery.data?.find((t) => t.id === driver.team_id)?.name

  return (
    <div className="flex h-full items-center gap-3">
      <DriverAvatar driver={driver} size="card" />
      <div className="min-w-0 space-y-0.5 text-sm">
        <p className="truncate text-base font-semibold">{driver.display_name}</p>
        {driver.driver_number != null && (
          <p style={{ color: 'var(--color-text-muted)' }}>#{driver.driver_number}</p>
        )}
        {teamName && <p style={{ color: 'var(--color-text-muted)' }}>{teamName}</p>}
        {(className || regionName) && (
          <p style={{ color: 'var(--color-text-muted)' }}>{[className, regionName].filter(Boolean).join(' / ')}</p>
        )}
        {active && (
          <p style={{ color: 'var(--color-text-muted)' }}>
            {selectedLeague?.league.name} · {active.season.name}
          </p>
        )}
      </div>
    </div>
  )
}

registerTile({
  type: 'driver_profile',
  displayName: 'Driver Profile',
  description: 'Your name, number, team, class, and current league/season.',
  icon: UserIcon,
  category: 'driver',
  supportedSizes: ['small', 'medium'],
  defaultSize: 'medium',
  minSize: 'small',
  maxSize: 'medium',
  allowMultipleInstances: false,
  requiredPermission: undefined,
  requiresPro: false,
  defaultSettings: {},
  Component: DriverProfileTile,
})
