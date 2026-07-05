import type { ReactNode } from 'react'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import type { LeaguePermissions } from '@/permissions/resolver'
import { EmptyState } from '@/components/States'

interface RequirePermissionProps {
  permission: keyof Pick<
    LeaguePermissions,
    | 'canManageMembers'
    | 'canSendInvitations'
    | 'canManageRoles'
    | 'canGrantOwnerRole'
    | 'canAdministerLegal'
    | 'canOperateRaceControl'
    | 'canSubmitResults'
    | 'canApproveResults'
    | 'usesAdminShell'
  >
  children: ReactNode
  fallback?: ReactNode
}

export function RequirePermission({ permission, children, fallback }: RequirePermissionProps) {
  const { permissions } = useLeagueSession()
  if (!permissions[permission]) {
    return (
      fallback ?? (
        <EmptyState
          title="Restricted"
          description="Your role in this league doesn't include access to this screen."
        />
      )
    )
  }
  return <>{children}</>
}
