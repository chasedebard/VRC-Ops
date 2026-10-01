import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import type { AuthState } from '@/services/auth'
import type { MyLeagueMembership } from '@/services/leagues'

// What the database returns depends on the session's assurance level: with a verified authenticator, an aal1 session sees NO rows
// (restrictive aal2 RLS) — not an error. The mocks below emulate exactly that, keyed off the `aal` the provider is given.
let authState: AuthState = { kind: 'signedOut' }
const getOwnProfile = vi.fn()
const loadLegalState = vi.fn()
const getMyLeagues = vi.fn()

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ state: authState }) }))
vi.mock('@/services/profile', () => ({ getOwnProfile: (...a: unknown[]) => getOwnProfile(...a) }))
vi.mock('@/services/legal', () => ({
  loadLegalState: (...a: unknown[]) => loadLegalState(...a),
  acceptLegalDocument: vi.fn(),
  revokeLegalDocument: vi.fn(),
}))
vi.mock('@/services/leagues', () => ({ getMyLeagues: (...a: unknown[]) => getMyLeagues(...a), sortLeaguesByName: <T,>(x: T[]) => x }))

import { LeagueSessionProvider } from './LeagueSessionProvider'
import { useLeagueSession } from '@/hooks/useLeagueSession'

const league = (id: string, name: string): MyLeagueMembership => ({ league: { id, name } as never, membershipId: `m-${id}`, roles: ['driver'] })
const user = (id: string, aal: string): AuthState => ({ kind: 'authenticated', user: { id } as never, aal })

function Probe() {
  const s = useLeagueSession()
  return (
    <div>
      <p data-testid="loading">{String(s.loading)}</p>
      <p data-testid="leagues">{s.leagues.map((l) => l.league.name).join(',')}</p>
      <p data-testid="selected">{s.selectedLeague?.league.name ?? 'none'}</p>
      <p data-testid="legal">{String(s.legalAccepted)}</p>
      <button onClick={() => s.selectLeague('l2')}>pick</button>
    </div>
  )
}

function mountWith(initial: AuthState) {
  authState = initial
  const view = render(
    <LeagueSessionProvider>
      <Probe />
    </LeagueSessionProvider>,
  )
  return {
    rerenderWith(next: AuthState) {
      authState = next
      view.rerender(
        <LeagueSessionProvider>
          <Probe />
        </LeagueSessionProvider>,
      )
    },
  }
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
  const accepted = { activeDocuments: [{ id: 'd1', doc_type: 'general', version: 1, is_required: true, is_active: true }], acceptances: [{ document_id: 'd1', doc_type: 'general', version: 1, revoked_at: null }] }
  const unaccepted = { activeDocuments: accepted.activeDocuments, acceptances: [] }
  getOwnProfile.mockResolvedValue({ id: 'u1', profile_completed: true })
  loadLegalState.mockImplementation(async () => (currentAal() === 'aal2' ? accepted : unaccepted))
  getMyLeagues.mockImplementation(async () => (currentAal() === 'aal2' ? [league('l2', 'Alpha League'), league('l1', 'Zeta League')] : []))
})

const currentAal = () => (authState.kind === 'authenticated' ? (authState.aal ?? '') : '')

describe('LeagueSessionProvider', () => {
  it('reloads the account after the MFA step-up, so an existing league member is recognised', async () => {
    const view = mountWith(user('u1', 'aal1'))
    // At aal1 the (emulated) database hides everything: no leagues, and the accepted terms look unaccepted.
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('leagues')).toHaveTextContent('')
    expect(screen.getByTestId('legal')).toHaveTextContent('false')

    act(() => view.rerenderWith(user('u1', 'aal2')))
    // The very first render after the step-up must not present the stale aal1 data as if it were final.
    expect(screen.getByTestId('loading')).toHaveTextContent('true')
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('leagues')).toHaveTextContent('Alpha League,Zeta League')
    expect(screen.getByTestId('legal')).toHaveTextContent('true')
  })

  it('defaults to the first league and asks the user to choose only when several exist and none is remembered', async () => {
    mountWith(user('u1', 'aal2'))
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(screen.getByTestId('selected')).toHaveTextContent('Alpha League')
  })

  it('remembers the chosen league per account, not per browser', async () => {
    const first = mountWith(user('u1', 'aal2'))
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    act(() => screen.getByText('pick').click())
    expect(screen.getByTestId('selected')).toHaveTextContent('Alpha League')
    expect(localStorage.getItem('vrc-selected-league:u1')).toBe('l2')
    // Another account in the same browser starts with no remembered choice.
    act(() => first.rerenderWith(user('u2', 'aal2')))
    await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'))
    expect(localStorage.getItem('vrc-selected-league:u2')).toBeNull()
  })

  it('ignores a slower load that was superseded by a newer one', async () => {
    let releaseFirst: (v: MyLeagueMembership[]) => void = () => undefined
    getMyLeagues.mockReset()
    getMyLeagues.mockImplementationOnce(() => new Promise<MyLeagueMembership[]>((resolve) => (releaseFirst = resolve)))
    getMyLeagues.mockImplementationOnce(async () => [league('l2', 'Alpha League')])
    const view = mountWith(user('u1', 'aal1'))
    act(() => view.rerenderWith(user('u1', 'aal2')))
    await waitFor(() => expect(screen.getByTestId('leagues')).toHaveTextContent('Alpha League'))
    // The stale aal1 response arrives last and must not overwrite the aal2 result.
    await act(async () => releaseFirst([]))
    expect(screen.getByTestId('leagues')).toHaveTextContent('Alpha League')
  })
})
