import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { getDriverHistory } from '@/services/driverProfile'
import { getTracks } from '@/services/tracks'
import { LoadingState, EmptyState } from '@/components/States'
import { formatLapTime } from '@/utils/format'
import { toSafeErrorMessage } from '@/utils/errors'
import { MapPinIcon } from '../icons'
import type { TileComponentProps } from '../types'

interface TrackPerformanceSettings extends Record<string, unknown> {
  trackId: string
}

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

export function TrackPerformanceTile({ settings }: TileComponentProps<TrackPerformanceSettings>) {
  const driver = useCurrentDriver()
  const { leagueId, active } = useDashboardBaseData()
  const tracksQuery = useQuery({
    queryKey: dashboardKeys.tracks(active?.championship.game_id ?? 'none', leagueId),
    queryFn: () => getTracks(active!.championship.game_id, leagueId),
    enabled: Boolean(active),
  })
  const historyQuery = useQuery({
    queryKey: dashboardKeys.driverHistory(driver?.id ?? 'none'),
    queryFn: () => getDriverHistory(driver!.id),
    enabled: Boolean(driver),
  })

  if (!driver) return <EmptyState title="No driver profile linked" description="Link a driver profile to see track performance." />
  if (historyQuery.isLoading) return <LoadingState />
  if (historyQuery.error) {
    return <EmptyState title="Could not load track history" description={toSafeErrorMessage(historyQuery.error, 'Try again later.')} />
  }
  if (!settings.trackId) {
    return <EmptyState title="Choose a track" description="Configure this tile to pick a track." />
  }

  const trackName = tracksQuery.data?.find((t) => t.id === settings.trackId)?.name ?? 'this track'
  const races = (historyQuery.data ?? []).filter((h) => h.result_kind === 'race' && h.track_id === settings.trackId)
  if (races.length === 0) {
    return <EmptyState title={`No races at ${trackName} yet`} />
  }

  const finishes = races.filter((r) => r.status === 'fin' && r.finish_position != null).map((r) => r.finish_position as number)
  const wins = finishes.filter((p) => p === 1).length
  const podiums = finishes.filter((p) => p <= 3).length
  const avgFinish = finishes.length > 0 ? finishes.reduce((a, b) => a + b, 0) / finishes.length : null
  const fastestLap = races.reduce((best: number | null, r) => (r.best_lap_ms != null && (best == null || r.best_lap_ms < best) ? r.best_lap_ms : best), null)

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
        {trackName}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Starts" value={races.length} />
        <Stat label="Wins" value={wins} />
        <Stat label="Podiums" value={podiums} />
        <Stat label="Avg. finish" value={avgFinish != null ? avgFinish.toFixed(1) : '—'} />
        <Stat label="Fastest lap" value={formatLapTime(fastestLap)} />
      </div>
    </div>
  )
}

registerTile({
  type: 'track_performance',
  displayName: 'Track Performance',
  description: 'Your record at a specific track.',
  icon: MapPinIcon,
  category: 'driver',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'medium',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: true,
  requiresPro: false,
  defaultSettings: { trackId: '' },
  configSchema: [
    {
      key: 'trackId',
      label: 'Track',
      type: 'select',
      options: (ctx) => ctx.tracks.map((t) => ({ value: t.id, label: t.name })),
      hint: 'Pick a track from your league’s catalog for the active game.',
    },
  ],
  Component: TrackPerformanceTile,
})
