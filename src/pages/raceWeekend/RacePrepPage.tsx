import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getDrivers, getSeasonRoster } from '@/services/drivers'
import { getEvent } from '@/services/events'
import { getEventDnsDriverIds, setEventDns } from '@/services/results'
import { activeRosterDrivers } from '@/services/standingsData'
import {
  buildRacePrepLeaderboard,
  getCaptureSummaries,
  getPracticeAggregates,
  subscribeToCaptureSummaries,
  type RacePrepRow,
} from '@/services/racePrep'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { DriverAvatar } from '@/components/DriverAvatar'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDateTime, formatLapTime } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'
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
  const [rosterDrivers, setRosterDrivers] = useState<DriverRow[]>([])
  const [dnsIds, setDnsIds] = useState<Set<string>>(new Set())
  const [dnsBusy, setDnsBusy] = useState<string | null>(null)
  const [dnsError, setDnsError] = useState<string | null>(null)

  // DNS is operator-only (Owner/Admin/Marshal) — enforced by the RPC and a restrictive RLS policy as well.
  const canEditDns = permissions.canOperateRaceControl

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
      // The DNS list is secondary — a failure here must never blank the pace leaderboard.
      try {
        const event = await getEvent(eventId)
        if (event) {
          const [roster, dns] = await Promise.all([getSeasonRoster(event.season_id), getEventDnsDriverIds(eventId)])
          setRosterDrivers(activeRosterDrivers(driverList, roster))
          setDnsIds(dns)
        }
      } catch {
        setRosterDrivers([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load practice data.')
    }
  }, [eventId, selectedLeague, canSeeCaptureHistory])

  useEffect(() => {
    load()
    if (!eventId) return
    return subscribeToCaptureSummaries(eventId, load)
  }, [eventId, load])

  async function toggleDns(driverId: string) {
    if (!eventId || dnsBusy) return
    const next = !dnsIds.has(driverId)
    setDnsBusy(driverId)
    setDnsError(null)
    try {
      await setEventDns(eventId, driverId, next)
      setDnsIds((prev) => {
        const copy = new Set(prev)
        if (next) copy.add(driverId)
        else copy.delete(driverId)
        return copy
      })
    } catch (err) {
      setDnsError(backendErrorMessage(err, 'Could not update DNS.'))
    } finally {
      setDnsBusy(null)
    }
  }

  // Roster order, with Did-Not-Start drivers sorted to the bottom (as in the app's Race Prep).
  const dnsOrdered = [...rosterDrivers].sort((a, b) => Number(dnsIds.has(a.id)) - Number(dnsIds.has(b.id)))

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

      {rosterDrivers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Driver participation</CardTitle>
            <Badge tone={dnsIds.size > 0 ? 'warning' : 'neutral'}>{dnsIds.size} DNS</Badge>
          </CardHeader>
          <p className="mb-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Drivers marked Did Not Start are kept off the qualifying and race entry sheets and recorded as DNS when results are
            finalized.{canEditDns ? '' : ' Only an Owner, Admin or Marshal can change this.'}
          </p>
          {dnsError && (
            <p role="alert" className="mb-2 text-sm" style={{ color: 'var(--color-danger)' }}>
              {dnsError}
            </p>
          )}
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {dnsOrdered.map((driver) => {
              const isDns = dnsIds.has(driver.id)
              return (
                <li key={driver.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="flex items-center gap-2 text-sm font-medium" style={{ opacity: isDns ? 0.6 : 1 }}>
                    <DriverAvatar driver={driver} size="sm" />
                    {driver.display_name}
                  </span>
                  {canEditDns ? (
                    <Button
                      variant={isDns ? 'danger' : 'secondary'}
                      onClick={() => toggleDns(driver.id)}
                      disabled={dnsBusy !== null}
                      aria-pressed={isDns}
                      aria-label={`${isDns ? 'Clear DNS for' : 'Mark DNS for'} ${driver.display_name}`}
                    >
                      {dnsBusy === driver.id ? 'Saving…' : isDns ? 'DNS' : 'Mark DNS'}
                    </Button>
                  ) : (
                    isDns && <Badge tone="warning">DNS</Badge>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

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
