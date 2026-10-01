import { useState } from 'react'
import { createLeague } from '@/services/leagues'
import { acceptInvitationCode } from '@/services/invitations'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useEntitlement } from '@/hooks/useEntitlement'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { APP_STORE_URL } from '@/config/links'
import {
  OWNED_LEAGUE_LIMIT_MESSAGE,
  PRO_OWNED_LEAGUE_LIMIT,
  canCreateAdditionalLeague,
  featureDefinition,
  isFeatureActive,
} from '@/config/featureRegistry'
import { backendErrorMessage } from '@/utils/backendErrors'

/**
 * Join a league with an invitation code, or create one. League creation is account-scoped: the first owned
 * league is free; additional leagues (up to the Pro ceiling) key off the user's OWN VRC Ops Pro subscription —
 * League Plus inherited from another league never unlocks it (mirrors `VRCLeagueCreationEntry`).
 */
export default function LeagueSelectPage({ onDone }: { onDone?: () => void }) {
  const { refresh, selectLeague, leagues } = useLeagueSession()
  const { state, signOut } = useAuth()
  const email = state.kind === 'authenticated' ? state.user.email ?? null : null
  const [rechecking, setRechecking] = useState(false)
  const { source } = useEntitlement()
  const hasIndividualPro = source === 'individual_pro'
  const ownedLeagueCount = leagues.filter((l) => l.roles.includes('owner')).length
  const canCreate = canCreateAdditionalLeague(ownedLeagueCount, hasIndividualPro)

  const [name, setName] = useState('')
  const [abbreviation, setAbbreviation] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [code, setCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError(null)
    setCreating(true)
    try {
      const leagueId = await createLeague(name.trim(), abbreviation.trim())
      await refresh()
      selectLeague(leagueId)
      onDone?.()
    } catch (err) {
      setCreateError(backendErrorMessage(err, 'Could not create league.'))
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setJoinError(null)
    setJoining(true)
    try {
      const leagueId = await acceptInvitationCode(code.trim())
      await refresh()
      selectLeague(leagueId)
      onDone?.()
    } catch (err) {
      setJoinError(backendErrorMessage(err, 'That code is invalid or expired.'))
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-bold">{leagues.length === 0 ? 'Get started' : 'Join or create a league'}</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Join a league with an invitation code, or create your own.
          </p>
        </div>

        {leagues.length === 0 && (
          <Card>
            <h2 className="mb-1 text-base font-semibold">Already in a league?</h2>
            <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {email ? (
                <>
                  You&apos;re signed in as <strong>{email}</strong>, and this account isn&apos;t a member of a league yet. If your league is under a different
                  account, sign out and sign in with that one.
                </>
              ) : (
                'This account isn’t a member of a league yet.'
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                disabled={rechecking}
                onClick={async () => {
                  setRechecking(true)
                  try {
                    await refresh()
                  } finally {
                    setRechecking(false)
                  }
                }}
              >
                {rechecking ? 'Checking…' : 'Check again'}
              </Button>
              <Button variant="ghost" onClick={() => signOut()}>
                Sign out
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="mb-1 text-base font-semibold">Have an invite code?</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Didn&apos;t get the invite email, or the link in it isn&apos;t working? Enter your code here instead — it works
            exactly the same way. Sent to you by an Owner or Admin.
          </p>
          <form onSubmit={handleJoin} className="space-y-3">
            <Field label="Invitation code" required value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            {joinError && (
              <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
                {joinError}
              </p>
            )}
            <Button type="submit" disabled={joining || !code.trim()} className="w-full">
              {joining ? 'Joining…' : 'Accept invitation'}
            </Button>
          </form>
        </Card>

        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-border)' }} />
          or
          <div className="h-px flex-1" style={{ backgroundColor: 'var(--color-border)' }} />
        </div>

        <Card>
          <h2 className="mb-3 text-base font-semibold">Start a new league</h2>
          {canCreate ? (
            <form onSubmit={handleCreate} className="space-y-3">
              <Field label="League name" required value={name} onChange={(e) => setName(e.target.value)} />
              <Field
                label="Abbreviation (optional)"
                placeholder="e.g. RFS"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value)}
              />
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                You become the Owner. Next you&apos;ll set up your first championship and season.
              </p>
              {createError && (
                <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
                  {createError}
                </p>
              )}
              <Button type="submit" disabled={creating || !name.trim()} className="w-full">
                {creating ? 'Creating…' : 'Create league'}
              </Button>
            </form>
          ) : hasIndividualPro ? (
            <div className="space-y-2 text-sm">
              <p className="font-medium">{OWNED_LEAGUE_LIMIT_MESSAGE}</p>
              <p style={{ color: 'var(--color-text-muted)' }}>
                To start another league, transfer or leave one you own first.
              </p>
            </div>
          ) : isFeatureActive('multipleLeagues') ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <p className="font-medium">Create another league</p>
                <Badge tone="warning">PRO</Badge>
              </div>
              <p style={{ color: 'var(--color-text-muted)' }}>
                {featureDefinition('multipleLeagues').message} Own up to {PRO_OWNED_LEAGUE_LIMIT} leagues with VRC Ops
                Pro. Subscriptions are purchased in the iPhone and iPad app; your access appears here automatically.
              </p>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block font-semibold underline"
                style={{ color: 'var(--color-accent)' }}
              >
                Open the App Store
              </a>
            </div>
          ) : (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Creating another league is coming soon.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
