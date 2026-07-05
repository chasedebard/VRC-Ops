import { Card } from '@/components/Card'
import { MfaEnrollForm } from '@/components/MfaEnrollForm'

/**
 * Mandatory first-time TOTP setup — every web sign-in requires MFA, so this
 * screen is unskippable when no verified factor exists yet (see
 * ProtectedLayout / useMfaGate).
 */
export default function MfaEnrollPage({ onDone }: { onDone: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-sm">
        <h1 className="mb-1 text-xl font-bold">Set up two-factor authentication</h1>
        <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          VRC Ops requires an authenticator app (like Google Authenticator, Authy, or 1Password)
          for every web sign-in.
        </p>
        <MfaEnrollForm onDone={onDone} />
      </Card>
    </div>
  )
}
