import type { ComponentType } from 'react'
import type { LeaguePermissions } from '@/permissions/resolver'
import type { DriverRow, EventRow, TrackRow } from '@/types/database'

/**
 * Core data model for the customizable Home dashboard. Kept deliberately
 * decoupled from any single tile's implementation so the tile registry can
 * grow without touching the grid/persistence/eligibility layers.
 */

export type TileSizeKey = 'small' | 'medium' | 'wide' | 'large' | 'full'

export interface GridSize {
  w: number
  h: number
}

/** 12-column base (desktop) grid — sizes adapted from the spec's suggested
 *  model to this project's actual layout rhythm (16px gaps, existing card
 *  grids top out around 4-5 columns at desktop width). */
export const TILE_SIZES: Record<TileSizeKey, GridSize> = {
  small: { w: 3, h: 2 },
  medium: { w: 4, h: 3 },
  wide: { w: 6, h: 3 },
  large: { w: 8, h: 5 },
  full: { w: 12, h: 4 },
}

export const GRID_COLS = { lg: 12, md: 8, sm: 2 } as const
export const GRID_BREAKPOINTS = { lg: 1024, md: 768, sm: 0 } as const
export const GRID_ROW_HEIGHT = 64
export const GRID_MARGIN: [number, number] = [16, 16]

export type TileCategory = 'driver' | 'race' | 'standings' | 'chart' | 'admin' | 'other'

/** Boolean-valued LeaguePermissions flags only — `roles` itself isn't a gate. */
export type PermissionFlag = Exclude<keyof LeaguePermissions, 'roles'>

export interface DashboardTileInstance {
  instanceId: string
  tileType: string
  x: number
  y: number
  w: number
  h: number
  settings: Record<string, unknown>
}

export interface DashboardFilters {
  seasonId?: string
  championshipId?: string
  classId?: string
  regionId?: string
  subSeriesId?: string
}

export interface DashboardLayoutDocument {
  tiles: DashboardTileInstance[]
  filters: DashboardFilters
}

export interface TileEligibilityContext {
  permissions: LeaguePermissions
  hasProAccess: boolean
  featureFlagActive: boolean
}

export interface TileConfigOption {
  value: string
  label: string
}

export interface TileConfigContext {
  drivers: DriverRow[]
  events: EventRow[]
  tracks: TrackRow[]
}

export type TileConfigFieldType = 'select' | 'multiselect' | 'number' | 'toggle'

export interface TileConfigField {
  key: string
  label: string
  type: TileConfigFieldType
  options?: TileConfigOption[] | ((ctx: TileConfigContext) => TileConfigOption[])
  min?: number
  max?: number
  hint?: string
}

export interface TileComponentProps<TSettings extends Record<string, unknown> = Record<string, unknown>> {
  instance: DashboardTileInstance
  settings: TSettings
  filters: DashboardFilters
  editing: boolean
  onUpdateSettings: (patch: Partial<TSettings>) => void
}

export interface TileDefinition<TSettings extends Record<string, unknown> = Record<string, unknown>> {
  type: string
  displayName: string
  description: string
  icon: ComponentType<{ className?: string }>
  category: TileCategory
  supportedSizes: TileSizeKey[]
  defaultSize: TileSizeKey
  minSize: TileSizeKey
  maxSize: TileSizeKey
  allowMultipleInstances: boolean
  /** Non-removable in edit mode — only the critical alerts tile qualifies. */
  mandatory?: boolean
  requiredPermission?: PermissionFlag
  requiresPro?: boolean
  defaultSettings: TSettings
  configSchema?: TileConfigField[]
  Component: ComponentType<TileComponentProps<TSettings>>
}

export type AnyTileDefinition = TileDefinition<Record<string, unknown>>
