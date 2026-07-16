import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { getLeagueMembers } from '@/services/leagues'
import { getLeagueInvitations } from '@/services/invitations'
import { getSeasonRoster } from '@/services/drivers'
import { resolveUpcomingEvent } from '@/services/events'
import { LoadingState, EmptyState } from '@/components/States'
import { formatDate } from '@/utils/format'
import { toSafeErrorMessage } from '@/utils/errors'
import { ShieldIcon } from '../icons'
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

export function AdministrationSummaryTile(_props: TileComponentProps) {
  const { leagueId, active, drivers, events, loading } = useDashboardBaseData()
  const membersQuery = useQuery({ queryKey: dashboardKeys.leagueMembers(leagueId), queryFn: () => getLeagueMembers(leagueId) })
  const invitationsQuery = useQuery({ queryKey: dashboardKeys.leagueInvitations(leagueId), queryFn: () => getLeagueInvitations(leagueId) })
  const rosterQuery = useQuery({
    queryKey: ['season', active?.season.id ?? 'none', 'roster'],
    queryFn: () => getSeasonRoster(active!.season.id),
    enabled: Boolean(active),
  })

  if (loading || membersQuery.isLoading || invitationsQuery.isLoading) return <LoadingState />
  if (membersQuery.error) {
    return <EmptyState title="Could not load administration summary" description={toSafeErrorMessage(membersQuery.error, 'Try again later.')} />
  }

  const activeDrivers = drivers.filter((d) => d.is_active).length
  const pendingInvitations = (invitationsQuery.data ?? []).filter((i) => i.status === 'pending').length
  const upcoming = resolveUpcomingEvent(events)
  const alerts: string[] = []
  if (!active) alerts.push('No active season')
  if (active && events.length === 0) alerts.push('No events scheduled')
  if (active && rosterQuery.data && rosterQuery.data.length === 0) alerts.push('No drivers assigned to the season roster')
  if (drivers.length === 0) alerts.push('No drivers in the league roster')

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Active drivers" value={activeDrivers} />
        <Stat label="Pending invitations" value={pendingInvitations} />
        <Stat label="Current season" value={active?.season.name ?? '—'} />
        <Stat label="Upcoming event" value={upcoming ? `Round ${upcoming.round}` : '—'} />
        <Stat label="Next event date" value={upcoming ? formatDate(upcoming.event_date) : '—'} />
        <Stat label="Members" value={membersQuery.data?.length ?? 0} />
      </div>
      {alerts.length > 0 && (
        <ul className="space-y-1 border-t pt-2 text-xs" style={{ borderColor: 'var(--color-border)', color: 'var(--color-warning)' }}>
          {alerts.map((alert) => (
            <li key={alert}>• {alert}</li>
          ))}
        </ul>
      )}
      <Link to="/admin" className="inline-block text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
        Go to Administration →
      </Link>
    </div>
  )
}

registerTile({
  type: 'administration_summary',
  displayName: 'Administration Summary',
  description: 'Roster, invitations, and setup alerts at a glance.',
  icon: ShieldIcon,
  category: 'admin',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'wide',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiredPermission: 'canManageMembers',
  requiresPro: false,
  defaultSettings: {},
  Component: AdministrationSummaryTile,
})
