import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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

const selectedLeagueStorageKey = (userId: string | null) => (userId ? `${SELECTED_LEAGUE_KEY}:${userId}` : SELECTED_LEAGUE_KEY)

function readSelectedLeague(userId: string | null): string | null {
  try {
    return localStorage.getItem(selectedLeagueStorageKey(userId))
  } catch {
    return null // Storage can be unavailable (private mode); the choice then applies for this page load only.
  }
}

function writeSelectedLeague(userId: string | null, leagueId: string | null): void {
  try {
    if (leagueId) localStorage.setItem(selectedLeagueStorageKey(userId), leagueId)
    else localStorage.removeItem(selectedLeagueStorageKey(userId))
  } catch {
    // ignore
  }
}
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
  // Account data is read through RLS that depends on the session's assurance level (see AuthState.aal), so a change of level —
  // completing the MFA challenge — is a reason to load again, exactly as iOS only bootstraps the account after authentication completes.
  const aal = state.kind === 'authenticated' ? (state.aal ?? '') : ''
  const sessionKey = userId ? `${userId}:${aal}` : null

  const [loading, setLoading] = useState(true)
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const loadSeq = useRef(0)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [legal, setLegal] = useState<LegalState>(EMPTY_LEGAL_STATE)
  const [leagues, setLeagues] = useState<MyLeagueMembership[]>([])
  // The chosen league is remembered per account (iOS keys it by user id), so a shared browser never carries one account's choice to another.
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(null)
  useEffect(() => {
    setSelectedLeagueId(readSelectedLeague(userId))
  }, [userId])

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    if (!userId) {
      setError(null)
      setProfile(null)
      setLegal(EMPTY_LEGAL_STATE)
      setLeagues([])
      setLoadedKey(null)
      setLoading(false)
      return
    }
    const key = `${userId}:${aal}`
    setLoading(true)
    setError(null)
    try {
      const [profileRow, legalState, myLeagues] = await Promise.all([getOwnProfile(userId), loadLegalState(userId), getMyLeagues(userId)])
      if (seq !== loadSeq.current) return // a newer load (e.g. after the MFA step-up) owns the state now
      setProfile(profileRow)
      setLegal(legalState)
      setLeagues(myLeagues)
      setLoadedKey(key)
      setLoading(false)
    } catch (caught) {
      if (seq !== loadSeq.current) return
      logAccountLoadFailure(caught)
      setProfile(null)
      setLegal(EMPTY_LEGAL_STATE)
      setLeagues([])
      setError(ACCOUNT_LOAD_FAILURE_MESSAGE)
      setLoadedKey(key)
      setLoading(false)
    }
  }, [userId, aal])

  useEffect(() => {
    void load()
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

  const selectLeague = useCallback(
    (leagueId: string) => {
      writeSelectedLeague(userId, leagueId)
      setSelectedLeagueId(leagueId)
    },
    [userId],
  )

  const clearLeagueSelection = useCallback(() => {
    writeSelectedLeague(userId, null)
    setSelectedLeagueId(null)
  }, [userId])

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

  // Loading until the data on screen belongs to the CURRENT session (user + assurance level): the render that follows an MFA step-up must not
  // show account data fetched at the lower level (it is empty for accounts with an authenticator).
  const stale = sessionKey !== null && loadedKey !== sessionKey
  const value: LeagueSessionValue = {
    loading: loading || stale,
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
