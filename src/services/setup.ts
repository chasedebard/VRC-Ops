import { supabase } from '@/supabase/client'
import type { ClassRow, GameId, RegionRow } from '@/types/database'

/** Canonical Gran Turismo 7 groups, in display order (VRCGT7ClassGroup.allCases). */
export const GT7_CLASS_GROUPS = [
  { key: 'Gr.B', summary: 'Group B rally cars' },
  { key: 'Gr.4', summary: 'GT4-class racing cars' },
  { key: 'Gr.3', summary: 'GT3-class racing cars' },
  { key: 'Gr.2', summary: 'Super GT / GT500-class cars' },
  { key: 'Gr.1', summary: 'LMP / Le Mans-class prototypes' },
  { key: 'Gr.X', summary: 'Road cars, Vision GT, karts and everything uncategorised' },
] as const

export type Gt7GroupKey = (typeof GT7_CLASS_GROUPS)[number]['key']

export type LeagueClass = ClassRow
export type LeagueRegion = RegionRow

export async function listLeagueClasses(leagueId: string): Promise<LeagueClass[]> {
  const { data, error } = await supabase
    .from('classes')
    .select('*')
    .eq('league_id', leagueId)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
    .returns<LeagueClass[]>()
  if (error) throw error
  return data ?? []
}

export async function listLeagueRegions(leagueId: string): Promise<LeagueRegion[]> {
  const { data, error } = await supabase
    .from('regions')
    .select('*')
    .eq('league_id', leagueId)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })
    .returns<LeagueRegion[]>()
  if (error) throw error
  return data ?? []
}

/**
 * The GT7 season/championship class picker list (mirror of `gt7SelectedGroupPickerItems`): currently-selected
 * mapped rows only, in canonical group order — system rows before legacy sub-classes within a group.
 */
export function gt7SelectedGroupPickerItems(classes: LeagueClass[]): { id: string; label: string }[] {
  const order = (key: string | null) => {
    const idx = GT7_CLASS_GROUPS.findIndex((g) => g.key === key)
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
  }
  return classes
    .filter((c) => c.system_selected && c.system_key)
    .sort((a, b) => {
      const l = order(a.system_key)
      const r = order(b.system_key)
      if (l !== r) return l - r
      if (a.is_system !== b.is_system) return a.is_system ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .map((c) => ({ id: c.id, label: c.is_system ? (c.system_key as string) : `${c.name} · ${c.system_key}` }))
}

export interface Gt7GroupSelectionRow {
  system_key: string
  class_id: string
  name: string
  is_system: boolean
  selected: boolean
}

/**
 * Replace a GT7 league's selected canonical groups. The server creates a canonical `classes` row for a
 * newly-selected group, toggles `system_selected` for the rest, never deletes a row, and keeps Pit Wall car
 * eligibility in sync. Direct `classes` writes are blocked by RLS for GT7 leagues, so this RPC is the only path.
 */
export async function setGt7LeagueGroups(leagueId: string, groups: Gt7GroupKey[]): Promise<Gt7GroupSelectionRow[]> {
  const ordered = GT7_CLASS_GROUPS.map((g) => g.key).filter((k) => groups.includes(k))
  const { data, error } = await supabase.rpc('vrc_set_gt7_league_groups', {
    p_league: leagueId,
    p_groups: ordered,
  })
  if (error) throw error
  return (data ?? []) as Gt7GroupSelectionRow[]
}

export interface ChampionshipSeasonInput {
  leagueId: string
  championshipName: string
  seriesName: string | null
  description: string | null
  game: GameId
  usesClasses: boolean
  usesRegions: boolean
  seasonName: string
  year: number | null
  /** YYYY-MM-DD */
  startDate: string | null
  endDate: string | null
  notes: string | null
  classIds: string[]
  regionIds: string[]
}

/** Transactional championship + first season creation (`vrc_create_championship_season`). */
export async function createChampionshipWithSeason(
  input: ChampionshipSeasonInput,
): Promise<{ championshipId: string; seasonId: string }> {
  const { data, error } = await supabase.rpc('vrc_create_championship_season', {
    p_league: input.leagueId,
    p_champ_name: input.championshipName,
    p_series: input.seriesName,
    p_description: input.description,
    p_game: input.game,
    p_uses_classes: input.usesClasses,
    p_uses_regions: input.usesRegions,
    p_season_name: input.seasonName,
    p_year: input.year,
    p_start: input.startDate,
    p_end: input.endDate,
    p_notes: input.notes,
    p_class_ids: input.classIds,
    p_region_ids: input.regionIds,
  })
  if (error) throw error
  const row = (data as { championship_id: string; season_id: string }[] | null)?.[0]
  if (!row) throw new Error('Setup returned no result.')
  return { championshipId: row.championship_id, seasonId: row.season_id }
}

/** Marks a pending league as fully set up (owner only). */
export async function completeLeagueSetup(leagueId: string): Promise<void> {
  const { error } = await supabase.rpc('vrc_complete_league_setup', { p_league: leagueId })
  if (error) throw error
}

/** Deletes a league that never finished guided setup (no championship/season yet, so nothing is lost). */
export async function deletePendingLeague(leagueId: string): Promise<void> {
  const { error } = await supabase.rpc('vrc_delete_pending_league', { p_league: leagueId })
  if (error) throw error
}

// ---- Season structure (classes / regions) ---------------------------------------------------

export async function getSeasonClassIds(seasonId: string): Promise<string[]> {
  const { data, error } = await supabase.from('season_classes').select('class_id').eq('season_id', seasonId)
  if (error) throw error
  return (data ?? []).map((r: { class_id: string }) => r.class_id)
}

export async function getSeasonRegionIds(seasonId: string): Promise<string[]> {
  const { data, error } = await supabase.from('season_regions').select('region_id').eq('season_id', seasonId)
  if (error) throw error
  return (data ?? []).map((r: { region_id: string }) => r.region_id)
}

/** Replaces the season's class set (delete-all then insert), matching the iOS `setSeasonClasses` behavior. */
export async function setSeasonClasses(seasonId: string, leagueId: string, classIds: string[]): Promise<void> {
  const del = await supabase.from('season_classes').delete().eq('season_id', seasonId)
  if (del.error) throw del.error
  if (classIds.length > 0) {
    const ins = await supabase
      .from('season_classes')
      .insert(classIds.map((class_id) => ({ season_id: seasonId, class_id, league_id: leagueId })))
    if (ins.error) throw ins.error
  }
}

export async function setSeasonRegions(seasonId: string, leagueId: string, regionIds: string[]): Promise<void> {
  const del = await supabase.from('season_regions').delete().eq('season_id', seasonId)
  if (del.error) throw del.error
  if (regionIds.length > 0) {
    const ins = await supabase
      .from('season_regions')
      .insert(regionIds.map((region_id) => ({ season_id: seasonId, region_id, league_id: leagueId })))
    if (ins.error) throw ins.error
  }
}

/** True when the league runs Gran Turismo 7 — its racing classes are the six canonical groups, not free-form. */
export async function isLeagueGt7(leagueId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('vrc_league_is_gt7', { p_league: leagueId })
  if (error) throw error
  return Boolean(data)
}
