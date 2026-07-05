import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { handleAuthCallback } from '@/services/auth'
import { useAuth } from '@/hooks/useAuth'
import { LoadingState, ErrorState } from '@/components/States'

export default function AuthCallbackPage() {
  const { refresh } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    handleAuthCallback(window.location.href)
      .then(async (state) => {
        await refresh()
        navigate(state.kind === 'recoveringPassword' ? '/reset-password/update' : '/dashboard', {
          replace: true,
        })
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Verification link failed.'))
  }, [refresh, navigate])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <ErrorState message={error} />
      </div>
    )
  }
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingState label="Confirming your sign-in…" />
    </div>
  )
}
