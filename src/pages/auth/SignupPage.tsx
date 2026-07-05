import { useState } from 'react'
import { Link } from 'react-router-dom'
import { createAccount } from '@/services/auth'
import { useAuth } from '@/hooks/useAuth'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

export default function SignupPage() {
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [awaitingVerification, setAwaitingVerification] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await createAccount(email, password, confirmation)
      if (result.kind === 'awaitingVerification') {
        setAwaitingVerification(true)
      } else {
        await refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account.')
    } finally {
      setBusy(false)
    }
  }

  if (awaitingVerification) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm text-center">
          <h1 className="mb-2 text-xl font-bold">Check your email</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            We sent a verification link to <strong>{email}</strong>. Follow it to finish creating
            your account, then come back and sign in.
          </p>
          <Link to="/login" className="mt-4 inline-block text-sm underline" style={{ color: 'var(--color-accent)' }}>
            Back to sign in
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">Create your account</h1>
        <p className="mb-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Join or start a sim-racing league on VRC Ops.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            hint="At least 8 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
        <div className="mt-4 text-sm">
          <Link to="/login" className="underline" style={{ color: 'var(--color-text-muted)' }}>
            Already have an account? Sign in
          </Link>
        </div>
      </Card>
    </div>
  )
}
