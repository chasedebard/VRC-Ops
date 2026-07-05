import { useState } from 'react'
import { createLeague } from '@/services/leagues'
import { acceptInvitationCode, acceptViewerCode } from '@/services/invitations'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

export default function LeagueSelectPage({
  defaultTab = 'create',
  onDone,
}: {
  defaultTab?: 'create' | 'join'
  onDone?: () => void
}) {
  const { refresh, selectLeague } = useLeagueSession()
  const [tab, setTab] = useState<'create' | 'join'>(defaultTab)

  const [name, setName] = useState('')
  const [abbreviation, setAbbreviation] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const leagueId = await createLeague(name, abbreviation)
      await refresh()
      selectLeague(leagueId)
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create league.')
    } finally {
      setBusy(false)
    }
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const trimmed = code.trim()
      const leagueId =
        trimmed.length === 6 ? await acceptViewerCode(trimmed) : await acceptInvitationCode(trimmed)
      await refresh()
      selectLeague(leagueId)
      onDone?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code is invalid or expired.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">Get started</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Create a league to run, or join one you've been invited to.
        </p>
        <div className="mb-4 flex gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--color-border)' }}>
          <button
            className="flex-1 rounded-md py-1.5 text-sm font-medium"
            style={{
              backgroundColor: tab === 'create' ? 'var(--color-accent)' : 'transparent',
              color: tab === 'create' ? 'var(--color-accent-contrast)' : 'var(--color-text)',
            }}
            onClick={() => setTab('create')}
          >
            Create league
          </button>
          <button
            className="flex-1 rounded-md py-1.5 text-sm font-medium"
            style={{
              backgroundColor: tab === 'join' ? 'var(--color-accent)' : 'transparent',
              color: tab === 'join' ? 'var(--color-accent-contrast)' : 'var(--color-text)',
            }}
            onClick={() => setTab('join')}
          >
            Join with code
          </button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} className="space-y-3">
            <Field label="League name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Field
              label="Abbreviation"
              placeholder="e.g. RFS"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
            />
            {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
            <Button type="submit" disabled={busy || !name.trim()} className="w-full">
              {busy ? 'Creating…' : 'Create league'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleJoin} className="space-y-3">
            <Field
              label="Invite or viewer code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              hint="A 6-digit code joins as a viewer; a longer invite code joins with the roles you were assigned."
            />
            {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
            <Button type="submit" disabled={busy || !code.trim()} className="w-full">
              {busy ? 'Joining…' : 'Join league'}
            </Button>
          </form>
        )}
      </Card>
    </div>
  )
}
