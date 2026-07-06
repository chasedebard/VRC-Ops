import { useState } from 'react'
import { createLeague } from '@/services/leagues'
import { acceptInvitationCode, acceptViewerCode } from '@/services/invitations'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

export default function LeagueSelectPage({ onDone }: { onDone?: () => void }) {
  const { refresh, selectLeague } = useLeagueSession()

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
      const leagueId = await createLeague(name, abbreviation)
      await refresh()
      selectLeague(leagueId)
      onDone?.()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create league.')
    } finally {
      setCreating(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setJoinError(null)
    setJoining(true)
    try {
      const trimmed = code.trim()
      const leagueId =
        trimmed.length === 6 ? await acceptViewerCode(trimmed) : await acceptInvitationCode(trimmed)
      await refresh()
      selectLeague(leagueId)
      onDone?.()
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'That code is invalid or expired.')
    } finally {
      setJoining(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-bold">Get started</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Create a league to run, or join one you've been invited to.
          </p>
        </div>

        <Card>
          <h2 className="mb-1 text-base font-semibold">Have an invite code?</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Didn't get the invite email, or the link in it isn't working? Enter your code here
            instead — it works exactly the same way.
          </p>
          <form onSubmit={handleJoin} className="space-y-3">
            <Field
              label="Invite or viewer code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              hint="A 6-digit code joins as a viewer; a longer invite code joins with the roles you were assigned."
            />
            {joinError && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{joinError}</p>}
            <Button type="submit" disabled={joining || !code.trim()} className="w-full">
              {joining ? 'Joining…' : 'Join league'}
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
          <form onSubmit={handleCreate} className="space-y-3">
            <Field label="League name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Field
              label="Abbreviation"
              placeholder="e.g. RFS"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
            />
            {createError && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{createError}</p>}
            <Button type="submit" disabled={creating || !name.trim()} className="w-full">
              {creating ? 'Creating…' : 'Create league'}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  )
}
