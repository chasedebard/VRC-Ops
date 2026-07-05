import type { VrcRole } from '@/types/database'

/**
 * Mirrors VRCPermissionResolver.swift. This is UI-hiding only — every mutation
 * is re-checked server-side by RLS policies and SECURITY DEFINER RPCs, so a
 * mistake here cannot grant real access, only show/hide controls incorrectly.
 */
export interface LeaguePermissions {
  roles: Set<VrcRole>
  canManageMembers: boolean
  canSendInvitations: boolean
  canManageRoles: boolean
  canGrantOwnerRole: boolean
  canAdministerLegal: boolean
  canViewPublished: boolean
  canOperateRaceControl: boolean
  canSubmitResults: boolean
  canApproveResults: boolean
  usesAdminShell: boolean
}

const ROLE_RANK: Record<VrcRole, number> = {
  owner: 0,
  admin: 1,
  marshal: 2,
  driver: 3,
  viewer: 4,
}

export function highestRole(roles: Set<VrcRole> | VrcRole[]): VrcRole | null {
  const list = Array.from(roles)
  if (list.length === 0) return null
  return list.reduce((best, role) => (ROLE_RANK[role] < ROLE_RANK[best] ? role : best))
}

export function resolvePermissions(roles: VrcRole[] | Set<VrcRole>): LeaguePermissions {
  const roleSet = roles instanceof Set ? roles : new Set(roles)
  const isOwner = roleSet.has('owner')
  const isAdmin = roleSet.has('admin')
  const isMarshal = roleSet.has('marshal')
  const isManager = isOwner || isAdmin

  return {
    roles: roleSet,
    canManageMembers: isManager,
    canSendInvitations: isManager,
    canManageRoles: isManager,
    canGrantOwnerRole: isOwner,
    canAdministerLegal: isManager,
    canViewPublished: roleSet.size > 0,
    canOperateRaceControl: isManager || isMarshal,
    canSubmitResults: isManager || isMarshal,
    canApproveResults: isManager,
    usesAdminShell: isManager,
  }
}

export const ROLE_LABEL: Record<VrcRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  marshal: 'Marshal',
  driver: 'Driver',
  viewer: 'Viewer',
}
