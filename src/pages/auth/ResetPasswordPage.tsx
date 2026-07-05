import { useState } from 'react'
import { Link } from 'react-router-dom'
import { sendPasswordRecovery } from '@/services/auth'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await sendPasswordRecovery(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send reset email.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">Reset your password</h1>
        {sent ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            If an account exists for <strong>{email}</strong>, a reset link is on its way.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="mb-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              We'll email you a link to choose a new password.
            </p>
            <Field
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? 'Sending…' : 'Send reset link'}
            </Button>
          </form>
        )}
        <Link to="/login" className="mt-4 inline-block text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
          Back to sign in
        </Link>
      </Card>
    </div>
  )
}
