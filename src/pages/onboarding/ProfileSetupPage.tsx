import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { updateOwnProfile } from '@/services/profile'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

export default function ProfileSetupPage() {
  const { state } = useAuth()
  const { refresh } = useLeagueSession()
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (state.kind !== 'authenticated') return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state.kind !== 'authenticated') return
    setError(null)
    setBusy(true)
    try {
      await updateOwnProfile(state.user.id, { display_name: displayName })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save profile.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">Complete your profile</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          This name is what other league members will see.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            label="Display name"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <Button type="submit" disabled={busy || !displayName.trim()} className="w-full">
            {busy ? 'Saving…' : 'Continue'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
