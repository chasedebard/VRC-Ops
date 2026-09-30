import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { updateOwnProfile } from '@/services/profile'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

export default function ProfileSetupPage() {
  const { state, signOut } = useAuth()
  const { refresh, profile } = useLeagueSession()
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (state.kind !== 'authenticated') return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state.kind !== 'authenticated') return
    setError(null)
    setBusy(true)
    try {
      await updateOwnProfile(state.user.id, {
        display_name: displayName.trim(),
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
      })
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
          Tell your league who you are. Your display name is what other league members will see.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            label="Display name"
            required
            placeholder="How you appear in the league"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Field label="First name (optional)" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <Field label="Last name (optional)" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          {error && (
            <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
              {error}
            </p>
          )}
          <Button type="submit" disabled={busy || !displayName.trim()} className="w-full">
            {busy ? 'Saving…' : 'Save and continue'}
          </Button>
        </form>
        <Button variant="secondary" className="mt-3 w-full" onClick={() => signOut()}>
          Sign out
        </Button>
      </Card>
    </div>
  )
}
