import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getOwnProfile } from '@/services/profile'
import { acceptLegalDocument, loadLegalState, revokeLegalDocument } from '@/services/legal'
import { getMyLeagues, type MyLeagueMembership } from '@/services/leagues'
import { resolvePermissions, type LeaguePermissions } from '@/permissions/resolver'
import {
  EMPTY_LEGAL_STATE,
  generalAccessUnaccepted,
  type LegalState,
} from '@/utils/legalState'
import type { LegalDocType, LegalDocumentVersionRow, ProfileRow } from '@/types/database'

const SELECTED_LEAGUE_KEY = 'vrc-selected-league'
const ACCOUNT_LOAD_FAILURE_MESSAGE =
  'We couldn’t load your profile and leagues. Check your connection and try again.'

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function logAccountLoadFailure(caught: unknown) {
  const record =
    typeof caught === 'object' && caught !== null ? (caught as Record<string, unknown>) : {}
  console.error('[LeagueSession] account load failed', {
    code: stringField(record, 'code'),
    message:
      caught instanceof Error
        ? caught.message
        : (stringField(record, 'message') ?? 'Unknown account-load error'),
    details: stringField(record, 'details'),
    hint: stringField(record, 'hint'),
  })
}

interface LeagueSessionValue {
  loading: boolean
  /** Set when the profile/league/legal load failed; the shell shows a retry state instead of hanging. */
  error: string | null
  profile: ProfileRow | null
  profileCompleted: boolean
  /** Versioned legal state (active documents + the caller's acceptances). */
  legal: LegalState
  /** Required Terms/Privacy documents the caller has not accepted yet — non-empty blocks app access. */
  pendingLegalDocuments: LegalDocumentVersionRow[]
  /** True when no required general-access document is outstanding. */
  legalAccepted: boolean
  leagues: MyLeagueMembership[]
  selectedLeague: MyLeagueMembership | null
  /** True when the account has several leagues and none has been chosen yet (the league picker shows). */
  needsLeagueChoice: boolean
  permissions: LeaguePermissions
  selectLeague: (leagueId: string) => void
  /** Clears the stored league selection so the league picker shows again (iOS "Switch league"). */
  clearLeagueSelection: () => void
  acceptLegal: (document: LegalDocumentVersionRow, leagueId?: string | null) => Promise<void>
  revokeLegal: (docType: LegalDocType) => Promise<void>
  refresh: () => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const LeagueSessionContext = createContext<LeagueSessionValue | null>(null)

export function LeagueSessionProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth()
  const userId = state.kind === 'authenticated' ? state.user.id : null

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [legal, setLegal] = useState<LegalState>(EMPTY_LEGAL_STATE)
  const [leagues, setLeagues] = useState<MyLeagueMembership[]>([])
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(SELECTED_LEAGUE_KEY)
    } catch {
      return null
    }
  })

  const load = useCallback(async () => {
    if (!userId) {
      setError(null)
      setProfile(null)
      setLegal(EMPTY_LEGAL_STATE)
      setLeagues([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [profileRow, legalState, myLeagues] = await Promise.all([
        getOwnProfile(userId),
        loadLegalState(userId),
        getMyLeagues(userId),
      ])
      setProfile(profileRow)
      setLegal(legalState)
      setLeagues(myLeagues)
    } catch (caught) {
      logAccountLoadFailure(caught)
      setProfile(null)
      setLegal(EMPTY_LEGAL_STATE)
      setLeagues([])
      setError(ACCOUNT_LOAD_FAILURE_MESSAGE)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  const selectedLeague = useMemo(() => {
    const found = leagues.find((l) => l.league.id === selectedLeagueId)
    return found ?? leagues[0] ?? null
  }, [leagues, selectedLeagueId])

  const needsLeagueChoice = useMemo(
    () => leagues.length > 1 && !leagues.some((l) => l.league.id === selectedLeagueId),
    [leagues, selectedLeagueId],
  )

  const permissions = useMemo(() => resolvePermissions(selectedLeague?.roles ?? []), [selectedLeague])

  const pendingLegalDocuments = useMemo(() => generalAccessUnaccepted(legal), [legal])

  const selectLeague = useCallback((leagueId: string) => {
    try {
      localStorage.setItem(SELECTED_LEAGUE_KEY, leagueId)
    } catch {
      // Storage can be unavailable (private mode); selection still applies for this page load.
    }
    setSelectedLeagueId(leagueId)
  }, [])

  const clearLeagueSelection = useCallback(() => {
    try {
      localStorage.removeItem(SELECTED_LEAGUE_KEY)
    } catch {
      // ignore
    }
    setSelectedLeagueId(null)
  }, [])

  const acceptLegal = useCallback(
    async (document: LegalDocumentVersionRow, leagueId: string | null = null) => {
      await acceptLegalDocument(document.id, leagueId)
      if (userId) setLegal(await loadLegalState(userId))
    },
    [userId],
  )

  const revokeLegal = useCallback(
    async (docType: LegalDocType) => {
      await revokeLegalDocument(docType)
      if (userId) setLegal(await loadLegalState(userId))
    },
    [userId],
  )

  const value: LeagueSessionValue = {
    loading,
    error,
    profile,
    profileCompleted: Boolean(profile?.profile_completed),
    legal,
    pendingLegalDocuments,
    legalAccepted: pendingLegalDocuments.length === 0,
    leagues,
    selectedLeague,
    needsLeagueChoice,
    permissions,
    selectLeague,
    clearLeagueSelection,
    acceptLegal,
    revokeLegal,
    refresh: load,
  }

  return <LeagueSessionContext.Provider value={value}>{children}</LeagueSessionContext.Provider>
}
