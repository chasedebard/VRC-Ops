import { useCallback, useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { useAuth } from '@/hooks/useAuth'
import { deleteAccount, getBlockingLeagues, purgeLocalSessionData, reauthenticate, type BlockingLeague } from '@/services/account'
import { transferLeagueOwnership } from '@/services/leagues'
import { getLeagueMemberAccounts, type MemberAccount } from '@/services/driverProfileData'
import { backendErrorMessage, functionErrorMessage } from '@/utils/backendErrors'

export const DELETE_CONFIRMATION_PHRASE = 'DELETE'

const REMOVED_ITEMS = [
  'Your sign-in and account access',
  'Your account profile and email',
  'Uploaded profile and driver photos',
  'Empty account-only league containers (never championships or race history)',
  'Your memberships, roles, and personal settings',
  'Saved session data in this browser',
]

type Stage = 'idle' | 'checking' | 'blocked' | 'reauthenticate' | 'confirm' | 'deleting' | 'completed'

/**
 * Delete account (iOS `VRCDeleteAccountView`): check ownership first, make the Owner CHOOSE who receives each shared league (never auto-picked),
 * re-enter the password, then type DELETE. The destructive work runs in the trusted `process-account-deletion` Edge Function, which removes
 * Storage and the Auth identity with a server-side credential that never exists in the browser. Shared-league race history is preserved.
 */
export function DeleteAccountCard() {
  const { state, signOut } = useAuth()
  const [stage, setStage] = useState<Stage>('idle')
  const [blocking, setBlocking] = useState<BlockingLeague[]>([])
  const [candidates, setCandidates] = useState<Record<string, MemberAccount[]>>({})
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const [transferring, setTransferring] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [phrase, setPhrase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const userId = state.kind === 'authenticated' ? state.user.id : null
  const email = state.kind === 'authenticated' ? state.user.email ?? '' : ''

  const check = useCallback(async () => {
    setStage('checking')
    setError(null)
    try {
      const leagues = await getBlockingLeagues()
      if (leagues.length === 0) {
        setBlocking([])
        setStage('reauthenticate')
        return
      }
      setBlocking(leagues)
      const entries = await Promise.all(
        leagues.map(async (l) => [l.leagueId, (await getLeagueMemberAccounts(l.leagueId).catch(() => [])).filter((m) => m.user_id !== userId)] as const),
      )
      setCandidates(Object.fromEntries(entries))
      setStage('blocked')
    } catch (err) {
      // Don't trap the user on a transient error — the deletion function re-checks ownership itself.
      setError(backendErrorMessage(err, 'Could not check your leagues.'))
      setStage('reauthenticate')
    }
  }, [userId])

  useEffect(() => {
    if (stage === 'idle') return
  }, [stage])

  async function transfer(leagueId: string) {
    const newOwner = chosen[leagueId]
    if (!newOwner) {
      setError('Choose a member to receive this league first.')
      return
    }
    setError(null)
    setTransferring(leagueId)
    try {
      await transferLeagueOwnership(leagueId, newOwner)
      await check()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not transfer ownership.'))
    } finally {
      setTransferring(null)
    }
  }

  async function confirmPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!password) {
      setError('Enter your password to continue.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await reauthenticate(email, password)
      setPassword('')
      setStage('confirm')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify your password.')
    } finally {
      setBusy(false)
    }
  }

  async function performDeletion() {
    if (phrase.trim() !== DELETE_CONFIRMATION_PHRASE) {
      setError(`Type ${DELETE_CONFIRMATION_PHRASE} to confirm.`)
      return
    }
    setError(null)
    setStage('deleting')
    try {
      await deleteAccount()
    } catch (err) {
      const message = await functionErrorMessage(err, 'Could not delete your account.')
      if (/OWNER_TRANSFER_REQUIRED/.test(String((err as { message?: string })?.message ?? '')) || /transfer/i.test(message)) {
        await check()
      } else {
        setError(message)
        setStage('confirm')
      }
      return
    }
    purgeLocalSessionData()
    setStage('completed')
    await signOut()
  }

  const explainer = (
    <div className="space-y-1 text-sm">
      <ul className="space-y-0.5" style={{ color: 'var(--color-text-muted)' }}>
        {REMOVED_ITEMS.map((item) => (
          <li key={item}>− {item}</li>
        ))}
      </ul>
      <p className="pt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Shared league race history is preserved. Your account link and private photos are removed; historical driver names and results remain so standings and career history are not corrupted.
      </p>
    </div>
  )

  return (
    <Card id="delete-account" style={{ borderColor: 'var(--color-danger)' }}>
      <CardHeader>
        <CardTitle style={{ color: 'var(--color-danger)' }}>Delete account</CardTitle>
      </CardHeader>

      {stage === 'idle' && (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            This permanently deletes your account. Championship history, published results and standings are kept for the leagues you were part of.
          </p>
          <Button variant="danger" onClick={check}>
            Delete my account
          </Button>
        </div>
      )}

      {stage === 'checking' && <p className="text-sm">Checking your account…</p>}

      {stage === 'blocked' && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold">Resolve owned championships first</p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Transfer each league to another member, or explicitly delete its championships. Account deletion never removes championship history automatically.
            </p>
          </div>
          {blocking.map((league) => {
            const list = candidates[league.leagueId] ?? []
            return (
              <div key={league.leagueId} className="space-y-2 rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
                <p className="flex items-center justify-between text-sm">
                  <span className="font-medium">{league.leagueName}</span>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {league.otherMemberCount} other member{league.otherMemberCount === 1 ? '' : 's'}
                  </span>
                </p>
                {list.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {league.otherMemberCount === 0
                      ? "No other member can receive ownership. Explicitly delete this league's championships, then re-check."
                      : 'No eligible active member can receive ownership. Resolve the membership or delete the championships, then re-check.'}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block text-sm">
                      <span className="mb-1 block text-xs" style={{ color: 'var(--color-text-muted)' }}>New owner</span>
                      <select
                        value={chosen[league.leagueId] ?? ''}
                        onChange={(e) => setChosen((c) => ({ ...c, [league.leagueId]: e.target.value }))}
                        className="rounded-lg border bg-transparent px-2 py-2 text-sm"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        <option value="">Choose new owner…</option>
                        {list.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.display_name || m.email || `Member ${m.user_id.slice(0, 8)}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button variant="secondary" onClick={() => transfer(league.leagueId)} disabled={!chosen[league.leagueId] || transferring !== null}>
                      {transferring === league.leagueId ? 'Transferring…' : 'Transfer & continue'}
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
          <Button variant="secondary" onClick={check}>
            Re-check
          </Button>
        </div>
      )}

      {stage === 'reauthenticate' && (
        <form onSubmit={confirmPassword} className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Confirm it&apos;s you</p>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>For your security, re-enter your password before deleting your account.</p>
          </div>
          {explainer}
          <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Button type="submit" disabled={busy || !password}>
            {busy ? 'Verifying…' : 'Continue'}
          </Button>
        </form>
      )}

      {(stage === 'confirm' || stage === 'deleting') && (
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold">This is permanent</p>
            <p className="text-sm" style={{ color: 'var(--color-danger)' }}>Deleting your account cannot be undone.</p>
          </div>
          {explainer}
          <Field
            label="Confirmation"
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={DELETE_CONFIRMATION_PHRASE}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            hint={`Type ${DELETE_CONFIRMATION_PHRASE} in capital letters to enable account deletion.`}
            disabled={stage === 'deleting'}
          />
          <Button variant="danger" onClick={performDeletion} disabled={phrase.trim() !== DELETE_CONFIRMATION_PHRASE || stage === 'deleting'}>
            {stage === 'deleting' ? 'Deleting your account…' : 'Delete my account'}
          </Button>
        </div>
      )}

      {stage === 'completed' && <p className="text-sm">Your account has been deleted.</p>}

      {error && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
    </Card>
  )
}
