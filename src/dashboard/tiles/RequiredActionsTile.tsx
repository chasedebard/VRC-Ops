import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useCurrentDriver } from '../useCurrentDriver'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getLeagueInvitations } from '@/services/invitations'
import { classesService, regionsService } from '@/services/catalog'
import { getTracks } from '@/services/tracks'
import { EmptyState, LoadingState } from '@/components/States'
import { BellIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function RequiredActionsTile(_props: TileComponentProps) {
  const { permissions } = useLeagueSession()
  const { leagueId, active, drivers, events, loading } = useDashboardBaseData()
  const driver = useCurrentDriver()

  const invitationsQuery = useQuery({
    queryKey: dashboardKeys.leagueInvitations(leagueId),
    queryFn: () => getLeagueInvitations(leagueId),
    enabled: permissions.canManageMembers,
  })
  const classesQuery = useQuery({
    queryKey: dashboardKeys.classes(leagueId),
    queryFn: () => classesService.list(leagueId),
    enabled: permissions.canManageMembers && Boolean(active?.championship.classes_enabled),
  })
  const regionsQuery = useQuery({
    queryKey: dashboardKeys.regions(leagueId),
    queryFn: () => regionsService.list(leagueId),
    enabled: permissions.canManageMembers && Boolean(active?.championship.regions_enabled),
  })
  const tracksQuery = useQuery({
    queryKey: dashboardKeys.tracks(active?.championship.game_id ?? 'none', leagueId),
    queryFn: () => getTracks(active!.championship.game_id, leagueId),
    enabled: permissions.canManageMembers && Boolean(active),
  })

  if (loading) return <LoadingState />

  const items: string[] = []

  if (permissions.canManageMembers) {
    const pendingInvites = (invitationsQuery.data ?? []).filter((i) => i.status === 'pending').length
    if (pendingInvites > 0) items.push(`${pendingInvites} pending invitation${pendingInvites === 1 ? '' : 's'}`)
    if (!active) items.push('No active season — create a championship and season.')
    if (active) {
      if (events.length === 0) items.push('No events scheduled yet for this season.')
      if (drivers.length === 0) items.push('No drivers in the league roster yet.')
      if (tracksQuery.data && tracksQuery.data.length === 0) items.push('No tracks in the catalog for this game yet.')
      if (active.championship.classes_enabled && classesQuery.data && classesQuery.data.length === 0) {
        items.push('Classes are enabled but none have been created yet.')
      }
      if (active.championship.regions_enabled && regionsQuery.data && regionsQuery.data.length === 0) {
        items.push('Regions are enabled but none have been created yet.')
      }
    }
  } else if (!driver) {
    items.push('Your account isn’t linked to a driver profile yet.')
  }

  if (items.length === 0) {
    return <EmptyState title="No action needed" description="You're all caught up." />
  }

  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: 'var(--color-warning)' }} />
          <span>{item}</span>
        </li>
      ))}
      {permissions.canManageMembers && (
        <Link to="/admin" className="inline-block pt-1 text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
          Go to Administration →
        </Link>
      )}
      {!permissions.canManageMembers && !driver && (
        <Link to="/account" className="inline-block pt-1 text-xs underline" style={{ color: 'var(--color-text-muted)' }}>
          Go to Account →
        </Link>
      )}
    </ul>
  )
}

registerTile({
  type: 'required_actions',
  displayName: 'Notifications & Required Actions',
  description: 'Setup gaps, pending invitations, and account follow-ups.',
  icon: BellIcon,
  category: 'admin',
  supportedSizes: ['small', 'medium', 'wide'],
  defaultSize: 'medium',
  minSize: 'small',
  maxSize: 'wide',
  allowMultipleInstances: false,
  mandatory: true,
  requiresPro: false,
  defaultSettings: {},
  Component: RequiredActionsTile,
})
