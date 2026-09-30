import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { ChampionshipSetupFlow } from '@/components/ChampionshipSetupFlow'
import { completeLeagueSetup, deletePendingLeague } from '@/services/setup'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { MyLeagueMembership } from '@/services/leagues'

/**
 * Shown when the signed-in OWNER has a league whose guided championship + first-season setup was never
 * completed (`leagues.setup_state = 'pending_setup'`). The state lives on the league row, so an interrupted setup
 * resumes identically on the next visit. Only the owner is gated; other members of a pending league just see the
 * normal "no championship yet" empty states. Mirrors iOS `VRCLeagueSetupPendingView`.
 */
export default function LeagueSetupPendingPage({ membership }: { membership: MyLeagueMembership }) {
  const { signOut } = useAuth()
  const { leagues, refresh, clearLeagueSelection, selectLeague } = useLeagueSession()
  const [showFlow, setShowFlow] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const otherLeague = leagues.find((l) => l.league.id !== membership.league.id)

  async function handleCreated() {
    setBusy(true)
    setError(null)
    try {
      await completeLeagueSetup(membership.league.id)
      await refresh()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not finish league setup.'))
      setShowFlow(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    setError(null)
    try {
      await deletePendingLeague(membership.league.id)
      clearLeagueSelection()
      await refresh()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not delete this league.'))
    } finally {
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  function handleSwitch() {
    if (otherLeague) selectLeague(otherLeague.league.id)
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 px-4 py-8">
      <div>
        <h1 className="text-xl font-bold">Finish setting up {membership.league.name}</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Create a championship and first season to start using this league.
        </p>
      </div>

      {showFlow ? (
        <ChampionshipSetupFlow
          leagueId={membership.league.id}
          onCreated={() => void handleCreated()}
          onCancel={() => setShowFlow(false)}
        />
      ) : (
        <Card>
          <h2 className="text-base font-semibold">Championship &amp; season</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Required before the league dashboard is available.
          </p>
          <Button onClick={() => setShowFlow(true)} disabled={busy}>
            Continue setup
          </Button>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      <Card>
        <h2 className="mb-2 text-base font-semibold">Not ready for this league?</h2>
        <div className="flex flex-wrap gap-2">
          {otherLeague && (
            <Button variant="secondary" onClick={handleSwitch} disabled={busy}>
              Switch to another league
            </Button>
          )}
          {confirmDelete ? (
            <>
              <p className="w-full text-sm">
                {membership.league.name} has no championship or season yet, so nothing will be lost. This cannot be undone.
              </p>
              <Button variant="danger" onClick={handleDelete} disabled={busy}>
                {busy ? 'Deleting…' : 'Delete league'}
              </Button>
              <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Delete this league
            </Button>
          )}
        </div>
      </Card>

      <Button variant="secondary" onClick={() => signOut()}>
        Sign out
      </Button>
    </div>
  )
}
