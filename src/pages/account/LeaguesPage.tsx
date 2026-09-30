import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { leaveLeague } from '@/services/leagues'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { EmptyState } from '@/components/States'
import { Modal } from '@/components/Modal'
import { ROLE_LABEL } from '@/permissions/resolver'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { MyLeagueMembership } from '@/services/leagues'

/**
 * Account ▸ Leagues (iOS `VRCLeaguesView`): the active league, every league the account belongs to, switch in place,
 * join or create another, and leave a league (blocked server-side if it would orphan the sole Owner).
 */
export default function LeaguesPage() {
  const { leagues, selectedLeague, selectLeague, refresh, clearLeagueSelection } = useLeagueSession()
  const [pendingLeave, setPendingLeave] = useState<MyLeagueMembership | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirmLeave() {
    if (!pendingLeave) return
    setBusy(true)
    setError(null)
    try {
      await leaveLeague(pendingLeave.membershipId)
      if (selectedLeague?.league.id === pendingLeave.league.id) clearLeagueSelection()
      setPendingLeave(null)
      await refresh()
    } catch (err) {
      // A failure (e.g. the sole-Owner safeguard) must leave the dialog open with the error visible.
      setError(backendErrorMessage(err, 'Could not leave this league.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link to="/account" className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
          ← Account
        </Link>
        <h1 className="text-2xl font-bold">Leagues</h1>
      </div>

      {leagues.length === 0 ? (
        <EmptyState title="No leagues yet" description="Join a league with a code, or create your own." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your leagues</CardTitle>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {leagues.length} {leagues.length === 1 ? 'league' : 'leagues'}
            </span>
          </CardHeader>
          <ul className="space-y-2">
            {leagues.map((l) => {
              const active = selectedLeague?.league.id === l.league.id
              return (
                <li
                  key={l.league.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div>
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      {l.league.name}
                      {active && <Badge tone="accent">Active</Badge>}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {l.roles.map((r) => ROLE_LABEL[r]).join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!active && (
                      <Button variant="secondary" onClick={() => selectLeague(l.league.id)}>
                        Switch
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      aria-label={`Leave ${l.league.name}`}
                      onClick={() => {
                        setError(null)
                        setPendingLeave(l)
                      }}
                    >
                      Leave
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Card>
        <p className="mb-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Join another league with an invitation code, or create a league of your own.
        </p>
        <Link to="/join" className="text-sm font-semibold underline" style={{ color: 'var(--color-accent)' }}>
          Join or create a league
        </Link>
      </Card>

      {pendingLeave && (
        <Modal title={`Leave ${pendingLeave.league.name}?`} onClose={() => !busy && setPendingLeave(null)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            You&apos;ll lose access until you&apos;re re-invited.
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          )}
          <div className="mt-4 flex gap-2">
            <Button variant="danger" onClick={confirmLeave} disabled={busy}>
              {busy ? 'Leaving…' : 'Leave league'}
            </Button>
            <Button variant="secondary" onClick={() => setPendingLeave(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
