import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { acceptInvitationToken } from '@/services/invitations'
import {
  authPathWithRedirect,
  clearPendingInviteToken,
  setPendingInviteToken,
} from '@/services/authRedirects'
import { getMyLeagues } from '@/services/leagues'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { APP_STORE_URL } from '@/config/links'
import { describeInviteError, type InviteFailure } from '@/utils/inviteErrors'
import { LoadingState } from '@/components/States'

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
  const [failure, setFailure] = useState<InviteFailure | null>(null)
  const userId = state.kind === 'authenticated' ? state.user.id : null
  const invitePath = token ? `/invite/${encodeURIComponent(token)}` : null
  // The same link, for an iPhone or iPad that has the app but opened this page in the browser instead.
  const openInAppURL = token ? `vrc://invite/accept?token=${encodeURIComponent(token)}` : null

  useEffect(() => {
    if (!token) return

    if (!userId) {
      setPendingInviteToken(token)
      return
    }

    let cancelled = false
    acceptInvitationToken(token)
      .then(async (leagueId) => {
        if (cancelled) return
        clearPendingInviteToken()
        await refresh()
        const leagues = await getMyLeagues(userId)
        const league = leagues.find((l) => l.league.id === leagueId)
        selectLeague(leagueId)
        setLeagueName(league?.league.name ?? null)
        setStatus('success')
      })
      .catch((err) => {
        if (cancelled) return
        setFailure(describeInviteError(err))
        setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [token, userId, refresh, selectLeague])

  if (state.kind !== 'authenticated') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm text-center">
          <h1 className="mb-2 text-xl font-bold">Sign in to accept your invite</h1>
          <p className="mb-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            We'll finish joining the league as soon as you sign in or create an account.
          </p>
          <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Use the email address this invite was sent to. The invite only works for that address.
          </p>
          <div className="flex justify-center gap-2">
            <Link to={authPathWithRedirect('/login', invitePath)}>
              <Button>Sign in</Button>
            </Link>
            <Link to={authPathWithRedirect('/signup', invitePath)}>
              <Button variant="secondary">Create account</Button>
            </Link>
          </div>
          <div className="mt-6 border-t pt-4 text-sm" style={{ borderColor: 'var(--color-border)' }}>
            <p className="mb-2 font-semibold">Prefer the iPhone or iPad app?</p>
            <p className="mb-3" style={{ color: 'var(--color-text-muted)' }}>
              Get VRC Ops from the App Store, create your account with the same address, then open this invite link again.
            </p>
            <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
              <a href={APP_STORE_URL} className="underline" style={{ color: 'var(--color-accent)' }}>
                Get VRC Ops on the App Store
              </a>
              {openInAppURL && (
                <a href={openInAppURL} className="underline" style={{ color: 'var(--color-accent)' }}>
                  Already installed? Open in the app
                </a>
              )}
            </div>
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
            <p className="mb-2 text-sm" style={{ color: 'var(--color-danger)' }}>{failure?.message}</p>
            <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>{failure?.advice}</p>
            <Link to="/join" className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
              Enter an invite code instead
            </Link>
          </>
        )}
      </Card>
    </div>
  )
}
