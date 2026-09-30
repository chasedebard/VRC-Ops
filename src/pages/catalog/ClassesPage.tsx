import { useCallback, useEffect, useState } from 'react'
import { CatalogListPage } from '@/components/CatalogListPage'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { classesService } from '@/services/catalog'
import {
  GT7_CLASS_GROUPS,
  isLeagueGt7,
  listLeagueClasses,
  setGt7LeagueGroups,
  type Gt7GroupKey,
  type LeagueClass,
} from '@/services/setup'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { ClassRow } from '@/types/database'

/**
 * Gran Turismo 7 leagues never author free-form classes: the six groups (Gr.B, Gr.4, Gr.3, Gr.2, Gr.1, Gr.X) are
 * system-controlled and a league selects the subset it races. The backend blocks direct `classes` writes for GT7
 * leagues (RLS) and exposes `vrc_set_gt7_league_groups` instead, so this page is a group picker, not a free-text list.
 * Leagues on other games keep the regular free-form class catalog.
 */
export default function ClassesPage() {
  const { selectedLeague } = useLeagueSession()
  const leagueId = selectedLeague?.league.id
  const [isGt7, setIsGt7] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId) return
    setIsGt7(null)
    isLeagueGt7(leagueId)
      .then(setIsGt7)
      .catch((err) => setError(backendErrorMessage(err, 'Could not load classes.')))
  }, [leagueId])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} />
  if (isGt7 === null) return <LoadingState />
  if (isGt7) return <Gt7GroupsPage leagueId={selectedLeague.league.id} />
  return <CatalogListPage<ClassRow> title="Classes" service={classesService} />
}

function Gt7GroupsPage({ leagueId }: { leagueId: string }) {
  const { permissions } = useLeagueSession()
  const [classes, setClasses] = useState<LeagueClass[] | null>(null)
  const [selected, setSelected] = useState<Set<Gt7GroupKey>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const rows = await listLeagueClasses(leagueId)
      setClasses(rows)
      setSelected(
        new Set(
          rows
            .filter((c) => c.is_system && c.system_selected && c.system_key)
            .map((c) => c.system_key as Gt7GroupKey),
        ),
      )
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load GT7 groups.'))
    }
  }, [leagueId])

  useEffect(() => {
    void load()
  }, [load])

  function toggle(key: Gt7GroupKey) {
    setSaved(false)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await setGt7LeagueGroups(leagueId, Array.from(selected))
      setSaved(true)
      await load()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not save the GT7 groups.'))
    } finally {
      setBusy(false)
    }
  }

  if (classes === null && !error) return <LoadingState />
  if (error && classes === null) return <ErrorState message={error} onRetry={load} />

  const legacy = (classes ?? []).filter((c) => !c.is_system && c.system_key)
  const canManage = permissions.canManageSetup

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Classes</h1>
      <Card>
        <CardHeader>
          <CardTitle>GT7 groups</CardTitle>
          <Badge tone="neutral">{selected.size} selected</Badge>
        </CardHeader>
        <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Gran Turismo 7 leagues race the fixed GT7 groups. Choose which groups your league uses — at least one, up to all
          six. Existing results always keep their class.
        </p>
        <ul className="space-y-2">
          {GT7_CLASS_GROUPS.map((group) => (
            <li key={group.key}>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(group.key)}
                  disabled={!canManage || busy}
                  onChange={() => toggle(group.key)}
                />
                <span>
                  <span className="font-medium">{group.key}</span>
                  <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {group.summary}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {error && (
          <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
        {canManage ? (
          <div className="mt-4 flex items-center gap-3">
            <Button onClick={save} disabled={busy || selected.size === 0}>
              {busy ? 'Saving…' : 'Save groups'}
            </Button>
            {saved && <span className="text-sm" style={{ color: 'var(--color-success)' }}>Saved.</span>}
          </div>
        ) : (
          <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Only Owners and Admins can change the league&apos;s GT7 groups.
          </p>
        )}
      </Card>

      {legacy.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Legacy sub-classes</CardTitle>
          </CardHeader>
          <p className="mb-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            These custom classes were created before groups became fixed. They keep working and map to a GT7 group.
          </p>
          <ul className="divide-y text-sm" style={{ borderColor: 'var(--color-border)' }}>
            {legacy.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <span>{c.name}</span>
                <Badge tone="neutral">{c.system_key}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
