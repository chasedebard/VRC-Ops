import { supabase } from '@/supabase/client'
import type { DriverRow, RwEventDriverAggregateRow } from '@/types/database'

export async function getPracticeAggregates(
  eventId: string,
  phase: 'practice' | 'qualifying' | 'race' = 'practice',
): Promise<RwEventDriverAggregateRow[]> {
  const { data, error } = await supabase
    .from('rw_event_driver_aggregates')
    .select('*')
    .eq('event_id', eventId)
    .eq('phase', phase)
    .returns<RwEventDriverAggregateRow[]>()
  if (error) throw error
  return data ?? []
}

export function subscribeToCaptureSummaries(eventId: string, onChange: () => void) {
  const channel = supabase
    .channel(`capture_summaries:${eventId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'capture_summaries', filter: `event_id=eq.${eventId}` },
      () => onChange(),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

export interface RacePrepRow {
  driverId: string
  displayName: string
  lapsCompleted: number
  averageLapTimeMs: number | null
  fastestLapTimeMs: number | null
  hasPostedPractice: boolean
}

/**
 * Ports RacePrepLeaderboard.paceOrder() / RW-MINIMAL-003: rows with a valid
 * average sort first (fastest average asc, then fastest lap asc, then laps
 * completed desc), everyone else falls to the bottom sorted alphabetically.
 * Uses parsed capture-summary aggregates only — no raw telemetry.
 */
export function buildRacePrepLeaderboard(
  aggregates: RwEventDriverAggregateRow[],
  drivers: DriverRow[],
): RacePrepRow[] {
  const driverById = new Map(drivers.map((d) => [d.id, d]))

  const rows: RacePrepRow[] = aggregates.map((agg) => ({
    driverId: agg.driver_id,
    displayName: driverById.get(agg.driver_id)?.display_name ?? 'Unknown driver',
    lapsCompleted: agg.total_completed_laps,
    averageLapTimeMs: agg.average_representative_ms,
    fastestLapTimeMs: agg.fastest_representative_ms,
    hasPostedPractice: agg.representative_laps > 0,
  }))

  return rows.sort((a, b) => {
    const aValid = a.averageLapTimeMs != null
    const bValid = b.averageLapTimeMs != null
    if (aValid !== bValid) return aValid ? -1 : 1
    if (aValid && bValid) {
      if (a.averageLapTimeMs !== b.averageLapTimeMs) {
        return a.averageLapTimeMs! - b.averageLapTimeMs!
      }
    }
    const aFastest = a.fastestLapTimeMs
    const bFastest = b.fastestLapTimeMs
    if (aFastest != null && bFastest != null && aFastest !== bFastest) {
      return aFastest - bFastest
    }
    if ((aFastest != null) !== (bFastest != null)) return aFastest != null ? -1 : 1
    if (a.lapsCompleted !== b.lapsCompleted) return b.lapsCompleted - a.lapsCompleted
    return a.displayName.localeCompare(b.displayName)
  })
}
