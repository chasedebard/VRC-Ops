import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getDriver, updateDriver } from '@/services/drivers'
import { computeCareerStats, getDriverHistory, type DriverHistoryEntry } from '@/services/driverProfile'
import { deleteDriverPhoto, uploadDriverPhoto } from '@/services/storage'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { DriverAvatar } from '@/components/DriverAvatar'
import { TrendChart, type TrendPoint } from '@/components/charts/TrendChart'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDate, formatLapTime } from '@/utils/format'
import type { DriverRow } from '@/types/database'

/** Ports DriverTrendService's formLabel heuristic (native: last 3 races). */
function trendFormLabel(recentPoints: number[], recentPositions: (number | null)[]): string {
  if (recentPoints.length < 2) return 'Not enough races yet'
  const wins = recentPositions.filter((p) => p === 1).length
  const podiums = recentPositions.filter((p) => p != null && p <= 3).length
  if (wins >= 2) return 'Win streak pressure'
  if (podiums >= 2) return 'Podium form'
  const first = recentPositions[0]
  const last = recentPositions[recentPositions.length - 1]
  if (first != null && last != null) {
    if (last < first) return 'Improving finishes'
    if (last > first) return 'Recent dip'
  }
  return 'Stable form'
}

export default function DriverProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useAuth()
  const { permissions } = useLeagueSession()
  const [driver, setDriver] = useState<DriverRow | null | undefined>(undefined)
  const [history, setHistory] = useState<DriverHistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    if (!id) return
    setError(null)
    try {
      const [d, h] = await Promise.all([getDriver(id), getDriverHistory(id)])
      setDriver(d)
      setHistory(h)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this driver.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (driver === undefined || history === null) return <LoadingState />
  if (driver === null) return <EmptyState title="Driver not found" />

  const currentUserId = state.kind === 'authenticated' ? state.user.id : null
  const canEditPhoto = permissions.canManageMembers || (currentUserId != null && currentUserId === driver.user_id)

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !driver) return
    setUploading(true)
    setError(null)
    try {
      const previousPath = driver.profile_image_path
      const path = await uploadDriverPhoto(driver.league_id, driver.id, file)
      await updateDriver(driver.id, { profile_image_path: path })
      if (previousPath) await deleteDriverPhoto(previousPath).catch(() => undefined)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not upload photo.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const career = computeCareerStats(history)
  const races = history
    .filter((h) => h.result_kind === 'race')
    .sort((a, b) => (b.events?.round ?? 0) - (a.events?.round ?? 0))
  const racesChronological = [...races].reverse()
  const trendPoints: TrendPoint[] = racesChronological.map((r, i) => ({
    label: `${i + 1}`,
    value: r.points ?? 0,
    isWin: r.finish_position === 1 && r.status === 'fin',
    isPodium: (r.finish_position ?? 99) <= 3 && r.status === 'fin',
  }))
  const recentThree = racesChronological.slice(-3)
  const formLabel = trendFormLabel(
    recentThree.map((r) => r.points ?? 0),
    recentThree.map((r) => r.finish_position),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <DriverAvatar driver={driver} size="hero" />
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{driver.display_name}</h1>
          {driver.driver_number != null && <Badge tone="accent">#{driver.driver_number}</Badge>}
          {!driver.is_active && <Badge tone="warning">Inactive</Badge>}
        </div>
      </div>

      {canEditPhoto && (
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={handlePhotoChange}
            className="hidden"
          />
          <Button
            variant="secondary"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {uploading ? 'Uploading…' : driver.profile_image_path || driver.image_url ? 'Replace photo' : 'Upload photo'}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Starts" value={career.starts} />
        <Stat label="Wins" value={career.wins} />
        <Stat label="Podiums" value={career.podiums} />
        <Stat label="Poles" value={career.poles} />
        <Stat label="Fastest laps" value={career.fastestLaps} />
        <Stat label="Avg finish" value={career.averageFinish?.toFixed(1) ?? '—'} />
        <Stat label="DNFs" value={career.dnfCount} />
        <Stat label="DSQs" value={career.dsqCount} />
      </div>

      {driver.bio && (
        <Card>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {driver.bio}
          </p>
        </Card>
      )}

      {races.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Points trend</CardTitle>
            <Badge tone="accent">{formLabel}</Badge>
          </CardHeader>
          <TrendChart points={trendPoints} />
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Race history</CardTitle>
        </CardHeader>
        {races.length === 0 ? (
          <EmptyState title="No races yet" description="Results will appear here once official races are saved." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-muted)' }}>
                  <th className="pb-2 pr-4">Round</th>
                  <th className="pb-2 pr-4">Date</th>
                  <th className="pb-2 pr-4">Finish</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Points</th>
                  <th className="pb-2 pr-4">Pole</th>
                  <th className="pb-2 pr-4">FL</th>
                  <th className="pb-2 pr-4">Best lap</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {races.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4">{r.events?.round ?? '—'}</td>
                    <td className="py-2 pr-4">{formatDate(r.events?.event_date)}</td>
                    <td className="py-2 pr-4">{r.finish_position ?? '—'}</td>
                    <td className="py-2 pr-4 uppercase">{r.status ?? '—'}</td>
                    <td className="py-2 pr-4">{r.points ?? 0}</td>
                    <td className="py-2 pr-4">{r.earned_pole ? '✓' : ''}</td>
                    <td className="py-2 pr-4">{r.fastest_lap ? '✓' : ''}</td>
                    <td className="py-2 pr-4 font-mono">{formatLapTime(r.best_lap_ms)}</td>
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

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
    </Card>
  )
}
