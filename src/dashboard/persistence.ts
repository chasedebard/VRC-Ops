import { deleteDashboardConfig, getDashboardConfig, saveDashboardConfig } from '@/services/dashboardConfig'
import { CURRENT_SCHEMA_VERSION, migrateLayoutDocument } from './migrations'
import type { DashboardLayoutDocument } from './types'

/**
 * Supabase is always the source of truth; localStorage is only a short-lived
 * paint cache keyed by (user, league) so a repeat visit doesn't show a
 * loading flash while the network round-trip resolves. Every cache read is
 * re-validated through the same migration/validation pipeline as a live
 * Supabase load, and a cached value is never trusted over a fresh one.
 */

function cacheKey(userId: string, leagueId: string): string {
  return `vrc-dashboard:${userId}:${leagueId}`
}

export function readCachedLayout(userId: string, leagueId: string): DashboardLayoutDocument | null {
  try {
    const raw = localStorage.getItem(cacheKey(userId, leagueId))
    if (!raw) return null
    return migrateLayoutDocument(JSON.parse(raw), CURRENT_SCHEMA_VERSION)
  } catch {
    return null
  }
}

function writeCachedLayout(userId: string, leagueId: string, doc: DashboardLayoutDocument): void {
  try {
    localStorage.setItem(cacheKey(userId, leagueId), JSON.stringify(doc))
  } catch {
    // best-effort cache only — quota errors, private browsing, etc. are fine to ignore
  }
}

export function clearCachedLayout(userId: string, leagueId: string): void {
  try {
    localStorage.removeItem(cacheKey(userId, leagueId))
  } catch {
    // ignore
  }
}

/** Returns null when there's no saved layout yet, or the saved one couldn't
 *  be validated/migrated — either way the caller falls back to the computed
 *  role-default layout. */
export async function loadDashboardLayout(userId: string, leagueId: string): Promise<DashboardLayoutDocument | null> {
  const row = await getDashboardConfig(userId, leagueId)
  if (!row) return null
  const migrated = migrateLayoutDocument(row.layout, row.schema_version)
  if (migrated) writeCachedLayout(userId, leagueId, migrated)
  return migrated
}

export async function persistDashboardLayout(
  userId: string,
  leagueId: string,
  doc: DashboardLayoutDocument,
): Promise<void> {
  writeCachedLayout(userId, leagueId, doc)
  await saveDashboardConfig(userId, leagueId, doc, CURRENT_SCHEMA_VERSION)
}

/** "Reset to Default" clears the saved row entirely (not an empty layout) so
 *  the next load computes the current role-default from scratch. */
export async function resetDashboardLayout(userId: string, leagueId: string): Promise<void> {
  clearCachedLayout(userId, leagueId)
  await deleteDashboardConfig(userId, leagueId)
}
