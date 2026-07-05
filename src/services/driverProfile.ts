import { supabase } from '@/supabase/client'
import type { DriverHistoryRow, DriverRow } from '@/types/database'

export async function getDriverHistory(driverId: string): Promise<DriverHistoryRow[]> {
  const { data, error } = await supabase
    .from('driver_history')
    .select('*')
    .eq('driver_id', driverId)
    .order('saved_at', { ascending: false })
    .returns<DriverHistoryRow[]>()
  if (error) throw error
  return data ?? []
}

/** Every driver's history within one season — used by the predictions engine
 *  to build recent-form/track-history/reliability factors for the whole field. */
export async function getSeasonDriverHistory(seasonId: string): Promise<DriverHistoryRow[]> {
  const { data, error } = await supabase
    .from('driver_history')
    .select('*')
    .eq('season_id', seasonId)
    .order('saved_at', { ascending: true })
    .returns<DriverHistoryRow[]>()
  if (error) throw error
  return data ?? []
}

export interface DriverCareerStats {
  starts: number
  wins: number
  podiums: number
  poles: number
  fastestLaps: number
  averageFinish: number | null
  dnfCount: number
  dnsCount: number
  dsqCount: number
}

/** Ports the counting logic from DriverProfileStatsService.stats() — pass a
 *  pre-filtered history slice to scope to a single season, or the full
 *  history for career-wide stats (inactive seasons/championships included). */
export function computeCareerStats(raceHistory: DriverHistoryRow[]): DriverCareerStats {
  const races = raceHistory.filter((r) => r.result_kind === 'race')
  const finishes = races.map((r) => r.finish_position).filter((p): p is number => p != null && p > 0)

  return {
    starts: races.filter((r) => r.status !== 'dns').length,
    wins: races.filter((r) => r.finish_position === 1 && r.status === 'fin').length,
    podiums: races.filter((r) => (r.finish_position ?? 99) <= 3 && r.status === 'fin').length,
    poles: races.filter((r) => r.earned_pole).length,
    fastestLaps: races.filter((r) => r.fastest_lap).length,
    averageFinish: finishes.length > 0 ? finishes.reduce((a, b) => a + b, 0) / finishes.length : null,
    dnfCount: races.filter((r) => r.status === 'dnf').length,
    dnsCount: races.filter((r) => r.status === 'dns').length,
    dsqCount: races.filter((r) => r.status === 'dsq').length,
  }
}

export async function getDriversByIds(ids: string[]): Promise<DriverRow[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabase.from('drivers').select('*').in('id', ids).returns<DriverRow[]>()
  if (error) throw error
  return data ?? []
}
