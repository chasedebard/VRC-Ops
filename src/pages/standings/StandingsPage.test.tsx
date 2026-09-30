import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import type { ChampionshipRow, SeasonRow, TeamRow } from '@/types/database'

const mockUseLeagueSession = vi.fn()
const mockUseEntitlement = vi.fn()
vi.mock('@/hooks/useLeagueSession', () => ({ useLeagueSession: () => mockUseLeagueSession() }))
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => mockUseEntitlement() }))

const mockResolveActiveSeason = vi.fn()
vi.mock('@/utils/activeSeason', () => ({ resolveActiveSeason: (...args: unknown[]) => mockResolveActiveSeason(...args) }))

const mockGetLatestStandings = vi.fn()
const mockGetPreviousStandingsRows = vi.fn()
const mockGetAvailableStandingsGroups = vi.fn()
vi.mock('@/services/standings', () => ({
  getLatestStandings: (...args: unknown[]) => mockGetLatestStandings(...args),
  getPreviousStandingsRows: (...args: unknown[]) => mockGetPreviousStandingsRows(...args),
  getAvailableStandingsGroups: (...args: unknown[]) => mockGetAvailableStandingsGroups(...args),
}))

const mockGetDriversByIds = vi.fn()
vi.mock('@/services/driverProfile', () => ({ getDriversByIds: (...args: unknown[]) => mockGetDriversByIds(...args) }))

vi.mock('@/services/catalog', () => ({
  classesService: { list: vi.fn().mockResolvedValue([]) },
  regionsService: { list: vi.fn().mockResolvedValue([]) },
  teamsService: { list: vi.fn().mockResolvedValue([]) },
}))

const mockGetSeasonTeams = vi.fn()
vi.mock('@/services/seasonTeams', () => ({ getSeasonTeams: (...args: unknown[]) => mockGetSeasonTeams(...args) }))

// Imported after the mocks above so StandingsPage picks up the mocked modules.
const { default: StandingsPage } = await import('./StandingsPage')

function championship(): ChampionshipRow {
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
    created_at: '',
    updated_at: '',
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

beforeEach(() => {
  mockUseLeagueSession.mockReturnValue({
    selectedLeague: { league: { id: 'l1' }, roles: ['owner'] },
    permissions: { canManageMembers: true },
  })
  mockUseEntitlement.mockReturnValue({ hasAccess: true })
  mockGetPreviousStandingsRows.mockResolvedValue([])
  mockGetAvailableStandingsGroups.mockResolvedValue([])
  mockGetDriversByIds.mockResolvedValue([])
  mockGetSeasonTeams.mockResolvedValue([])
  mockGetLatestStandings.mockResolvedValue(null)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('StandingsPage — Teams tab visibility', () => {
  it('hides the Teams tab when season.teams_enabled is false', async () => {
    mockResolveActiveSeason.mockResolvedValue({ championship: championship(), season: season({ teams_enabled: false }) })
    render(<MemoryRouter><StandingsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Drivers')).toBeInTheDocument())
    expect(screen.queryByText('Teams')).not.toBeInTheDocument()
  })

  it('shows the Teams tab immediately when season.teams_enabled is true, even with zero teams', async () => {
    mockResolveActiveSeason.mockResolvedValue({ championship: championship(), season: season({ teams_enabled: true }) })
    render(<MemoryRouter><StandingsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Teams')).toBeInTheDocument())
  })
})

describe('StandingsPage — Teams tab empty states', () => {
  it('shows "No teams configured" when teams_enabled but zero active teams exist', async () => {
    mockResolveActiveSeason.mockResolvedValue({ championship: championship(), season: season({ teams_enabled: true }) })
    mockGetSeasonTeams.mockResolvedValue([])
    mockGetLatestStandings.mockResolvedValue({ snapshot: {} as never, rows: [] })
    render(<MemoryRouter><StandingsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Teams')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Teams'))
    await waitFor(() => expect(screen.getByText('No teams configured for this season.')).toBeInTheDocument())
  })

  it('shows "No team standings yet" when teams exist but no standings rows have been scored', async () => {
    mockResolveActiveSeason.mockResolvedValue({ championship: championship(), season: season({ teams_enabled: true }) })
    mockGetSeasonTeams.mockResolvedValue([team()])
    mockGetLatestStandings.mockResolvedValue({ snapshot: {} as never, rows: [] })
    render(<MemoryRouter><StandingsPage /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Teams')).toBeInTheDocument())
    await userEvent.click(screen.getByText('Teams'))
    await waitFor(() => expect(screen.getByText('No team standings yet.')).toBeInTheDocument())
  })
})
