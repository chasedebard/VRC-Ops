import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { updateOwnProfile } from '@/services/profile'
import {
  deleteAccount,
  getBlockingLeagues,
  purgeLocalSessionData,
  reauthenticate,
  type BlockingLeague,
} from '@/services/account'
import { getLeagueMembers, transferLeagueOwnership } from '@/services/leagues'
import { listTotpFactors, unenrollFactor, type EnrolledFactor } from '@/services/mfa'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { MfaEnrollForm } from '@/components/MfaEnrollForm'
import { ROLE_LABEL } from '@/permissions/resolver'
import { formatDate } from '@/utils/format'

export default function AccountPage() {
  const { state, signOut } = useAuth()
  const { profile, selectedLeague, leagues, refresh } = useLeagueSession()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [savingProfile, setSavingProfile] = useState(false)

  const [factors, setFactors] = useState<EnrolledFactor[] | null>(null)
  const [addingFactor, setAddingFactor] = useState(false)
  const [mfaError, setMfaError] = useState<string | null>(null)

  async function loadFactors() {
    try {
      setFactors(await listTotpFactors())
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Could not load your authenticator devices.')
    }
  }

  useEffect(() => {
    loadFactors()
  }, [])

  async function handleRemoveFactor(factorId: string) {
    if (
      !confirm(
        "Remove this authenticator device? You'll be asked to set up MFA again next time you sign in.",
      )
    ) {
      return
    }
    setMfaError(null)
    try {
      await unenrollFactor(factorId)
      await loadFactors()
    } catch (err) {
      setMfaError(err instanceof Error ? err.message : 'Could not remove that device.')
    }
  }

  const [showDelete, setShowDelete] = useState(false)
  const [blockingLeagues, setBlockingLeagues] = useState<BlockingLeague[] | null>(null)
  const [password, setPassword] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '')
  }, [profile])

  if (state.kind !== 'authenticated') return null
  const user = state.user

  async function saveProfile() {
    if (state.kind !== 'authenticated') return
    setSavingProfile(true)
    try {
      await updateOwnProfile(state.user.id, { display_name: displayName })
      await refresh()
    } finally {
      setSavingProfile(false)
    }
  }

  async function startDeletion() {
    setShowDelete(true)
    setBlockingLeagues(await getBlockingLeagues())
  }

  async function transferAndRecheck(leagueId: string) {
    const members = await getLeagueMembers(leagueId)
    const candidate = members.find((m) => m.userId !== user.id && m.status === 'active')
    if (!candidate) return
    await transferLeagueOwnership(leagueId, candidate.userId)
    setBlockingLeagues(await getBlockingLeagues())
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
      <h1 className="text-2xl font-bold">Account</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <Field label="Email" value={user.email ?? ''} disabled />
          <Field
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? 'Saving…' : 'Save profile'}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leagues</CardTitle>
        </CardHeader>
        <ul className="space-y-1 text-sm">
          {leagues.map((l) => (
            <li key={l.league.id} className="flex items-center justify-between">
              <span>{l.league.name}</span>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {l.roles.map((r) => ROLE_LABEL[r]).join(', ')}
              </span>
            </li>
          ))}
        </ul>
        {selectedLeague == null && (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            You're not a member of any league yet.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Two-factor authentication</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Required for every VRC Ops web sign-in.
        </p>
        {mfaError && <p className="mb-3 text-sm" style={{ color: 'var(--color-danger)' }}>{mfaError}</p>}
        {factors === null ? (
          <p className="text-sm">Loading…</p>
        ) : (
          <>
            {factors.length > 0 && (
              <ul className="mb-3 space-y-2">
                {factors.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded-lg border p-2 text-sm"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <span>Authenticator app · added {formatDate(f.createdAt)}</span>
                    <Button variant="secondary" onClick={() => handleRemoveFactor(f.id)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {addingFactor ? (
              <MfaEnrollForm
                onDone={() => {
                  setAddingFactor(false)
                  loadFactors()
                }}
              />
            ) : (
              <Button variant="secondary" onClick={() => setAddingFactor(true)}>
                Add another device
              </Button>
            )}
          </>
        )}
      </Card>

      <Card style={{ borderColor: 'var(--color-danger)' }}>
        <CardHeader>
          <CardTitle style={{ color: 'var(--color-danger)' }}>Delete account</CardTitle>
        </CardHeader>
        {deleted ? (
          <p className="text-sm">Your account has been deleted.</p>
        ) : !showDelete ? (
          <div>
            <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              This permanently deletes your account. Championship history, published results, and
              standings you're not the sole owner of are preserved for the league.
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
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
              This cannot be undone. Confirm your password to continue.
            </p>
            <Field
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {deleteError && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{deleteError}</p>}
            <Button variant="danger" onClick={confirmDelete} disabled={deleting || !password}>
              {deleting ? 'Deleting…' : 'Permanently delete my account'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
