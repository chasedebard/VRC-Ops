import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import {
  activateSeason,
  createSeason,
  deleteChampionshipWithSeasons,
  getChampionship,
  getSeasons,
} from '@/services/championships'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { ChampionshipRow, SeasonRow } from '@/types/database'

export default function ChampionshipDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { selectedLeague, permissions } = useLeagueSession()
  const [championship, setChampionship] = useState<ChampionshipRow | null>(null)
  const [seasons, setSeasons] = useState<SeasonRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!id) return
    setError(null)
    try {
      const [c, s] = await Promise.all([getChampionship(id), getSeasons(id)])
      setChampionship(c)
      setSeasons(s)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load championship.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleCreateSeason(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !selectedLeague) return
    setBusy(true)
    try {
      await createSeason({ championship_id: id, league_id: selectedLeague.league.id, name, year })
      setShowCreate(false)
      setName('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create season.')
    } finally {
      setBusy(false)
    }
  }

  async function handleActivate(seasonId: string) {
    setBusy(true)
    try {
      await activateSeason(seasonId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not activate season.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!id) return
    if (!confirm('Delete this championship and all its seasons? This cannot be undone.')) return
    setBusy(true)
    try {
      await deleteChampionshipWithSeasons(id)
      navigate('/championships')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete championship.')
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (championship === null || seasons === null) return <LoadingState />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{championship.name}</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {championship.series_name}
          </p>
        </div>
        <Badge tone={championship.status === 'active' ? 'success' : 'neutral'}>{championship.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Seasons</CardTitle>
          {permissions.canManageMembers && (
            <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New season'}</Button>
          )}
        </CardHeader>

        {showCreate && (
          <form onSubmit={handleCreateSeason} className="mb-4 grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Field
              label="Year"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </form>
        )}

        {seasons.length === 0 ? (
          <EmptyState title="No seasons yet" description="Create a season to start scheduling events." />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {seasons.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link to={`/seasons/${s.id}`} className="font-medium hover:underline">
                  {s.name} {s.year ? `(${s.year})` : ''}
                </Link>
                <div className="flex items-center gap-2">
                  {s.is_active && <Badge tone="success">Active</Badge>}
                  <Badge>{s.status}</Badge>
                  {permissions.canManageMembers && !s.is_active && (
                    <Button variant="secondary" onClick={() => handleActivate(s.id)} disabled={busy}>
                      Set active
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {permissions.canManageMembers && (
        <Card style={{ borderColor: 'var(--color-danger)' }}>
          <CardHeader>
            <CardTitle style={{ color: 'var(--color-danger)' }}>Danger zone</CardTitle>
          </CardHeader>
          <Button variant="danger" onClick={handleDelete} disabled={busy}>
            Delete championship
          </Button>
        </Card>
      )}
    </div>
  )
}
