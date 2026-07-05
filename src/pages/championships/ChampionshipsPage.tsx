import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { createChampionship, getChampionships } from '@/services/championships'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { ChampionshipRow, GameId } from '@/types/database'

const GAME_OPTIONS: { value: GameId; label: string }[] = [
  { value: 'gran_turismo_7', label: 'Gran Turismo 7' },
  { value: 'iracing', label: 'iRacing' },
  { value: 'nascar', label: 'NASCAR' },
  { value: 'forza_horizon', label: 'Forza Horizon' },
  { value: 'formula_1', label: 'F1' },
]

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning'> = {
  draft: 'neutral',
  active: 'success',
  paused: 'warning',
  completed: 'neutral',
  archived: 'neutral',
}

export default function ChampionshipsPage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const [championships, setChampionships] = useState<ChampionshipRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [game, setGame] = useState<GameId>('gran_turismo_7')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!selectedLeague) return
    setError(null)
    try {
      setChampionships(await getChampionships(selectedLeague.league.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load championships.')
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
      await createChampionship({ league_id: selectedLeague.league.id, name, game_id: game })
      setName('')
      setShowCreate(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create championship.')
    } finally {
      setBusy(false)
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (championships === null) return <LoadingState />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Championships</h1>
        {permissions.canManageMembers && (
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New championship'}</Button>
        )}
      </div>

      {showCreate && (
        <Card>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Game</span>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                value={game}
                onChange={(e) => setGame(e.target.value as GameId)}
              >
                {GAME_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </form>
        </Card>
      )}

      {championships.length === 0 ? (
        <EmptyState
          title="No championships yet"
          description="Create a championship to start structuring seasons and races."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {championships.map((c) => (
            <Link key={c.id} to={`/championships/${c.id}`}>
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                </CardHeader>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {c.series_name || GAME_OPTIONS.find((g) => g.value === c.game_id)?.label}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
