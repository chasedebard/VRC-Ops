import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useMfaGate } from '@/hooks/useMfaGate'
import { Layout } from '@/components/Layout'
import { ErrorState, LoadingState } from '@/components/States'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import ProfileSetupPage from '@/pages/onboarding/ProfileSetupPage'
import LegalAcceptancePage from '@/pages/onboarding/LegalAcceptancePage'
import LeagueSelectPage from '@/pages/onboarding/LeagueSelectPage'
import LeagueChooserPage from '@/pages/onboarding/LeagueChooserPage'
import LeagueSetupPendingPage from '@/pages/onboarding/LeagueSetupPendingPage'
import MfaEnrollPage from '@/pages/auth/MfaEnrollPage'
import MfaChallengePage from '@/pages/auth/MfaChallengePage'

/**
 * Mirrors RootView.swift / VRCLeagueStage.resolve: loading -> sign-in -> email verification ->
 * MFA (enforced on the web, and required by the backend's aal2 RLS for any account with a verified factor) ->
 * required legal (Terms + Privacy) -> profile completion -> league membership / selection ->
 * guided league setup (owner of a pending league) -> main shell.
 */
export function ProtectedLayout() {
  const { state, loading: authLoading, signOut } = useAuth()
  const {
    loading: sessionLoading,
    error: sessionError,
    profileCompleted,
    legalAccepted,
    leagues,
    selectedLeague,
    needsLeagueChoice,
    refresh: refreshSession,
  } = useLeagueSession()
  const { status: mfaStatus, factorId, refresh: refreshMfa } = useMfaGate()

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    )
  }

  if (state.kind === 'signedOut') return <Navigate to="/login" replace />

  if (state.kind === 'recoveringPassword') return <Navigate to="/reset-password/update" replace />

  if (state.kind === 'awaitingVerification') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-sm text-center">
          <h1 className="mb-2 text-xl font-bold">Verify your email</h1>
          <p className="mb-4 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Follow the link we sent to <strong>{state.email}</strong> to continue.
          </p>
          <Button variant="secondary" onClick={() => signOut()}>
            Sign out
          </Button>
        </Card>
      </div>
    )
  }

  if (mfaStatus === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    )
  }

  if (mfaStatus === 'unenrolled') return <MfaEnrollPage onDone={refreshMfa} />
  if (mfaStatus === 'needs-challenge' && factorId) {
    return <MfaChallengePage factorId={factorId} onDone={refreshMfa} />
  }

  if (sessionError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <h1 className="mb-2 text-center text-xl font-bold">Couldn’t load your account</h1>
          <p className="mb-4 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Your session is still signed in, but some account data could not be loaded.
          </p>
          <ErrorState message={sessionError} onRetry={() => void refreshSession()} />
          <div className="mt-4 text-center">
            <Button variant="secondary" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    )
  }

  // Required Terms/Privacy block normal access until accepted (AI/Sharing gate their own features only).
  if (!legalAccepted) return <LegalAcceptancePage />
  if (!profileCompleted) return <ProfileSetupPage />
  if (leagues.length === 0) return <LeagueSelectPage />
  if (needsLeagueChoice) return <LeagueChooserPage />
  if (selectedLeague?.league.setup_state === 'pending_setup' && selectedLeague.roles.includes('owner')) {
    return <LeagueSetupPendingPage membership={selectedLeague} />
  }

  return <Layout />
}
