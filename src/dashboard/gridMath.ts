import type { Layout, LayoutItem } from 'react-grid-layout'
import { getTileDefinition } from './registry'
import { TILE_SIZES, type DashboardTileInstance, type GridSize } from './types'

/** Domain tile instances -> react-grid-layout's Layout, with per-tile min/max
 *  size pulled from the registry so RGL's built-in constraints enforce them
 *  during drag/resize (no custom collision/bounds code needed). */
export function toRglLayout(tiles: DashboardTileInstance[]): Layout {
  return tiles.map((tile) => {
    const def = getTileDefinition(tile.tileType)
    const minSize = def ? TILE_SIZES[def.minSize] : undefined
    const maxSize = def ? TILE_SIZES[def.maxSize] : undefined
    const item: LayoutItem = {
      i: tile.instanceId,
      x: tile.x,
      y: tile.y,
      w: tile.w,
      h: tile.h,
      minW: minSize?.w,
      minH: minSize?.h,
      maxW: maxSize?.w,
      maxH: maxSize?.h,
    }
    return item
  })
}

/** RGL's post-drag/resize layout -> domain tile instances, preserving every
 *  field RGL doesn't know about (tileType, settings). */
export function fromRglLayout(
  layout: Layout,
  tiles: DashboardTileInstance[],
): DashboardTileInstance[] {
  const byId = new Map(tiles.map((t) => [t.instanceId, t]))
  const next: DashboardTileInstance[] = []
  for (const item of layout) {
    const existing = byId.get(item.i)
    if (!existing) continue
    next.push({ ...existing, x: item.x, y: item.y, w: item.w, h: item.h })
  }
  return next
}

interface PackEntry {
  instanceId: string
  tileType: string
  size: GridSize
  settings?: Record<string, unknown>
}

/**
 * Simple left-to-right, top-to-bottom shelf packer for computing a default
 * layout's starting positions (before react-grid-layout's own vertical
 * compactor runs on mount). Not used for drag/resize — RGL owns that.
 */
export function packTiles(entries: PackEntry[], cols = 12): DashboardTileInstance[] {
  let cursorX = 0
  let cursorY = 0
  let rowHeight = 0
  const tiles: DashboardTileInstance[] = []

  for (const entry of entries) {
    const { w, h } = entry.size
    if (cursorX + w > cols) {
      cursorX = 0
      cursorY += rowHeight
      rowHeight = 0
    }
    tiles.push({
      instanceId: entry.instanceId,
      tileType: entry.tileType,
      x: cursorX,
      y: cursorY,
      w,
      h,
      settings: entry.settings ?? {},
    })
    cursorX += w
    rowHeight = Math.max(rowHeight, h)
  }

  return tiles
}
