import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { ROLE_LABEL } from '@/permissions/resolver'

const QUICK_LINKS: { to: string; label: string; description: string }[] = [
  { to: '/championships', label: 'Championship', description: 'Championships, seasons, and the calendar.' },
  { to: '/race-weekend', label: 'Race Weekend', description: 'Current event, practice, qualifying, and results.' },
  { to: '/standings', label: 'Standings', description: 'Overall, class, region, and team standings.' },
  { to: '/predictions', label: 'Predictions', description: 'Forecasts for the next race and the title fight.' },
  { to: '/drivers', label: 'Drivers', description: 'Roster and driver profiles.' },
]

export default function DashboardPage() {
  const { selectedLeague, permissions } = useLeagueSession()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{selectedLeague?.league.name ?? 'Dashboard'}</h1>
        {selectedLeague && (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Signed in as {selectedLeague.roles.map((r) => ROLE_LABEL[r]).join(' · ')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link key={link.to} to={link.to}>
            <Card className="h-full transition hover:shadow-md">
              <CardHeader>
                <CardTitle>{link.label}</CardTitle>
              </CardHeader>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                {link.description}
              </p>
            </Card>
          </Link>
        ))}
        {permissions.usesAdminShell && (
          <Link to="/admin">
            <Card className="h-full transition hover:shadow-md" style={{ borderColor: 'var(--color-accent)' }}>
              <CardHeader>
                <CardTitle>Administration</CardTitle>
              </CardHeader>
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Members, invites, tracks, classes, and regions.
              </p>
            </Card>
          </Link>
        )}
      </div>
    </div>
  )
}
