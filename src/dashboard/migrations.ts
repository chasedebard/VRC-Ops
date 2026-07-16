import type { DashboardLayoutDocument, DashboardTileInstance } from './types'

export const CURRENT_SCHEMA_VERSION = 1

/**
 * Validates + (when needed) migrates a raw `dashboard_configs.layout` value
 * up to CURRENT_SCHEMA_VERSION. Returns null on anything unrecognizable —
 * callers must fall back to the computed role-default layout rather than
 * ever surfacing a raw shape error. No migrations exist yet beyond v1's own
 * validation; this is the slot future tile-shape changes use.
 */
export function migrateLayoutDocument(raw: unknown, fromVersion: number): DashboardLayoutDocument | null {
  if (!Number.isFinite(fromVersion) || fromVersion > CURRENT_SCHEMA_VERSION) return null
  // future: if (fromVersion < 2) raw = migrateV1ToV2(raw)
  return validateLayoutDocument(raw)
}

function validateLayoutDocument(raw: unknown): DashboardLayoutDocument | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  if (!Array.isArray(obj.tiles)) return null

  const tiles: DashboardTileInstance[] = []
  for (const entry of obj.tiles) {
    const tile = validateTileInstance(entry)
    if (tile) tiles.push(tile)
  }

  const filters = obj.filters && typeof obj.filters === 'object' ? (obj.filters as Record<string, unknown>) : {}
  return { tiles, filters }
}

function validateTileInstance(entry: unknown): DashboardTileInstance | null {
  if (!entry || typeof entry !== 'object') return null
  const t = entry as Record<string, unknown>
  if (typeof t.instanceId !== 'string' || typeof t.tileType !== 'string') return null
  if (typeof t.x !== 'number' || typeof t.y !== 'number' || typeof t.w !== 'number' || typeof t.h !== 'number') {
    return null
  }
  return {
    instanceId: t.instanceId,
    tileType: t.tileType,
    x: t.x,
    y: t.y,
    w: t.w,
    h: t.h,
    settings: t.settings && typeof t.settings === 'object' ? (t.settings as Record<string, unknown>) : {},
  }
}
