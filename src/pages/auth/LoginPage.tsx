import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signIn } from '@/services/auth'
import { useAuth } from '@/hooks/useAuth'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'

export default function LoginPage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
      await refresh()
      navigate('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">Sign in to VRC Ops</h1>
        <p className="mb-5 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          League management and race control for sim racing.
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
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <div className="mt-4 flex justify-between text-sm">
          <Link to="/reset-password" className="underline" style={{ color: 'var(--color-text-muted)' }}>
            Forgot password?
          </Link>
          <Link to="/signup" className="underline" style={{ color: 'var(--color-accent)' }}>
            Create account
          </Link>
        </div>
      </Card>
    </div>
  )
}
