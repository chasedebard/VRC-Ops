import { getTileDefinition } from './registry'
import type { AnyTileDefinition, DashboardTileInstance, TileEligibilityContext } from './types'

/**
 * Role/feature-flag gate: should this tile be offered at all (shown in the
 * Add-Tile library, kept in a loaded layout)? Pro-gating is deliberately
 * separate (see isTileLocked) — a Pro-only tile stays visible-but-locked,
 * matching the existing ProGate/DriverComparisonTile pattern elsewhere on
 * the dashboard, rather than disappearing.
 */
export function isTileAvailable(tile: AnyTileDefinition, ctx: TileEligibilityContext): boolean {
  if (!ctx.featureFlagActive) return false
  if (tile.requiredPermission && !ctx.permissions[tile.requiredPermission]) return false
  return true
}

export function isTileLocked(tile: AnyTileDefinition, ctx: TileEligibilityContext): boolean {
  return Boolean(tile.requiresPro) && !ctx.hasProAccess
}

/**
 * Drops tiles whose type no longer exists in the registry, or that the
 * current user is no longer role-eligible for (e.g. a saved Administration
 * Summary tile surviving a demotion from admin to driver) — never the whole
 * dashboard. Pro-locked tiles are kept (they render ProLockedState instead).
 */
export function sanitizeLayoutTiles(
  tiles: DashboardTileInstance[],
  ctx: TileEligibilityContext,
): DashboardTileInstance[] {
  return tiles.filter((instance) => {
    const def = getTileDefinition(instance.tileType)
    return Boolean(def) && isTileAvailable(def!, ctx)
  })
}
