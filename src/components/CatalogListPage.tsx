import { useEffect, useState } from 'react'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'

interface CatalogRow {
  id: string
  league_id: string
  name: string
  abbreviation: string | null
  is_active: boolean
}

interface CatalogService<T extends CatalogRow> {
  list(leagueId: string): Promise<T[]>
  create(draft: { league_id: string; name: string; abbreviation?: string }): Promise<T>
  setActive(id: string, isActive: boolean): Promise<void>
}

export function CatalogListPage<T extends CatalogRow>({
  title,
  service,
}: {
  title: string
  service: CatalogService<T>
}) {
  const { selectedLeague, permissions } = useLeagueSession()
  const [items, setItems] = useState<T[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [abbreviation, setAbbreviation] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!selectedLeague) return
    setError(null)
    try {
      setItems(await service.list(selectedLeague.league.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not load ${title.toLowerCase()}.`)
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
      await service.create({ league_id: selectedLeague.league.id, name, abbreviation })
      setName('')
      setAbbreviation('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create.')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(item: T) {
    setBusy(true)
    try {
      await service.setActive(item.id, !item.is_active)
      await load()
    } finally {
      setBusy(false)
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (items === null) return <LoadingState />

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{title}</h1>

      {permissions.canManageMembers && (
        <Card>
          <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Field
              label="Abbreviation"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
            />
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Adding…' : 'Add'}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {title} ({items.length})
          </CardTitle>
        </CardHeader>
        {items.length === 0 ? (
          <EmptyState title={`No ${title.toLowerCase()} yet`} />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  {item.name} {item.abbreviation ? `(${item.abbreviation})` : ''}
                </span>
                <div className="flex items-center gap-2">
                  {!item.is_active && <Badge tone="warning">Inactive</Badge>}
                  {permissions.canManageMembers && (
                    <Button variant="secondary" onClick={() => toggle(item)} disabled={busy}>
                      {item.is_active ? 'Set inactive' : 'Set active'}
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
