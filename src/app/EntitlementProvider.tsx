import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import {
  getLeaguePremiumAccess,
  getLeagueSubscription,
  getMyProStatus,
  getMySubscription,
} from '@/services/entitlement'
import { resolveEntitlement, type EntitlementSource } from '@/permissions/entitlement'
import type { LeagueSubscriptionRow, SubscriptionRow } from '@/types/database'

// Mirrors VRCPremiumAccessStore's 300s in-memory cache TTL — bounds how stale
// a background-tab session's entitlement can get before a focus event forces
// a re-check, without hitting the RPCs on every render.
const REFRESH_ON_FOCUS_AFTER_MS = 5 * 60 * 1000

type EntitlementStatus = 'loading' | 'ready' | 'error'

interface EntitlementValue {
  status: EntitlementStatus
  hasAccess: boolean
  source: EntitlementSource
  subscription: SubscriptionRow | null
  leagueSubscription: LeagueSubscriptionRow | null
  lastCheckedAt: Date | null
  error: string | null
  refresh: () => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const EntitlementContext = createContext<EntitlementValue | null>(null)

export function EntitlementProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const { selectedLeague } = useLeagueSession()
  const userId = state.kind === 'authenticated' ? state.user.id : null
  const leagueId = selectedLeague?.league.id ?? null

  const [status, setStatus] = useState<EntitlementStatus>('loading')
  const [isIndividualPro, setIsIndividualPro] = useState(false)
  const [hasLeaguePlus, setHasLeaguePlus] = useState(false)
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [leagueSubscription, setLeagueSubscription] = useState<LeagueSubscriptionRow | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastCheckedRef = useRef(0)

  const load = useCallback(async () => {
    if (!userId) {
      setStatus('ready')
      setIsIndividualPro(false)
      setHasLeaguePlus(false)
      setSubscription(null)
      setLeagueSubscription(null)
      setLastCheckedAt(null)
      setError(null)
      return
    }
    setStatus('loading')
    setError(null)
    try {
      const [pro, mySub] = await Promise.all([getMyProStatus(), getMySubscription(userId)])
      const [leaguePlus, leagueSub] = leagueId
        ? await Promise.all([getLeaguePremiumAccess(leagueId), getLeagueSubscription(leagueId)])
        : [false, null]

      setIsIndividualPro(pro)
      setHasLeaguePlus(leaguePlus)
      setSubscription(mySub)
      setLeagueSubscription(leagueSub)
      const now = new Date()
      setLastCheckedAt(now)
      lastCheckedRef.current = now.getTime()
      setStatus('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check your subscription status.')
      setStatus('error')
    }
  }, [userId, leagueId])

  // Refresh on sign-in (userId change) and on league switch (leagueId change).
  useEffect(() => {
    load()
  }, [load])

  // Web equivalent of iOS's scenePhase == .active refresh: re-check when the
  // tab regains focus after being backgrounded past the cache TTL, so a
  // renewal/refund/removal that happened elsewhere is picked up without
  // requiring a manual refresh.
  useEffect(() => {
    function onFocus() {
      if (Date.now() - lastCheckedRef.current > REFRESH_ON_FOCUS_AFTER_MS) load()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [load])

  const { hasAccess, source } = resolveEntitlement(isIndividualPro, hasLeaguePlus)

  const value: EntitlementValue = {
    status,
    hasAccess,
    source,
    subscription,
    leagueSubscription,
    lastCheckedAt,
    error,
    refresh: load,
  }

  return <EntitlementContext.Provider value={value}>{children}</EntitlementContext.Provider>
}
