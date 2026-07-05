import { useEffect, useRef, useState } from 'react'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { bulkImportTracks, createTrack, getTracks, type TrackImportRow } from '@/services/tracks'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { GameId, TrackRow } from '@/types/database'

const GAME_OPTIONS: { value: GameId; label: string }[] = [
  { value: 'gran_turismo_7', label: 'Gran Turismo 7' },
  { value: 'iracing', label: 'iRacing' },
  { value: 'nascar', label: 'NASCAR' },
  { value: 'forza_horizon', label: 'Forza Horizon' },
  { value: 'formula_1', label: 'F1' },
]

function parseTrackCsv(text: string): TrackImportRow[] {
  const lines = text.trim().split(/\r?\n/)
  const [header, ...rows] = lines
  const columns = header.split(',').map((c) => c.trim().toLowerCase())
  return rows
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const cells = line.split(',').map((c) => c.trim())
      const record: Record<string, string> = {}
      columns.forEach((col, i) => (record[col] = cells[i] ?? ''))
      return {
        name: record.name,
        layout: record.layout || undefined,
        in_game_name: record.in_game_name || undefined,
        country: record.country || undefined,
        length: record.length ? Number(record.length) : undefined,
        length_unit: record.length_unit || undefined,
      }
    })
    .filter((row) => row.name)
}

export default function TracksPage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const [game, setGame] = useState<GameId>('gran_turismo_7')
  const [tracks, setTracks] = useState<TrackRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [layout, setLayout] = useState('')
  const [busy, setBusy] = useState(false)
  const [importMessage, setImportMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    if (!selectedLeague) return
    setError(null)
    try {
      setTracks(await getTracks(game, selectedLeague.league.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load tracks.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, selectedLeague?.league.id])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedLeague) return
    setBusy(true)
    try {
      await createTrack(game, { league_id: selectedLeague.league.id, name, layout: layout || null })
      setName('')
      setLayout('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add track.')
    } finally {
      setBusy(false)
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !selectedLeague) return
    setBusy(true)
    setImportMessage(null)
    try {
      const text = await file.text()
      const rows = parseTrackCsv(text)
      const count = await bulkImportTracks(game, selectedLeague.league.id, rows)
      setImportMessage(`Imported ${count} track(s).`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not import tracks.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tracks</h1>

      <div className="flex flex-wrap gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--color-border)' }}>
        {GAME_OPTIONS.map((g) => (
          <button
            key={g.value}
            onClick={() => setGame(g.value)}
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={{
              backgroundColor: game === g.value ? 'var(--color-accent)' : 'transparent',
              color: game === g.value ? 'var(--color-accent-contrast)' : 'var(--color-text)',
            }}
          >
            {g.label}
          </button>
        ))}
      </div>

      {permissions.canManageMembers && (
        <Card>
          <CardHeader>
            <CardTitle>Add a track</CardTitle>
          </CardHeader>
          <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Field label="Layout" value={layout} onChange={(e) => setLayout(e.target.value)} />
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Adding…' : 'Add track'}
            </Button>
          </form>
          <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--color-border)' }}>
            <p className="mb-2 text-sm font-medium">Bulk import from CSV</p>
            <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Columns: name, layout, in_game_name, country, length, length_unit
            </p>
            <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFile} className="text-sm" />
            {importMessage && <p className="mt-2 text-sm" style={{ color: 'var(--color-success)' }}>{importMessage}</p>}
          </div>
        </Card>
      )}

      {error && <ErrorState message={error} onRetry={load} />}
      {tracks === null ? (
        <LoadingState />
      ) : tracks.length === 0 ? (
        <EmptyState title="No tracks yet" description="Add tracks individually or bulk-import a CSV." />
      ) : (
        <Card>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {tracks.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {t.name} {t.layout ? `– ${t.layout}` : ''}
                </span>
                <span style={{ color: 'var(--color-text-muted)' }}>
                  {t.league_id ? 'League' : 'Shared'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
