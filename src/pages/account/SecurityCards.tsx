import { useEffect, useState } from 'react'
import { listTotpFactors, unenrollFactor, type EnrolledFactor } from '@/services/mfa'
import { changePassword, requestPasswordChangeCode } from '@/services/account'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { MfaEnrollForm } from '@/components/MfaEnrollForm'
import { formatDate } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'

/** Two-factor devices. Required for every web sign-in, and enforced by the backend's aal2 RLS for any enrolled account. */
export function TwoFactorCard() {
  const [factors, setFactors] = useState<EnrolledFactor[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadFactors() {
    try {
      setFactors(await listTotpFactors())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your authenticator devices.')
    }
  }

  useEffect(() => {
    void loadFactors()
  }, [])

  async function handleRemove(factorId: string) {
    if (!confirm("Remove this authenticator device? You'll be asked to set up MFA again next time you sign in.")) return
    setError(null)
    try {
      await unenrollFactor(factorId)
      await loadFactors()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that device.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
      </CardHeader>
      <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Required for every VRC Ops web sign-in. With a verified authenticator on your account, the VRC backend also requires a
        two-factor session for your data — including from the iOS app.
      </p>
      {error && (
        <p role="alert" className="mb-3 text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
      {factors === null ? (
        <p className="text-sm">Loading…</p>
      ) : (
        <>
          {factors.length > 0 && (
            <ul className="mb-3 space-y-2">
              {factors.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-lg border p-2 text-sm"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <span>Authenticator app · added {formatDate(f.createdAt)}</span>
                  <Button variant="secondary" onClick={() => handleRemove(f.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {adding ? (
            <MfaEnrollForm
              onDone={() => {
                setAdding(false)
                void loadFactors()
              }}
            />
          ) : (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Add another device
            </Button>
          )}
        </>
      )}
    </Card>
  )
}

/** Authenticated password change: emailed verification code, then the new password (iOS `VRCChangePasswordView`). */
export function ChangePasswordCard() {
  const [step, setStep] = useState<'idle' | 'awaiting-code'>('idle')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function request() {
    setBusy(true)
    setError(null)
    try {
      await requestPasswordChangeCode()
      setStep('awaiting-code')
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not send a verification code. Check your connection and try again.'))
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await changePassword(password, confirmation, code)
      setDone(true)
      setStep('idle')
      setCode('')
      setPassword('')
      setConfirmation('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Change password</CardTitle>
      </CardHeader>
      {done && (
        <p role="status" className="mb-3 text-sm" style={{ color: 'var(--color-success)' }}>
          Your password was updated.
        </p>
      )}
      {step === 'idle' ? (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            We&apos;ll email you a verification code to confirm it&apos;s you, then you can set a new password.
          </p>
          <Button variant="secondary" onClick={request} disabled={busy}>
            {busy ? 'Sending…' : 'Email me a code'}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Verification code" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required />
          <Field label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." required />
          <Field label="Confirm new password" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !code.trim() || !password || !confirmation}>
              {busy ? 'Updating…' : 'Update password'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep('idle')} disabled={busy}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
    </Card>
  )
}
