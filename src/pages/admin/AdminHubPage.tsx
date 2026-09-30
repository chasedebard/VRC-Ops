import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { RequirePermission } from '@/permissions/Guard'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/States'

interface Row {
  to: string
  title: string
  subtitle: string
  ownerOnly?: boolean
}

const PEOPLE: Row[] = [
  { to: '/admin/members', title: 'Members & roles', subtitle: 'Who is in the league, their roles, and driver account assignments.' },
  { to: '/admin/invitations', title: 'Invitations', subtitle: 'Email invites or manual codes, with one or more roles.' },
  { to: '/admin/announcements', title: 'Announcements', subtitle: 'Messages every member sees on Home.' },
  { to: '/admin/league-plus', title: 'League Plus', subtitle: 'Seats that give members Pro features in this league.', ownerOnly: true },
]

const SETUP: Row[] = [
  { to: '/championships', title: 'Championships & seasons', subtitle: 'Create and configure championships, seasons and the calendar.' },
  { to: '/drivers', title: 'Driver directory', subtitle: 'Season roster, new drivers and number requests.' },
  { to: '/tracks', title: 'Tracks', subtitle: 'The track catalog for your game.' },
  { to: '/classes', title: 'Classes', subtitle: 'Competition classes and GT7 class groups.' },
  { to: '/regions', title: 'Regions', subtitle: 'Regions used for regional standings.' },
]

/** Administration overview (iOS `VRCAdministrationHubView`): People & Access, then a shortcut list to the canonical championship setup area. */
export default function AdminHubPage() {
  return (
    <RequirePermission permission="usesAdminShell">
      <Hub />
    </RequirePermission>
  )
}

function Hub() {
  const { selectedLeague, permissions } = useLeagueSession()
  if (!selectedLeague) return <EmptyState title="No league selected" />
  const tile = (row: Row) => {
    if (row.ownerOnly && !permissions.canManageLeague) return null
    return (
      <li key={row.to}>
        <Link to={row.to} className="block">
          <Card className="h-full transition hover:shadow-md">
            <CardHeader>
              <CardTitle>{row.title}</CardTitle>
              {row.ownerOnly && <Badge tone="neutral">Owner</Badge>}
            </CardHeader>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{row.subtitle}</p>
          </Card>
        </Link>
      </li>
    )
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Administration</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {selectedLeague.league.name} · manage people, access and championship setup. Every change is re-checked by the server.
        </p>
      </div>
      <section aria-labelledby="people-heading" className="space-y-3">
        <h2 id="people-heading" className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>People &amp; access</h2>
        <ul className="grid gap-3 sm:grid-cols-2">{PEOPLE.map(tile)}</ul>
      </section>
      <section aria-labelledby="setup-heading" className="space-y-3">
        <h2 id="setup-heading" className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Championship setup</h2>
        <ul className="grid gap-3 sm:grid-cols-2">{SETUP.map(tile)}</ul>
      </section>
    </div>
  )
}
