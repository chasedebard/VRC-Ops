import { useState } from 'react'
import { verifyChallenge } from '@/services/mfa'
import { useAuth } from '@/hooks/useAuth'
import { Card } from '@/components/Card'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'

/** Returning sign-in with an already-enrolled factor — step up to aal2 for this session. */
export default function MfaChallengePage({
  factorId,
  onDone,
}: {
  factorId: string
  onDone: () => void
}) {
  const { signOut } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await verifyChallenge(factorId, code)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not verify. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">Enter your authenticator code</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Open your authenticator app and enter the current 6-digit code.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            label="6-digit code"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
            {busy ? 'Verifying…' : 'Verify'}
          </Button>
        </form>
        <button
          onClick={() => signOut()}
          className="mt-4 text-sm underline"
          style={{ color: 'var(--color-text-muted)' }}
        >
          Sign out
        </button>
      </Card>
    </div>
  )
}
