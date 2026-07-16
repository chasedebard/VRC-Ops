import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useCurrentDriver } from '../useCurrentDriver'
import { getDriverHistory } from '@/services/driverProfile'
import { computePersonalBests } from '@/utils/personalBests'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { StarIcon } from '../icons'
import type { TileComponentProps } from '../types'

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
    </div>
  )
}

export function PersonalBestsTile(_props: TileComponentProps) {
  const driver = useCurrentDriver()
  const query = useQuery({
    queryKey: dashboardKeys.driverHistory(driver?.id ?? 'none'),
    queryFn: () => getDriverHistory(driver!.id),
    enabled: Boolean(driver),
  })

  if (!driver) return <EmptyState title="No driver profile linked" description="Link a driver profile to see your personal bests." />
  if (query.isLoading) return <LoadingState />
  if (query.error) {
    return <EmptyState title="Could not load personal bests" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }

  const history = query.data ?? []
  if (history.length === 0) return <EmptyState title="No race history yet" />

  const bests = computePersonalBests(history)

  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat label="Best qualifying" value={bests.bestQualifying != null ? `P${bests.bestQualifying}` : '—'} />
      <Stat label="Best race finish" value={bests.bestFinish != null ? `P${bests.bestFinish}` : '—'} />
      <Stat label="Most points in a race" value={bests.mostPointsInRace ?? '—'} />
      <Stat label="Longest podium streak" value={bests.longestPodiumStreak} />
    </div>
  )
}

registerTile({
  type: 'personal_bests',
  displayName: 'Personal Bests',
  description: 'Your best qualifying, finish, and podium streak.',
  icon: StarIcon,
  category: 'driver',
  supportedSizes: ['small', 'medium'],
  defaultSize: 'small',
  minSize: 'small',
  maxSize: 'medium',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: PersonalBestsTile,
})
