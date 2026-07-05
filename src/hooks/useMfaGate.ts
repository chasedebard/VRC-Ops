import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getAssuranceLevel, listTotpFactors } from '@/services/mfa'

export type MfaGateStatus = 'loading' | 'unenrolled' | 'needs-challenge' | 'satisfied'

/**
 * Drives the mandatory web-only MFA gate in ProtectedLayout. `unenrolled`
 * means the account has no verified TOTP factor yet (must set one up before
 * continuing); `needs-challenge` means a factor exists but this session
 * hasn't stepped up to aal2 yet (returning sign-in); `satisfied` means
 * either isn't required or has already been completed this session.
 */
export function useMfaGate() {
  const { state } = useAuth()
  const [status, setStatus] = useState<MfaGateStatus>('loading')
  const [factorId, setFactorId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (state.kind !== 'authenticated') {
      setStatus('loading')
      return
    }
    setStatus('loading')
    const [{ current, next }, factors] = await Promise.all([getAssuranceLevel(), listTotpFactors()])
    if (factors.length === 0) {
      setFactorId(null)
      setStatus('unenrolled')
      return
    }
    setFactorId(factors[0].id)
    setStatus(current === next ? 'satisfied' : 'needs-challenge')
  }, [state.kind])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { status, factorId, refresh }
}
