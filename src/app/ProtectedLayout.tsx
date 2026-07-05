import { Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Layout } from '@/components/Layout'
import { LoadingState } from '@/components/States'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import ProfileSetupPage from '@/pages/onboarding/ProfileSetupPage'
import LegalAcceptancePage from '@/pages/onboarding/LegalAcceptancePage'
import LeagueSelectPage from '@/pages/onboarding/LeagueSelectPage'

/**
 * Mirrors RootView.swift's gate: loading -> sign-in -> email verification ->
 * profile completion -> legal acceptance -> league selection -> main shell.
 */
export function ProtectedLayout() {
  const { state, loading: authLoading, signOut } = useAuth()
  const { loading: sessionLoading, profileCompleted, legalAccepted, leagues } = useLeagueSession()

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

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    )
  }

  if (!profileCompleted) return <ProfileSetupPage />
  if (!legalAccepted) return <LegalAcceptancePage />
  if (leagues.length === 0) return <LeagueSelectPage />

  return <Layout />
}
