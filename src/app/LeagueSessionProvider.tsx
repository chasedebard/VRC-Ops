import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getOwnProfile } from '@/services/profile'
import { hasAcceptedCurrent } from '@/services/legal'
import { getMyLeagues, type MyLeagueMembership } from '@/services/leagues'
import { resolvePermissions, type LeaguePermissions } from '@/permissions/resolver'
import type { ProfileRow } from '@/types/database'

const SELECTED_LEAGUE_KEY = 'vrc-selected-league'

interface LeagueSessionValue {
  loading: boolean
  profile: ProfileRow | null
  profileCompleted: boolean
  legalAccepted: boolean
  leagues: MyLeagueMembership[]
  selectedLeague: MyLeagueMembership | null
  permissions: LeaguePermissions
  selectLeague: (leagueId: string) => void
  refresh: () => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const LeagueSessionContext = createContext<LeagueSessionValue | null>(null)

export function LeagueSessionProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const userId = state.kind === 'authenticated' ? state.user.id : null

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [legalAccepted, setLegalAccepted] = useState(false)
  const [leagues, setLeagues] = useState<MyLeagueMembership[]>([])
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(
    () => localStorage.getItem(SELECTED_LEAGUE_KEY),
  )

  const load = useCallback(async () => {
    if (!userId) {
      setProfile(null)
      setLegalAccepted(false)
      setLeagues([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [profileRow, acceptedGeneral, myLeagues] = await Promise.all([
      getOwnProfile(userId),
      hasAcceptedCurrent('general'),
      getMyLeagues(userId),
    ])
    setProfile(profileRow)
    setLegalAccepted(acceptedGeneral)
    setLeagues(myLeagues)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const selectedLeague = useMemo(() => {
    const found = leagues.find((l) => l.league.id === selectedLeagueId)
    return found ?? leagues[0] ?? null
  }, [leagues, selectedLeagueId])

  const permissions = useMemo(
    () => resolvePermissions(selectedLeague?.roles ?? []),
    [selectedLeague],
  )

  function selectLeague(leagueId: string) {
    localStorage.setItem(SELECTED_LEAGUE_KEY, leagueId)
    setSelectedLeagueId(leagueId)
  }

  const value: LeagueSessionValue = {
    loading,
    profile,
    profileCompleted: Boolean(profile?.profile_completed),
    legalAccepted,
    leagues,
    selectedLeague,
    permissions,
    selectLeague,
    refresh: load,
  }

  return (
    <LeagueSessionContext.Provider value={value}>{children}</LeagueSessionContext.Provider>
  )
}
