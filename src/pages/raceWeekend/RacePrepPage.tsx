import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getDrivers } from '@/services/drivers'
import {
  buildRacePrepLeaderboard,
  getPracticeAggregates,
  subscribeToCaptureSummaries,
  type RacePrepRow,
} from '@/services/racePrep'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { DriverAvatar } from '@/components/DriverAvatar'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatLapTime } from '@/utils/format'

export default function RacePrepPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { selectedLeague } = useLeagueSession()
  const [rows, setRows] = useState<RacePrepRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!eventId || !selectedLeague) return
    setError(null)
    try {
      const [aggregates, drivers] = await Promise.all([
        getPracticeAggregates(eventId, 'practice'),
        getDrivers(selectedLeague.league.id),
      ])
      setRows(buildRacePrepLeaderboard(aggregates, drivers))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load practice data.')
    }
  }, [eventId, selectedLeague])

  useEffect(() => {
    load()
    if (!eventId) return
    return subscribeToCaptureSummaries(eventId, load)
  }, [eventId, load])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (rows === null) return <LoadingState />

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Race Prep</h1>
      <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Parsed practice telemetry only — sorted by fastest average lap, then fastest lap, then laps completed.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Pace leaderboard</CardTitle>
        </CardHeader>
        {rows.length === 0 ? (
          <EmptyState
            title="No practice data yet"
            description="Practice summaries will appear here once drivers upload parsed telemetry from the app."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-muted)' }}>
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Driver</th>
                  <th className="pb-2 pr-4">Laps</th>
                  <th className="pb-2 pr-4">Average</th>
                  <th className="pb-2 pr-4">Fastest</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {rows.map((row, index) => (
                  <tr key={row.driverId}>
                    <td className="py-2 pr-4">{index + 1}</td>
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2 font-medium">
                        {row.driver && <DriverAvatar driver={row.driver} size="sm" />}
                        {row.displayName}
                      </div>
                    </td>
                    <td className="py-2 pr-4">{row.lapsCompleted}</td>
                    <td className="py-2 pr-4 font-mono">{formatLapTime(row.averageLapTimeMs)}</td>
                    <td className="py-2 pr-4 font-mono">{formatLapTime(row.fastestLapTimeMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
