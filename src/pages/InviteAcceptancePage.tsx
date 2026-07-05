import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { acceptInvitationToken } from '@/services/invitations'
import { getMyLeagues } from '@/services/leagues'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { LoadingState } from '@/components/States'

const PENDING_INVITE_KEY = 'vrc-pending-invite-token'

/**
 * HTTPS invite link target: https://vrc-ops.org/invite/:token, matching what
 * the send-league-invite edge function builds. Token is single-use and
 * consumed via vrc_accept_invitation_by_token. If the user isn't signed in
 * yet, the token is stashed and acceptance resumes after login (mirrors
 * VRCPendingInviteStore).
 */
export default function InviteAcceptancePage() {
  const { token } = useParams<{ token: string }>()
  const { state } = useAuth()
  const { refresh, selectLeague } = useLeagueSession()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'pending' | 'success' | 'error'>('pending')
  const [leagueName, setLeagueName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return

    if (state.kind !== 'authenticated') {
      window.localStorage.setItem(PENDING_INVITE_KEY, token)
      return
    }

    let cancelled = false
    acceptInvitationToken(token)
      .then(async (leagueId) => {
        if (cancelled) return
        window.localStorage.removeItem(PENDING_INVITE_KEY)
        await refresh()
        const leagues = await getMyLeagues()
        const league = leagues.find((l) => l.league.id === leagueId)
        selectLeague(leagueId)
        setLeagueName(league?.league.name ?? null)
        setStatus('success')
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'This invite link is invalid or expired.')
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [token, state.kind, refresh, selectLeague])

  if (state.kind !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm text-center">
          <h1 className="mb-2 text-xl font-bold">Sign in to accept your invite</h1>
          <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            We'll finish joining the league as soon as you sign in or create an account.
          </p>
          <div className="flex justify-center gap-2">
            <Link to="/login">
              <Button>Sign in</Button>
            </Link>
            <Link to="/signup">
              <Button variant="secondary">Create account</Button>
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm text-center">
        {status === 'pending' && <LoadingState label="Accepting your invite…" />}
        {status === 'success' && (
          <>
            <h1 className="mb-2 text-xl font-bold">Welcome{leagueName ? ` to ${leagueName}` : ''}!</h1>
            <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Your invite has been accepted.
            </p>
            <Button onClick={() => navigate('/dashboard')}>Go to dashboard</Button>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="mb-2 text-xl font-bold">Invite not accepted</h1>
            <p className="mb-4 text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
            <Link to="/join" className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
              Enter a code manually instead
            </Link>
          </>
        )}
      </Card>
    </div>
  )
}
