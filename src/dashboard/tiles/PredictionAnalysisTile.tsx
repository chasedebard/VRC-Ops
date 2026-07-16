import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { resolveUpcomingEvent } from '@/services/events'
import {
  buildFactorInputs,
  computeLeaguePriors,
  fastestLapScore,
  formatPercent,
  normalizeToProbabilitiesBayesian,
  podiumScore,
  poleScore,
  raceWinnerScore,
} from '@/utils/predictions'
import { DriverAvatar } from '@/components/DriverAvatar'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { TargetIcon } from '../icons'
import type { TileComponentProps } from '../types'

const CATEGORY_SCORERS = {
  raceWinner: raceWinnerScore,
  podium: podiumScore,
  pole: poleScore,
  fastestLap: fastestLapScore,
}
const CATEGORY_LABEL: Record<keyof typeof CATEGORY_SCORERS, string> = {
  raceWinner: 'Race win probability',
  podium: 'Podium probability',
  pole: 'Pole probability',
  fastestLap: 'Fastest-lap probability',
}

interface PredictionAnalysisSettings extends Record<string, unknown> {
  category: keyof typeof CATEGORY_SCORERS
}

export function PredictionAnalysisTile({ settings }: TileComponentProps<PredictionAnalysisSettings>) {
  const { active, drivers, events, loading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const query = useQuery({
    queryKey: dashboardKeys.seasonDriverHistory(seasonId ?? 'none'),
    queryFn: () => getSeasonDriverHistory(seasonId!),
    enabled: Boolean(seasonId),
  })

  if (loading || query.isLoading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />
  if (query.error) {
    return <EmptyState title="Could not load predictions" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }

  const history = query.data ?? []
  const driverIds = Array.from(new Set(history.map((h) => h.driver_id)))
  if (driverIds.length === 0) {
    return <EmptyState title="Not enough race data yet" description="Predictions appear once a few races are official." />
  }

  const upcoming = resolveUpcomingEvent(events)
  const priors = computeLeaguePriors(history)
  const factorInputs = driverIds.map((id) => {
    const driver = drivers.find((d) => d.id === id)
    return buildFactorInputs(id, driver?.display_name ?? 'Driver', history, upcoming?.track_id ?? null, priors)
  })

  const scorer = CATEGORY_SCORERS[settings.category]
  const scored = factorInputs.map((f) => ({ driverId: f.driverId, score: scorer(f), sampleSize: f.completedRaceCount }))
  const ranked = normalizeToProbabilitiesBayesian(scored)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3)

  if (ranked.length === 0) return <EmptyState title="Not enough data yet" />

  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
        {CATEGORY_LABEL[settings.category]}
      </p>
      {ranked.map((pick) => {
        const driver = drivers.find((d) => d.id === pick.driverId)
        return (
          <div key={pick.driverId} className="flex items-center justify-between">
            <Link to={driver ? `/drivers/${driver.id}` : '#'} className="flex items-center gap-2 hover:underline">
              {driver && <DriverAvatar driver={driver} size="sm" />}
              <span className="font-medium">{driver?.display_name ?? 'Driver'}</span>
            </Link>
            <span className="font-mono">{formatPercent(pick.probability)}</span>
          </div>
        )
      })}
      <Link to="/predictions" className="inline-block pt-1 text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
        Full predictions →
      </Link>
    </div>
  )
}

registerTile({
  type: 'prediction_analysis',
  displayName: 'Prediction Analysis',
  description: 'Win, podium, pole, and fastest-lap probabilities.',
  icon: TargetIcon,
  category: 'chart',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'medium',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: true,
  requiresPro: true,
  defaultSettings: { category: 'raceWinner' },
  configSchema: [
    {
      key: 'category',
      label: 'Market',
      type: 'select',
      options: [
        { value: 'raceWinner', label: 'Race winner' },
        { value: 'podium', label: 'Podium' },
        { value: 'pole', label: 'Pole' },
        { value: 'fastestLap', label: 'Fastest lap' },
      ],
    },
  ],
  Component: PredictionAnalysisTile,
})
