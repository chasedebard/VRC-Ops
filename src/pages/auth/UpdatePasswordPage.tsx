import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { updateRecoveredPassword } from '@/services/auth'
import { useAuth } from '@/hooks/useAuth'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

export default function UpdatePasswordPage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await updateRecoveredPassword(password, confirmation)
      await refresh()
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">Choose a new password</h1>
        <form onSubmit={handleSubmit} className="mt-3 space-y-3">
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
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
            {busy ? 'Updating…' : 'Update password'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
