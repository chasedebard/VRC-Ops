import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ChampionshipRow, ClassRow, DriverRow, SeasonRow, TeamRow } from '@/types/database'
import type { SeasonStandingsContext } from '@/services/standingsData'
import { SubSeriesPlanner, type EventScore, type SeriesEventScores } from '@/utils/standingsEngine'

const mockUseLeagueSession = vi.fn()
const mockUseEntitlement = vi.fn()
vi.mock('@/hooks/useLeagueSession', () => ({ useLeagueSession: () => mockUseLeagueSession() }))
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => mockUseEntitlement() }))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ state: { kind: 'authenticated', user: { id: 'u1' } } }) }))

const mockResolveActiveSeason = vi.fn()
vi.mock('@/utils/activeSeason', () => ({ resolveActiveSeason: (...args: unknown[]) => mockResolveActiveSeason(...args) }))

const mockLoadContext = vi.fn()
vi.mock('@/services/standingsData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/standingsData')>()
  return { ...actual, loadSeasonStandingsContext: (...args: unknown[]) => mockLoadContext(...args) }
})

const mockGetLiveAwards = vi.fn()
const mockSyncAwards = vi.fn()
vi.mock('@/services/results', () => ({
  getLiveStandingAwards: (...args: unknown[]) => mockGetLiveAwards(...args),
  syncSeriesAwards: (...args: unknown[]) => mockSyncAwards(...args),
}))
vi.mock('@/services/rivals', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/rivals')>()
  return { ...actual, loadRivalContext: vi.fn().mockResolvedValue({ subjectDriverId: null, rivalDriverId: null, isNew: false }) }
})

// Imported after the mocks above so StandingsPage picks up the mocked modules.
const { default: StandingsPage } = await import('./StandingsPage')

