import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { resolveLastCompletedEvent } from '@/services/events'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { getResultSet, getRaceResults } from '@/services/results'
import { DriverAvatar } from '@/components/DriverAvatar'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { FlagIcon } from '../icons'
import type { RaceResultRow } from '@/types/database'
import type { TileComponentProps } from '../types'

function ResultLine({ label, result, drivers }: { label: string; result: RaceResultRow | undefined; drivers: ReturnType<typeof useDashboardBaseData>['drivers'] }) {
  const driver = result ? drivers.find((d) => d.id === result.driver_id) : undefined
  return (
    <div className="flex items-center justify-between text-sm">
      <span style={{ color: 'var(--color-text-muted)' }}>{label}</span>
      {driver ? (
        <span className="flex items-center gap-1.5 font-medium">
          <DriverAvatar driver={driver} size="sm" />
          {driver.display_name}
        </span>
      ) : (
        <span style={{ color: 'var(--color-text-muted)' }}>—</span>
      )}
    </div>
  )
}

export function LastRaceTile(_props: TileComponentProps) {
  const { active, drivers, events, loading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const historyQuery = useQuery({
    queryKey: dashboardKeys.seasonDriverHistory(seasonId ?? 'none'),
    queryFn: () => getSeasonDriverHistory(seasonId!),
    enabled: Boolean(seasonId),
  })

  const completedEventIds = new Set(
    (historyQuery.data ?? []).filter((h) => h.result_kind === 'race').map((h) => h.event_id),
  )
  const lastEvent = resolveLastCompletedEvent(events, completedEventIds)

  const resultSetQuery = useQuery({
    queryKey: dashboardKeys.resultSet(lastEvent?.id ?? 'none', 'race'),
    queryFn: () => getResultSet(lastEvent!.id, 'race'),
    enabled: Boolean(lastEvent),
  })
  const raceResultsQuery = useQuery({
    queryKey: dashboardKeys.raceResults(resultSetQuery.data?.id ?? 'none'),
    queryFn: () => getRaceResults(resultSetQuery.data!.id),
    enabled: Boolean(resultSetQuery.data),
  })

  if (loading || historyQuery.isLoading) return <LoadingState />
  if (historyQuery.error) {
    return <EmptyState title="Could not load results" description={toSafeErrorMessage(historyQuery.error, 'Try again later.')} />
  }
  if (!lastEvent) return <EmptyState title="No completed races yet" />
  if (resultSetQuery.isLoading || raceResultsQuery.isLoading) return <LoadingState />

  const raceResults = raceResultsQuery.data ?? []
  const winner = raceResults.find((r) => r.finish_position === 1 && r.status === 'fin')
  const pole = raceResults.find((r) => r.earned_pole)
  const fastest = raceResults.find((r) => r.fastest_lap)

  return (
    <Link to={`/results/${lastEvent.id}`} className="block h-full">
      <div className="space-y-2">
        <p className="font-semibold">
          Round {lastEvent.round}
          {lastEvent.custom_title ? ` — ${lastEvent.custom_title}` : ''}
        </p>
        <ResultLine label="Winner" result={winner} drivers={drivers} />
        <ResultLine label="Pole" result={pole} drivers={drivers} />
        <ResultLine label="Fastest lap" result={fastest} drivers={drivers} />
      </div>
    </Link>
  )
}

registerTile({
  type: 'last_race',
  displayName: 'Last Race',
  description: 'Winner, pole, and fastest lap from the most recent race.',
  icon: FlagIcon,
  category: 'race',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'medium',
  minSize: 'small',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: LastRaceTile,
})
