import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { ROLE_LABEL } from '@/permissions/resolver'

/** Shown when the account belongs to several leagues and none is selected yet (iOS `VRCLeagueSelectionView`). */
export default function LeagueChooserPage() {
  const { signOut } = useAuth()
  const { leagues, selectLeague } = useLeagueSession()
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-8">
      <div>
        <h1 className="text-xl font-bold">Choose a league</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          You belong to {leagues.length} leagues.
        </p>
      </div>
      <ul className="space-y-3">
        {leagues.map((l) => (
          <li key={l.league.id}>
            <button
              type="button"
              onClick={() => selectLeague(l.league.id)}
              className="w-full text-left"
              aria-label={`Open ${l.league.name}`}
            >
              <Card className="transition hover:shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold">{l.league.name}</span>
                  {l.league.setup_state === 'pending_setup' && l.roles.includes('owner') && (
                    <Badge tone="warning">Setup needed</Badge>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {l.roles.map((r) => (
                    <Badge key={r} tone="accent">
                      {ROLE_LABEL[r]}
                    </Badge>
                  ))}
                </div>
              </Card>
            </button>
          </li>
        ))}
      </ul>
      <Link to="/join" className="text-sm font-semibold underline" style={{ color: 'var(--color-accent)' }}>
        Join or create another league
      </Link>
      <Button variant="secondary" onClick={() => signOut()}>
        Sign out
      </Button>
    </div>
  )
}
