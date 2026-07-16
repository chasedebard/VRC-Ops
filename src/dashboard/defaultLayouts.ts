import type { VrcRole } from '@/types/database'
import { packTiles } from './gridMath'
import { getTileDefinition } from './registry'
import { TILE_SIZES, type DashboardLayoutDocument } from './types'

/** Role-appropriate starting point, computed on demand — never itself
 *  persisted until the user explicitly saves or resets. Requires tile
 *  modules to already be registered (tiles/index.ts imported once at the
 *  dashboard's entry point) so each tile's own defaultSize is honored. */
export function getDefaultLayout(roles: Set<VrcRole>): DashboardLayoutDocument {
  const isManager = roles.has('owner') || roles.has('admin')
  const isDriver = roles.has('driver')

  const tileTypes = isManager
    ? [
        'administration_summary',
        'upcoming_race',
        'race_weekend_status',
        'championship_standings',
        'participation',
        'required_actions',
      ]
    : isDriver
      ? [
          'upcoming_race',
          'championship_position_summary',
          'recent_performance',
          'points_trend',
          'closest_rival',
          'championship_standings',
        ]
      : ['upcoming_race', 'championship_standings', 'points_trend', 'last_race', 'league_overview']

  const entries = tileTypes.map((tileType) => {
    const def = getTileDefinition(tileType)
    return {
      instanceId: `default-${tileType}`,
      tileType,
      size: def ? TILE_SIZES[def.defaultSize] : TILE_SIZES.medium,
    }
  })

  return { tiles: packTiles(entries), filters: {} }
}
