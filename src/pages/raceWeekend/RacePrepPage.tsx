import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getDrivers } from '@/services/drivers'
import {
  buildRacePrepLeaderboard,
  getCaptureSummaries,
  getPracticeAggregates,
  subscribeToCaptureSummaries,
  type RacePrepRow,
} from '@/services/racePrep'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDateTime, formatLapTime } from '@/utils/format'
import type { CaptureSummaryRow, CaptureValidationState, DriverRow } from '@/types/database'

const VALIDATION_TONE: Record<CaptureValidationState, 'success' | 'warning' | 'danger' | 'neutral'> = {
  accepted: 'success',
  needsReview: 'warning',
  lowConfidence: 'warning',
  trackMismatch: 'danger',
  incompleteCapture: 'danger',
  rejected: 'danger',
}

export default function RacePrepPage() {
  const { eventId } = useParams<{ eventId: string }>()
  const { selectedLeague, permissions } = useLeagueSession()
  const [rows, setRows] = useState<RacePrepRow[] | null>(null)
  const [captures, setCaptures] = useState<CaptureSummaryRow[] | null>(null)
  const [drivers, setDrivers] = useState<Map<string, DriverRow>>(new Map())
  const [error, setError] = useState<string | null>(null)

  // The native app's "Capture" tab (Start/Active/History/Uploads/Storage) is
  // otherwise entirely local-device UI around raw UDP telemetry recording —
  // not portable to a browser. This history list mirrors its "History" tab
  // (past saved capture summaries), the one part that's genuinely
  // Supabase-backed and cross-device.
  const canSeeCaptureHistory = permissions.roles.has('driver') || permissions.canOperateRaceControl

  const load = useCallback(async () => {
    if (!eventId || !selectedLeague) return
    setError(null)
    try {
      const [aggregates, driverList, captureRows] = await Promise.all([
        getPracticeAggregates(eventId, 'practice'),
        getDrivers(selectedLeague.league.id),
        canSeeCaptureHistory ? getCaptureSummaries(eventId) : Promise.resolve([]),
      ])
      setRows(buildRacePrepLeaderboard(aggregates, driverList))
      setDrivers(new Map(driverList.map((d) => [d.id, d])))
      setCaptures(captureRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load practice data.')
    }
  }, [eventId, selectedLeague, canSeeCaptureHistory])

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

      {canSeeCaptureHistory && (
        <Card>
          <CardHeader>
            <CardTitle>Capture history</CardTitle>
          </CardHeader>
          <p className="mb-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Every saved telemetry capture uploaded for this event, across all phases. There's no
            live "recording now" status — a capture only appears here once a driver saves it on
            their device and the parsed summary uploads.
          </p>
          {captures === null ? (
            <LoadingState />
          ) : captures.length === 0 ? (
            <EmptyState title="No captures uploaded yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr style={{ color: 'var(--color-text-muted)' }}>
                    <th className="pb-2 pr-4">Driver</th>
                    <th className="pb-2 pr-4">Phase</th>
                    <th className="pb-2 pr-4">Laps</th>
                    <th className="pb-2 pr-4">Average</th>
                    <th className="pb-2 pr-4">Fastest</th>
                    <th className="pb-2 pr-4">Confidence</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Uploaded</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {captures.map((c) => {
                    const driver = drivers.get(c.driver_id)
                    return (
                      <tr key={c.id}>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2 font-medium">
                            {driver && <DriverAvatar driver={driver} size="sm" />}
                            {driver?.display_name ?? 'Unknown driver'}
                          </div>
                        </td>
                        <td className="py-2 pr-4 capitalize">{c.phase}</td>
                        <td className="py-2 pr-4">
                          {c.representative_lap_count}/{c.total_completed_lap_count}
                        </td>
                        <td className="py-2 pr-4 font-mono">{formatLapTime(c.average_representative_ms)}</td>
                        <td className="py-2 pr-4 font-mono">{formatLapTime(c.fastest_representative_ms)}</td>
                        <td className="py-2 pr-4 capitalize">{c.classification_confidence}</td>
                        <td className="py-2 pr-4">
                          <Badge tone={VALIDATION_TONE[c.validation_state]}>{c.validation_state}</Badge>
                        </td>
                        <td className="py-2 pr-4" style={{ color: 'var(--color-text-muted)' }}>
                          {formatDateTime(c.device_updated_at ?? c.created_at)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
