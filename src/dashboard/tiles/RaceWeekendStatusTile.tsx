import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { resolveUpcomingEvent } from '@/services/events'
import { getEventSession } from '@/services/raceControl'
import { Badge } from '@/components/Badge'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { GaugeIcon } from '../icons'
import type { SessionState } from '@/types/database'
import type { TileComponentProps } from '../types'

const STAGE_ORDER: SessionState[] = [
  'scheduled',
  'practice_available',
  'qualifying_active',
  'qualifying_complete',
  'race_ready',
  'race_active',
  'race_complete',
  'results_pending',
]

function stageIndex(state: SessionState | undefined): number {
  if (!state) return -1
  const idx = STAGE_ORDER.indexOf(state)
  return idx === -1 ? STAGE_ORDER.length : idx
}

function phaseStatus(current: number, startIdx: number, activeIdx: number, completeIdx: number): { label: string; tone: 'neutral' | 'success' | 'warning' } {
  if (current >= completeIdx) return { label: 'Complete', tone: 'success' }
  if (current >= activeIdx) return { label: 'In progress', tone: 'warning' }
  if (current >= startIdx) return { label: 'Open', tone: 'neutral' }
  return { label: 'Not started', tone: 'neutral' }
}

export function RaceWeekendStatusTile(_props: TileComponentProps) {
  const { events, loading } = useDashboardBaseData()
  const current = resolveUpcomingEvent(events)
  const sessionQuery = useQuery({
    queryKey: dashboardKeys.eventSession(current?.id ?? 'none'),
    queryFn: () => getEventSession(current!.id),
    enabled: Boolean(current),
  })

  if (loading) return <LoadingState />
  if (!current) return <EmptyState title="No active race weekend" />
  if (sessionQuery.isLoading) return <LoadingState />
  if (sessionQuery.error) {
    return <EmptyState title="Could not load race weekend status" description={toSafeErrorMessage(sessionQuery.error, 'Try again later.')} />
  }

  const state = sessionQuery.data?.state
  const idx = stageIndex(state)
  const practice = phaseStatus(idx, 0, 1, 2)
  const qualifying = phaseStatus(idx, 1, 2, 3)
  const race = phaseStatus(idx, 3, 5, 6)

  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">
        Round {current.round}
        {current.custom_title ? ` — ${current.custom_title}` : ''}
      </p>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--color-text-muted)' }}>Practice</span>
        <Badge tone={practice.tone}>{practice.label}</Badge>
      </div>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--color-text-muted)' }}>Qualifying</span>
        <Badge tone={qualifying.tone}>{qualifying.label}</Badge>
      </div>
      <div className="flex items-center justify-between">
        <span style={{ color: 'var(--color-text-muted)' }}>Race</span>
        <Badge tone={race.tone}>{race.label}</Badge>
      </div>
      {state === 'results_pending' && (
        <p className="pt-1 text-xs" style={{ color: 'var(--color-warning)' }}>
          Results are awaiting submission.
        </p>
      )}
      <Link to={`/race-weekend/${current.id}`} className="mt-1 inline-block text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
        Open race weekend →
      </Link>
    </div>
  )
}

registerTile({
  type: 'race_weekend_status',
  displayName: 'Race Weekend Status',
  description: 'Practice, qualifying, and race session progress.',
  icon: GaugeIcon,
  category: 'race',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'medium',
  minSize: 'small',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: RaceWeekendStatusTile,
})
