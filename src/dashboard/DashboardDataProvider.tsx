import { createContext, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { getDrivers } from '@/services/drivers'
import { getSeasonEvents } from '@/services/events'
import { dashboardKeys } from './queryKeys'
import type { ChampionshipRow, DriverRow, EventRow, SeasonRow } from '@/types/database'

export interface DashboardBaseData {
  leagueId: string
  loading: boolean
  error: string | null
  active: { championship: ChampionshipRow; season: SeasonRow } | null
  drivers: DriverRow[]
  events: EventRow[]
}

// eslint-disable-next-line react-refresh/only-export-components
export const DashboardDataContext = createContext<DashboardBaseData | null>(null)

/**
 * Prefetches once per dashboard mount the handful of things nearly every
 * tile needs (active season, league roster, season events) so tiles don't
 * each independently re-fetch league-wide context. Individual tiles still
 * fetch their own more specific data (standings, history, results) via the
 * same TanStack Query cache, keyed through dashboardKeys so identical
 * requests across tile instances are deduped automatically.
 */
export function DashboardDataProvider({ leagueId, children }: { leagueId: string; children: ReactNode }) {
  const driversQuery = useQuery({
    queryKey: dashboardKeys.drivers(leagueId),
    queryFn: () => getDrivers(leagueId, false),
  })
  const activeSeasonQuery = useQuery({
    queryKey: dashboardKeys.activeSeason(leagueId),
    queryFn: () => resolveActiveSeason(leagueId),
  })
  const seasonId = activeSeasonQuery.data?.season.id ?? null
  const eventsQuery = useQuery({
    queryKey: dashboardKeys.seasonEvents(seasonId ?? 'none'),
    queryFn: () => getSeasonEvents(seasonId!),
    enabled: Boolean(seasonId),
  })

  const loading = driversQuery.isLoading || activeSeasonQuery.isLoading || (Boolean(seasonId) && eventsQuery.isLoading)
  const rawError = driversQuery.error ?? activeSeasonQuery.error ?? eventsQuery.error ?? null
  if (rawError) console.error(rawError)

  const value: DashboardBaseData = {
    leagueId,
    loading,
    error: rawError ? 'Could not load dashboard data.' : null,
    active: activeSeasonQuery.data ?? null,
    drivers: driversQuery.data ?? [],
    events: eventsQuery.data ?? [],
  }

  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>
}
