import { useEffect, useState } from 'react'
import { beginEnrollment, confirmEnrollment } from '@/services/mfa'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { LoadingState } from '@/components/States'

/** Shared TOTP enrollment UI — used both by the mandatory gate (MfaEnrollPage)
 *  and by the "add another device" flow on the account settings page. */
export function MfaEnrollForm({ onDone }: { onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qrCodeSvg, setQrCodeSvg] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    beginEnrollment()
      .then((challenge) => {
        setFactorId(challenge.factorId)
        setQrCodeSvg(challenge.qrCodeSvg)
        setSecret(challenge.secret)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not start MFA setup.'))
  }, [])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId) return
    setBusy(true)
    setError(null)
    try {
      await confirmEnrollment(factorId, code)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code did not verify. Try again.')
    } finally {
      setBusy(false)
    }
  }

  if (!qrCodeSvg) return <LoadingState label="Preparing your authenticator code…" />

  return (
    <form onSubmit={handleVerify} className="space-y-3">
      {/* qr_code is a full data: URI (image/svg+xml) — it's an <img> src, not raw HTML to inject. */}
      <div className="mx-auto flex w-full max-w-[220px] items-center justify-center rounded-lg bg-white p-3">
        <img src={qrCodeSvg} alt="Scan this QR code with your authenticator app" className="h-full w-full" />
      </div>
      {secret && (
        <p className="text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Can't scan it? Enter this key manually: <span className="font-mono">{secret}</span>
        </p>
      )}
      <Field
        label="6-digit code"
        required
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
      />
      {error && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
        {busy ? 'Verifying…' : 'Verify and continue'}
      </Button>
    </form>
  )
}
