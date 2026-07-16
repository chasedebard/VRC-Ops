import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useEntitlement } from '@/hooks/useEntitlement'
import { Button } from '@/components/Button'
import { LoadingState, EmptyState } from '@/components/States'
import { ROLE_LABEL } from '@/permissions/resolver'
import '@/dashboard/tiles'
import { DashboardDataProvider } from '@/dashboard/DashboardDataProvider'
import { DashboardGrid } from '@/dashboard/DashboardGrid'
import { AddTileLibrary } from '@/dashboard/AddTileLibrary'
import { getDefaultLayout } from '@/dashboard/defaultLayouts'
import { sanitizeLayoutTiles } from '@/dashboard/eligibility'
import { loadDashboardLayout, persistDashboardLayout, readCachedLayout, resetDashboardLayout } from '@/dashboard/persistence'
import { TILE_SIZES, type AnyTileDefinition, type DashboardLayoutDocument } from '@/dashboard/types'

export default function CustomizableDashboardPage() {
  const { state } = useAuth()
  const { selectedLeague, permissions } = useLeagueSession()
  const { hasAccess } = useEntitlement()
  const userId = state.kind === 'authenticated' ? state.user.id : null
  const leagueId = selectedLeague?.league.id ?? null

  const [savedLayout, setSavedLayout] = useState<DashboardLayoutDocument | null | undefined>(undefined)
  const [draft, setDraft] = useState<DashboardLayoutDocument | null>(null)
  const [editing, setEditing] = useState(false)
  const [addingTile, setAddingTile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const eligibilityCtx = { permissions, hasProAccess: hasAccess, featureFlagActive: true }

  useEffect(() => {
    if (!userId || !leagueId) return
    let cancelled = false
    setSavedLayout(undefined)
    setEditing(false)

    const cached = readCachedLayout(userId, leagueId)
    if (cached) setSavedLayout(cached)

    loadDashboardLayout(userId, leagueId)
      .then((loaded) => {
        if (cancelled) return
        setSavedLayout(loaded)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled && !cached) setSavedLayout(null)
      })

    return () => {
      cancelled = true
    }
  }, [userId, leagueId])

  if (!selectedLeague || !userId) return <EmptyState title="No league selected" />
  if (savedLayout === undefined) return <LoadingState />

  const roles = new Set(selectedLeague.roles)
  const resolvedSaved = savedLayout ?? getDefaultLayout(roles)
  const activeLayout = editing && draft ? draft : { ...resolvedSaved, tiles: sanitizeLayoutTiles(resolvedSaved.tiles, eligibilityCtx) }

  function startEditing() {
    setDraft({ ...resolvedSaved, tiles: sanitizeLayoutTiles(resolvedSaved.tiles, eligibilityCtx) })
    setEditing(true)
  }

  function cancelEditing() {
    setDraft(null)
    setEditing(false)
  }

  async function saveLayout() {
    if (!draft || !userId || !leagueId) return
    setBusy(true)
    setError(null)
    try {
      await persistDashboardLayout(userId, leagueId, draft)
      setSavedLayout(draft)
      setDraft(null)
      setEditing(false)
    } catch (err) {
      console.error(err)
      setError('Could not save your dashboard layout.')
    } finally {
      setBusy(false)
    }
  }

  async function resetToDefault() {
    if (!userId || !leagueId) return
    setBusy(true)
    setError(null)
    try {
      await resetDashboardLayout(userId, leagueId)
      const fresh = getDefaultLayout(roles)
      setSavedLayout(fresh)
      setDraft(fresh)
    } catch (err) {
      console.error(err)
      setError('Could not reset your dashboard layout.')
    } finally {
      setBusy(false)
    }
  }

  function updateDraftTiles(tiles: DashboardLayoutDocument['tiles']) {
    setDraft((d) => (d ? { ...d, tiles } : d))
  }

  function removeTile(instanceId: string) {
    setDraft((d) => (d ? { ...d, tiles: d.tiles.filter((t) => t.instanceId !== instanceId) } : d))
  }

  function updateTileSettings(instanceId: string, patch: Record<string, unknown>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            tiles: d.tiles.map((t) => (t.instanceId === instanceId ? { ...t, settings: { ...t.settings, ...patch } } : t)),
          }
        : d,
    )
  }

  function addTile(def: AnyTileDefinition) {
    const size = TILE_SIZES[def.defaultSize]
    setDraft((d) =>
      d
        ? {
            ...d,
            tiles: [
              ...d.tiles,
              {
                instanceId: `${def.type}-${Date.now()}`,
                tileType: def.type,
                x: 0,
                y: Infinity,
                w: size.w,
                h: size.h,
                settings: {},
              },
            ],
          }
        : d,
    )
    setAddingTile(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{selectedLeague.league.name}</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Signed in as {selectedLeague.roles.map((r) => ROLE_LABEL[r]).join(' · ')}
          </p>
        </div>
        {!editing ? (
          <Button variant="secondary" onClick={startEditing}>
            Customize Dashboard
          </Button>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setAddingTile(true)}>
              Add Tile
            </Button>
            <Button variant="secondary" onClick={resetToDefault} disabled={busy}>
              Reset to Default
            </Button>
            <Button variant="secondary" onClick={cancelEditing} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={saveLayout} disabled={busy}>
              {busy ? 'Saving…' : 'Save Layout'}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      {activeLayout.tiles.length === 0 ? (
        <EmptyState
          title="Your dashboard is empty"
          description="Use Customize Dashboard to add tiles."
          action={
            !editing ? (
              <Button variant="secondary" onClick={startEditing}>
                Customize Dashboard
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DashboardDataProvider leagueId={selectedLeague.league.id}>
          <DashboardGrid
            tiles={activeLayout.tiles}
            filters={activeLayout.filters}
            editing={editing}
            onTilesChange={updateDraftTiles}
            onRemoveTile={removeTile}
            onUpdateTileSettings={updateTileSettings}
          />
        </DashboardDataProvider>
      )}

      {addingTile && (
        <AddTileLibrary currentTiles={activeLayout.tiles} onAdd={addTile} onClose={() => setAddingTile(false)} />
      )}
    </div>
  )
}
