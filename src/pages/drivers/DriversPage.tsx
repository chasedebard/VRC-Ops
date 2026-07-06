import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { createDriver, getDrivers, setDriverActive } from '@/services/drivers'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { DriverRow } from '@/types/database'

export default function DriversPage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showInactive, setShowInactive] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!selectedLeague) return
    setError(null)
    try {
      setDrivers(await getDrivers(selectedLeague.league.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load drivers.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.league.id])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedLeague) return
    setBusy(true)
    try {
      await createDriver({ league_id: selectedLeague.league.id, display_name: name })
      setName('')
      setShowCreate(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create driver.')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(driver: DriverRow) {
    setBusy(true)
    try {
      await setDriverActive(driver.id, !driver.is_active)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update driver.')
    } finally {
      setBusy(false)
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (drivers === null) return <LoadingState />

  const visible = showInactive ? drivers : drivers.filter((d) => d.is_active)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Drivers</h1>
        {permissions.canManageMembers && (
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New driver'}</Button>
        )}
      </div>

      {showCreate && (
        <Card>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Display name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Adding…' : 'Add driver'}
            </Button>
          </form>
        </Card>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Show inactive drivers
      </label>

      <Card>
        <CardHeader>
          <CardTitle>Roster ({visible.length})</CardTitle>
        </CardHeader>
        {visible.length === 0 ? (
          <EmptyState title="No drivers yet" description="Add drivers to build your league roster." />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {visible.map((driver) => (
              <li key={driver.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link to={`/drivers/${driver.id}`} className="flex items-center gap-3 font-medium hover:underline">
                  <DriverAvatar driver={driver} size="sm" />
                  {driver.display_name}
                  {driver.driver_number != null ? ` #${driver.driver_number}` : ''}
                </Link>
                <div className="flex items-center gap-2">
                  {!driver.is_active && <Badge tone="warning">Inactive</Badge>}
                  {permissions.canManageMembers && (
                    <Button variant="secondary" onClick={() => toggleActive(driver)} disabled={busy}>
                      {driver.is_active ? 'Set inactive' : 'Set active'}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