function championship(overrides: Partial<ChampionshipRow> = {}): ChampionshipRow {
  return {
    id: 'c1',
    league_id: 'l1',
    name: 'Championship',
    series_name: null,
    description: null,
    logo_url: null,
    banner_url: null,
    status: 'active',
    default_scoring: null,
    game_id: 'gran_turismo_7',
    teams_enabled: false,
    classes_enabled: false,
    regions_enabled: false,
    predictions_enabled: false,
    telemetry_enabled: false,
    driver_telemetry_enabled: false,
    viewer_capture_enabled: false,
    practice_capture_enabled: false,
    ai_enabled: false,
    replay_enabled: false,
    primary_color_hex: null,
    secondary_color_hex: null,
    accent_color_hex: null,
    is_active: true,
    logo_storage_path: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function season(overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    id: 's1',
    championship_id: 'c1',
    league_id: 'l1',
    name: 'Season 1',
    year: 2026,
    start_date: null,
    end_date: null,
    status: 'active',
    is_active: true,
    notes: null,
    scoring_config: null,
    drop_rounds: 0,
    tiebreak_config: null,
    teams_enabled: false,
    pole_bonus_enabled: false,
    pole_bonus_points: 1,
    fastest_lap_bonus_enabled: false,
    fastest_lap_bonus_points: 1,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function team(overrides: Partial<TeamRow> = {}): TeamRow {
  return {
    id: 't1',
    league_id: 'l1',
    name: 'Team Red',
    abbreviation: null,
    logo_url: null,
    color: '#ff0000',
    is_active: true,
    season_id: 's1',
    championship_id: 'c1',
    display_order: 1,
    created_by: null,
    updated_by: null,
    archived_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

function driver(id: string, name: string): DriverRow {
  return { id, display_name: name, league_id: 'l1', is_active: true, user_id: null, profile_image_path: null, image_url: null } as DriverRow
}

function score(driverId: string, points: number, extra: Partial<EventScore> = {}): EventScore {
  return {
    driverId,
    earnedPoints: points,
    adjustmentPoints: 0,
    totalPoints: points,
    finishPosition: 1,
    status: 'fin',
    earnedPole: false,
    fastestLap: false,
    classId: null,
    regionId: null,
    teamId: null,
    ...extra,
  }
}

function context(overrides: {
  championship?: ChampionshipRow
  season?: SeasonRow
  teams?: TeamRow[]
  eventScores?: SeriesEventScores[]
  remaining?: number
  classes?: ClassRow[]
}): SeasonStandingsContext {
  const s = overrides.season ?? season()
  const eventScores = overrides.eventScores ?? []
  const drivers = [driver('a', 'Ann'), driver('b', 'Bo'), driver('c', 'Cy')]
  const allScores = eventScores.flatMap((e) => e.scores)
  return {
    season: s,
    championship: overrides.championship ?? championship(),
    config: { positionPoints: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], poleBonus: 0, fastestLapBonus: 0, participationPoints: 0, dropRounds: 0 },
    events: [],
    outputs: eventScores.length > 0 ? ([{ created_at: '2026-09-01T00:00:00Z' }] as never) : [],
    eventScores,
    drivers,
    driverInfo: new Map(drivers.map((d) => [d.id, { name: d.display_name, number: '' }])),
    roster: [],
    teams: overrides.teams ?? [],
    teamInfo: new Map((overrides.teams ?? []).map((t) => [t.id, t.name])),
    classes: overrides.classes ?? [],
    regions: [],
    planner: new SubSeriesPlanner({
      seasonEvents: Array.from({ length: overrides.remaining ?? 0 }, (_, i) => ({
        id: `r${i}`,
        round: 20 + i,
        status: 'scheduled' as const,
        region_id: null,
        class_id: null,
      })),
      officialEventIds: new Set(eventScores.map((e) => e.eventId)),
      eventClassIds: new Map(),
      eligibleDriverIds: new Set(drivers.map((d) => d.id)),
    }),
    hasOfficialResults: eventScores.length > 0,
    lastUpdated: eventScores.length > 0 ? '2026-09-01T00:00:00Z' : null,
    presentClassIds: new Set(allScores.map((x) => x.classId).filter((x): x is string => Boolean(x))),
    presentRegionIds: new Set(),
    hasTeamData: allScores.some((x) => x.teamId),
  }
}

function setup(ctx: SeasonStandingsContext) {
  mockResolveActiveSeason.mockResolvedValue({ championship: ctx.championship, season: ctx.season })
  mockLoadContext.mockResolvedValue(ctx)
  return render(
    <MemoryRouter>
      <StandingsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockUseLeagueSession.mockReturnValue({
    selectedLeague: { league: { id: 'l1' }, roles: ['owner'] },
    permissions: { canManageSetup: true, canManageMembers: true },
  })
  mockUseEntitlement.mockReturnValue({ hasAccess: true })
  mockGetLiveAwards.mockResolvedValue([])
  mockSyncAwards.mockResolvedValue({ created: 0, finalized: 0, revoked: 0, superseded: 0, unchanged: 0 })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('StandingsPage — Teams tab visibility', () => {
  it('hides the Teams tab when season.teams_enabled is false', async () => {
    setup(context({ season: season({ teams_enabled: false }) }))
    await waitFor(() => expect(screen.getByText('Drivers')).toBeInTheDocument())
    expect(screen.queryByText('Teams')).not.toBeInTheDocument()
  })

  it('shows the Teams tab immediately when season.teams_enabled is true, even with zero teams', async () => {
    setup(context({ season: season({ teams_enabled: true }) }))
    await waitFor(() => expect(screen.getByText('Teams')).toBeInTheDocument())
  })
})

describe('StandingsPage — Teams tab empty states', () => {
  it('shows "No teams configured" when teams_enabled but zero active teams exist', async () => {
    setup(context({ season: season({ teams_enabled: true }), teams: [] }))
    await waitFor(() => expect(screen.getByText('Teams')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Teams'))
    await waitFor(() => expect(screen.getByText('No teams configured for this season.')).toBeInTheDocument())
  })

  it('shows "No team standings yet" when teams exist but nothing has been scored', async () => {
    setup(context({ season: season({ teams_enabled: true }), teams: [team()] }))
    await waitFor(() => expect(screen.getByText('Teams')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Teams'))
    await waitFor(() => expect(screen.getByText('No team standings yet.')).toBeInTheDocument())
  })
})

describe('StandingsPage — series outcome', () => {
  const events = (leaderPts: number, chaserPts: number): SeriesEventScores[] => [
    { eventId: 'e1', round: 1, scores: [score('a', leaderPts), score('b', chaserPts, { finishPosition: 2 })] },
  ]

  it('names the winner in a summary card and suppresses Out indicators once a series is clinched', async () => {
    // 100 vs 10 with one event (27) left: Ann has clinched, Bo is mathematically Out — but no row shows Out.
    setup(context({ eventScores: events(100, 10), remaining: 1 }))
    await waitFor(() => expect(screen.getByText('Championship Clinched')).toBeInTheDocument())
    const table = screen.getByRole('table')
    expect(within(table).queryByText('Out')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Clinched Championship/)).toBeInTheDocument() // the single trophy
  })

  it('shows the Out indicator while the series is still undecided', async () => {
    // Ann 100, Bo 95, Cy 10 with one event (27) left: Bo can still catch Ann, so nobody has clinched — but Cy is Out.
    setup(
      context({
        eventScores: [{ eventId: 'e1', round: 1, scores: [score('a', 100), score('b', 95, { finishPosition: 2 }), score('c', 10, { finishPosition: 3 })] }],
        remaining: 1,
      }),
    )
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
    expect(screen.queryByText('Championship Clinched')).not.toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Out')).toBeInTheDocument()
  })

  it('reports award claims for an Owner/Admin after a clean read, and never for a viewer', async () => {
    setup(context({ eventScores: events(100, 10), remaining: 1 }))
    await waitFor(() => expect(mockGetLiveAwards).toHaveBeenCalled())
    await waitFor(() => expect(mockSyncAwards).toHaveBeenCalled())
    const claims = mockSyncAwards.mock.calls[0][1] as { scope: string; status: string; driver_id: string | null }[]
    expect(claims).toContainEqual(expect.objectContaining({ scope: 'overall', status: 'clinched', driver_id: 'a' }))
  })

  it('does not sync awards for a viewer or when the schedule read was unreliable', async () => {
    mockUseLeagueSession.mockReturnValue({
      selectedLeague: { league: { id: 'l1' }, roles: ['viewer'] },
      permissions: { canManageSetup: false, canManageMembers: false },
    })
    setup(context({ eventScores: events(100, 10), remaining: 1 }))
    await waitFor(() => expect(screen.getByText('Championship Clinched')).toBeInTheDocument())
    expect(mockSyncAwards).not.toHaveBeenCalled()
  })
})

describe('StandingsPage — Pro gating', () => {
  it('locks Class standings behind VRC Ops Pro / League Plus but keeps the tab discoverable', async () => {
    mockUseEntitlement.mockReturnValue({ hasAccess: false, status: 'ready', refresh: vi.fn(), error: null, lastCheckedAt: null })
    setup(
      context({
        championship: championship({ classes_enabled: true }),
        eventScores: [{ eventId: 'e1', round: 1, scores: [score('a', 25, { classId: 'k1' })] }],
        classes: [{ id: 'k1', name: 'Gr.3' } as ClassRow],
      }),
    )
    await waitFor(() => expect(screen.getByText('Class')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Class'))
    await waitFor(() => expect(screen.getByText('Class & Regional standings require VRC Ops Pro')).toBeInTheDocument())
  })
})
