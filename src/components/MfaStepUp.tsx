import { useEffect, useState } from 'react'
import { listTotpFactors, type EnrolledFactor } from '@/services/mfa'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'

/**
 * Fresh authenticator-code entry for actions that need a recent two-factor step-up (Global Rating participation,
 * champion Apple offer). The parent supplies `onConfirm(factorId, code)`, which performs the verify-then-act sequence
 * and returns an error message (or null on success). The code is cleared immediately after submit and never stored.
 */
export function MfaStepUp({
  actionLabel,
  destructive = false,
  busy,
  onConfirm,
}: {
  actionLabel: string
  destructive?: boolean
  busy: boolean
  onConfirm: (factorId: string, code: string) => Promise<string | null>
}) {
  const [factors, setFactors] = useState<EnrolledFactor[] | null>(null)
  const [factorId, setFactorId] = useState<string>('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    listTotpFactors()
      .then((list) => {
        setFactors(list)
        setFactorId(list[0]?.id ?? '')
      })
      .catch(() => setLoadError('Could not load your authenticator.'))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const entered = code
    setCode('')
    setError(null)
    setError(await onConfirm(factorId, entered))
  }

  if (loadError) {
    return (
      <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
        {loadError}
      </p>
    )
  }
  if (factors === null) return <p className="text-sm">Loading your authenticator…</p>
  if (factors.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--color-warning)' }}>
        No authenticator app found. Set one up under Account ▸ Two-factor authentication, then try again.
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {factors.length > 1 && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Authenticator</span>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            value={factorId}
            onChange={(e) => setFactorId(e.target.value)}
          >
            {factors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.friendlyName ?? 'Authenticator app'}
              </option>
            ))}
          </select>
        </label>
      )}
      <Field
        label="Verification code"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="6-digit code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        hint="From your authenticator app."
      />
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
      <Button type="submit" variant={destructive ? 'danger' : 'primary'} disabled={busy || !factorId || !code.trim()}>
        {busy ? 'Working…' : actionLabel}
      </Button>
    </form>
  )
}
