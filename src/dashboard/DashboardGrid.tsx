import { useState, type RefObject } from 'react'
import {
  ResponsiveGridLayout,
  cloneLayout,
  getLayoutItem,
  moveElement,
  useContainerWidth,
  verticalCompactor,
  type Breakpoint,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { getTileDefinition } from './registry'
import { TileRenderer } from './TileRenderer'
import { TileConfigPanel } from './TileConfigPanel'
import { fromRglLayout, toRglLayout } from './gridMath'
import { GRID_BREAKPOINTS, GRID_COLS, GRID_MARGIN, GRID_ROW_HEIGHT } from './types'
import type { DashboardFilters, DashboardTileInstance } from './types'

interface DashboardGridProps {
  tiles: DashboardTileInstance[]
  filters: DashboardFilters
  editing: boolean
  onTilesChange: (tiles: DashboardTileInstance[]) => void
  onRemoveTile: (instanceId: string) => void
  onUpdateTileSettings: (instanceId: string, patch: Record<string, unknown>) => void
}

export function DashboardGrid({
  tiles,
  filters,
  editing,
  onTilesChange,
  onRemoveTile,
  onUpdateTileSettings,
}: DashboardGridProps) {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('lg')
  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const reduceMotion = usePrefersReducedMotion()
  const { width, containerRef, mounted } = useContainerWidth()

  // Resize/free drag are only meaningful at the desktop breakpoint — only
  // the `lg` layout is persisted, and narrower breakpoints are a derived
  // reflow (ticket explicitly allows disabling freeform resize on mobile).
  const canEditHere = editing && breakpoint === 'lg'

  function updateOne(instanceId: string, mutate: (layout: Layout, item: LayoutItem) => Layout) {
    const layout = cloneLayout(toRglLayout(tiles))
    const item = getLayoutItem(layout, instanceId)
    if (!item) return
    const next = mutate(layout, item)
    const compacted = verticalCompactor.compact(next, GRID_COLS.lg)
    onTilesChange(fromRglLayout(compacted, tiles))
  }

  function handleMove(instanceId: string, dx: number, dy: number) {
    updateOne(instanceId, (layout, item) => {
      const nextX = Math.max(0, Math.min(GRID_COLS.lg - item.w, item.x + dx))
      const nextY = Math.max(0, item.y + dy)
      return moveElement(layout, item, nextX, nextY, true, false, 'vertical', GRID_COLS.lg)
    })
  }

  function handleResize(instanceId: string, dw: number, dh: number) {
    updateOne(instanceId, (layout, item) => {
      const minW = item.minW ?? 1
      const maxW = item.maxW ?? GRID_COLS.lg
      const minH = item.minH ?? 1
      const maxH = item.maxH ?? 99
      const nextItem = { ...item, w: Math.max(minW, Math.min(maxW, item.w + dw)), h: Math.max(minH, Math.min(maxH, item.h + dh)) }
      nextItem.x = Math.min(nextItem.x, GRID_COLS.lg - nextItem.w)
      return layout.map((l) => (l.i === instanceId ? nextItem : l))
    })
  }

  const configuringTile = tiles.find((t) => t.instanceId === configuringId) ?? null
  const configuringDef = configuringTile ? getTileDefinition(configuringTile.tileType) : null

  return (
    <div ref={containerRef as RefObject<HTMLDivElement>} className={`vrc-dashboard-grid ${reduceMotion ? 'vrc-reduce-motion' : ''}`}>
      {editing && breakpoint !== 'lg' && (
        <p
          className="mb-3 rounded-lg border p-2 text-xs"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          Switch to a wider browser window to reposition or resize tiles. Adding, removing, and
          configuring tiles still works here.
        </p>
      )}
      {mounted && (
        <ResponsiveGridLayout
          width={width}
          layouts={{ lg: toRglLayout(tiles) }}
          breakpoints={GRID_BREAKPOINTS}
          cols={GRID_COLS}
          rowHeight={GRID_ROW_HEIGHT}
          margin={GRID_MARGIN}
          dragConfig={{ enabled: canEditHere, handle: '.vrc-tile-drag-handle', threshold: 3 }}
          resizeConfig={{ enabled: canEditHere }}
          onBreakpointChange={(next) => setBreakpoint(next)}
          onLayoutChange={(_layout, layouts) => {
            if (layouts.lg) onTilesChange(fromRglLayout(layouts.lg, tiles))
          }}
        >
          {tiles.map((tile) => (
            <div key={tile.instanceId}>
              <TileRenderer
                instance={tile}
                filters={filters}
                editing={editing}
                onUpdateSettings={(patch) => onUpdateTileSettings(tile.instanceId, patch)}
                onConfigure={() => setConfiguringId(tile.instanceId)}
                onRemove={() => onRemoveTile(tile.instanceId)}
                onMove={(dx, dy) => handleMove(tile.instanceId, dx, dy)}
                onResize={(dw, dh) => handleResize(tile.instanceId, dw, dh)}
              />
            </div>
          ))}
        </ResponsiveGridLayout>
      )}

      {configuringTile && configuringDef?.configSchema && (
        <TileConfigPanel
          title={configuringDef.displayName}
          fields={configuringDef.configSchema}
          settings={{ ...configuringDef.defaultSettings, ...configuringTile.settings }}
          onSave={(settings) => {
            onUpdateTileSettings(configuringTile.instanceId, settings)
            setConfiguringId(null)
          }}
          onClose={() => setConfiguringId(null)}
        />
      )}
    </div>
  )
}
