import { supabase } from '@/supabase/client'
import type { LeagueRow, MembershipRoleRow, MembershipRow, VrcRole } from '@/types/database'

export interface MyLeagueMembership {
  league: LeagueRow
  membershipId: string
  roles: VrcRole[]
}

/**
 * Every league the signed-in user is an active member of, with their role set.
 * Must filter by `user_id` explicitly — RLS on `memberships` allows reading
 * every co-league member's row (for member-management screens), not just the
 * caller's own, so omitting this filter returns one row per *member of every
 * shared league*, not one row per *league the caller belongs to*.
 */
export async function getMyLeagues(userId: string): Promise<MyLeagueMembership[]> {
  const { data: memberships, error } = await supabase
    .from('memberships')
    .select(
      // Explicit FK hint (same as iOS' VRCMembershipRepository.membershipColumns): league_plus_seats has FKs to
      // both tables, so a bare `leagues(*)` embed is one schema change away from PGRST201 ambiguity.
      'id, league_id, status, leagues:leagues!memberships_league_id_fkey(*), membership_roles(role)',
    )
    .eq('status', 'active')
    .eq('user_id', userId)
    .returns<
      (MembershipRow & { leagues: LeagueRow; membership_roles: Pick<MembershipRoleRow, 'role'>[] })[]
    >()
  if (error) throw error

  return sortLeaguesByName(
    (memberships ?? []).map((m) => ({
      league: m.leagues,
      membershipId: m.id,
      roles: m.membership_roles.map((r) => r.role),
    })),
  )
}

/** Same order as iOS (league name, case-insensitive) so "the first league" is the same one on every platform. */
export function sortLeaguesByName<T extends { league: { name: string } }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.league.name.localeCompare(b.league.name, undefined, { sensitivity: 'base' }))
}

export async function createLeague(name: string, abbreviation: string): Promise<string> {
  const { data, error } = await supabase.rpc('vrc_create_league', {
    p_name: name,
    p_abbreviation: abbreviation,
  })
  if (error) throw error
  return data as string
}

export interface MemberSummary {
  membershipId: string
  userId: string
  displayName: string | null
  roles: VrcRole[]
  status: string
}

export async function getLeagueMembers(leagueId: string): Promise<MemberSummary[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, user_id, status, profiles(display_name), membership_roles(role)')
    .eq('league_id', leagueId)
    .returns<
      {
        id: string
        user_id: string
        status: string
        profiles: { display_name: string | null } | null
        membership_roles: { role: VrcRole }[]
      }[]
    >()
  if (error) throw error
  return (data ?? []).map((m) => ({
    membershipId: m.id,
    userId: m.user_id,
    displayName: m.profiles?.display_name ?? null,
    roles: m.membership_roles.map((r) => r.role),
    status: m.status,
  }))
}

export async function addRole(membershipId: string, role: VrcRole): Promise<void> {
  const { error } = await supabase.rpc('vrc_add_role', { p_membership: membershipId, p_role: role })
  if (error) throw error
}

export async function removeRole(membershipId: string, role: VrcRole): Promise<void> {
  const { error } = await supabase.rpc('vrc_remove_role', {
    p_membership: membershipId,
    p_role: role,
  })
  if (error) throw error
}

export async function removeMember(membershipId: string): Promise<void> {
  const { error } = await supabase.rpc('vrc_remove_member', { p_membership: membershipId })
  if (error) throw error
}

export async function transferLeagueOwnership(
  leagueId: string,
  newOwnerId: string,
): Promise<void> {
  const { error } = await supabase.rpc('vrc_transfer_league_ownership', {
    p_league: leagueId,
    p_new_owner: newOwnerId,
  })
  if (error) throw error
}

/** Leave a league. The server blocks it when it would orphan the league's sole Owner. */
export async function leaveLeague(membershipId: string): Promise<void> {
  const { error } = await supabase.rpc('vrc_leave_league', { p_membership: membershipId })
  if (error) throw error
}
