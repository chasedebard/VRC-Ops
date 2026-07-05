import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getDriver } from '@/services/drivers'
import { computeCareerStats, getDriverHistory } from '@/services/driverProfile'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDate, formatLapTime } from '@/utils/format'
import type { DriverHistoryRow, DriverRow } from '@/types/database'

export default function DriverProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [driver, setDriver] = useState<DriverRow | null | undefined>(undefined)
  const [history, setHistory] = useState<DriverHistoryRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  const career = computeCareerStats(history)
  const races = history
    .filter((h) => h.result_kind === 'race')
    .sort((a, b) => (b.saved_at ?? '').localeCompare(a.saved_at ?? ''))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{driver.display_name}</h1>
        {driver.driver_number != null && <Badge tone="accent">#{driver.driver_number}</Badge>}
        {!driver.is_active && <Badge tone="warning">Inactive</Badge>}
      </div>

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
                    <td className="py-2 pr-4">{formatDate(r.saved_at)}</td>
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
