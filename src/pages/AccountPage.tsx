import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import {
  deleteAccount,
  getBlockingLeagues,
  purgeLocalSessionData,
  reauthenticate,
  type BlockingLeague,
} from '@/services/account'
import { getLeagueMembers, transferLeagueOwnership } from '@/services/leagues'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { SubscriptionStatusCard } from '@/components/SubscriptionStatusCard'
import { ProfileCard } from '@/pages/account/ProfileCard'
import { ChangePasswordCard, TwoFactorCard } from '@/pages/account/SecurityCards'
import { ROLE_LABEL } from '@/permissions/resolver'
import { backendErrorMessage } from '@/utils/backendErrors'

function NavRow({ to, title, subtitle }: { to: string; title: string; subtitle: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 rounded-lg border p-3 transition hover:shadow-sm"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {subtitle}
        </span>
      </span>
      <span aria-hidden>›</span>
    </Link>
  )
}

/** Settings hub (iOS Settings ▸ Account / Appearance / Context / About). */
export default function AccountPage() {
  const { state, signOut } = useAuth()
  const { selectedLeague, leagues } = useLeagueSession()
  const location = useLocation()

  const [showDelete, setShowDelete] = useState(false)
  const [blockingLeagues, setBlockingLeagues] = useState<BlockingLeague[] | null>(null)
  const [password, setPassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  // Deep link from Legal & privacy ▸ Delete account.
  useEffect(() => {
    if (location.hash === '#delete-account') {
      document.getElementById('delete-account')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location.hash])

  if (state.kind !== 'authenticated') return null
  const user = state.user

  async function startDeletion() {
    setShowDelete(true)
    try {
      setBlockingLeagues(await getBlockingLeagues())
    } catch (err) {
      setDeleteError(backendErrorMessage(err, 'Could not check your leagues.'))
    }
  }

  async function transferAndRecheck(leagueId: string) {
    setDeleteError(null)
    try {
      const members = await getLeagueMembers(leagueId)
      const candidate = members.find((m) => m.userId !== user.id && m.status === 'active')
      if (!candidate) {
        setDeleteError('No other active member to transfer ownership to.')
        return
      }
      await transferLeagueOwnership(leagueId, candidate.userId)
      setBlockingLeagues(await getBlockingLeagues())
    } catch (err) {
      setDeleteError(backendErrorMessage(err, 'Could not transfer ownership.'))
    }
  }

  async function confirmDelete() {
    setDeleteError(null)
    setDeleting(true)
    try {
      await reauthenticate(user.email ?? '', password)
      await deleteAccount()
      purgeLocalSessionData()
      setDeleted(true)
      await signOut()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete account.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <ProfileCard />

      <Card>
        <CardHeader>
          <CardTitle>Leagues</CardTitle>
        </CardHeader>
        <ul className="mb-3 space-y-1 text-sm">
          {leagues.map((l) => (
            <li key={l.league.id} className="flex items-center justify-between">
              <span>
                {l.league.name}
                {selectedLeague?.league.id === l.league.id && (
                  <span className="ml-2 text-xs" style={{ color: 'var(--color-accent)' }}>
                    Active
                  </span>
                )}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>{l.roles.map((r) => ROLE_LABEL[r]).join(', ')}</span>
            </li>
          ))}
        </ul>
        <NavRow to="/account/leagues" title="Switch, join or leave leagues" subtitle="Your leagues, active league, join or leave" />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <SubscriptionStatusCard />
        <div className="mt-3">
          <NavRow to="/account/subscription" title="Subscription details" subtitle="Status, billing, and premium benefits" />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Global Rating</CardTitle>
        </CardHeader>
        <NavRow to="/account/global-rating" title="Global Rating" subtitle="Private cross-league rating participation" />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Legal &amp; privacy</CardTitle>
        </CardHeader>
        <NavRow to="/account/legal" title="Legal & privacy" subtitle="Terms, privacy policy, consent, and account deletion" />
      </Card>

      <TwoFactorCard />
      <ChangePasswordCard />

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          VRC Ops — league management and race control for sim racing. The website talks to the same Supabase backend as the
          iPhone, iPad and Mac apps; native-only features (live GT7 telemetry capture, photo results import) stay in the apps.
        </p>
        <p className="mt-2 text-sm">
          <Link to="/legal" className="font-semibold underline" style={{ color: 'var(--color-accent)' }}>
            Terms, privacy &amp; support
          </Link>
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => signOut()}>
          Sign out
        </Button>
      </Card>

      <Card id="delete-account" style={{ borderColor: 'var(--color-danger)' }}>
        <CardHeader>
          <CardTitle style={{ color: 'var(--color-danger)' }}>Delete account</CardTitle>
        </CardHeader>
        {deleted ? (
          <p className="text-sm">Your account has been deleted.</p>
        ) : !showDelete ? (
          <div>
            <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              This permanently deletes your account. Championship history, published results, and standings you&apos;re not the
              sole owner of are preserved for the league.
            </p>
            <Button variant="danger" onClick={startDeletion}>
              Delete my account
            </Button>
          </div>
        ) : blockingLeagues === null ? (
          <p className="text-sm">Checking your leagues…</p>
        ) : blockingLeagues.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              You own leagues with other members. Transfer ownership before deleting your account.
            </p>
            {blockingLeagues.map((bl) => (
              <div
                key={bl.leagueId}
                className="flex items-center justify-between rounded-lg border p-2 text-sm"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <span>
                  {bl.leagueName} · {bl.otherMemberCount} other member(s)
                </span>
                <Button variant="secondary" onClick={() => transferAndRecheck(bl.leagueId)}>
                  Transfer ownership
                </Button>
              </div>
            ))}
            {deleteError && (
              <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
                {deleteError}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
              This cannot be undone. Confirm your password to continue.
            </p>
            <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {deleteError && (
              <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
                {deleteError}
              </p>
            )}
            <Button variant="danger" onClick={confirmDelete} disabled={deleting || !password}>
              {deleting ? 'Deleting…' : 'Permanently delete my account'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
