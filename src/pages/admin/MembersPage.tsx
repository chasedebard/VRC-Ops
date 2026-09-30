import { useCallback, useEffect, useState } from 'react'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { RequirePermission } from '@/permissions/Guard'
import { addRole, getLeagueMembers, removeMember, removeRole, type MemberSummary } from '@/services/leagues'
import { getDrivers } from '@/services/drivers'
import { assignDriverAccount, getLeagueMemberAccounts, type MemberAccount } from '@/services/driverProfileData'
import { ROLE_LABEL } from '@/permissions/resolver'
import { backendErrorMessage } from '@/utils/backendErrors'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { DriverRow, VrcRole } from '@/types/database'

const ALL_ROLES: VrcRole[] = ['owner', 'admin', 'marshal', 'driver', 'viewer']

type Pending =
  | { kind: 'removeRole'; member: MemberSummary; role: VrcRole }
  | { kind: 'removeMember'; member: MemberSummary }
  | null

/** Members & roles, plus Driver Assignments (iOS `VRCMemberManagementView` + `VRCDriverAssignmentView`). Destructive actions confirm first. */
export default function MembersPage() {
  return (
    <RequirePermission permission="canManageMembers">
      <Members />
    </RequirePermission>
  )
}

function Members() {
  const { selectedLeague, permissions, refresh } = useLeagueSession()
  const leagueId = selectedLeague?.league.id ?? null
  const [members, setMembers] = useState<MemberSummary[] | null>(null)
  const [accounts, setAccounts] = useState<MemberAccount[]>([])
  const [drivers, setDrivers] = useState<DriverRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<Pending>(null)

  const load = useCallback(async () => {
    if (!leagueId) return
    setError(null)
    try {
      const [m, a, d] = await Promise.all([getLeagueMembers(leagueId), getLeagueMemberAccounts(leagueId).catch(() => []), getDrivers(leagueId, true)])
      setMembers(m.filter((x) => x.status === 'active'))
      setAccounts(a)
      setDrivers(d)
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load league members.'))
    }
  }, [leagueId])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<void>, success: string, refreshSession = false) {
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      await action()
      setNotice(success)
      await load()
      if (refreshSession) await refresh()
    } catch (err) {
      setActionError(backendErrorMessage(err, 'That change could not be saved.'))
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (members === null) return <LoadingState label="Loading members…" />

  const accountByUser = new Map(accounts.map((a) => [a.user_id, a]))
  const assignedDriverIds = new Set(accounts.map((a) => a.assigned_driver_id).filter(Boolean))
  const unassignedDrivers = drivers.filter((d) => d.is_active && !assignedDriverIds.has(d.id))
  const needsDriver = accounts.filter((a) => a.roles.includes('driver') && !a.assigned_driver_id).length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Members &amp; roles</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {members.length} member{members.length === 1 ? '' : 's'} in {selectedLeague.league.name}.
          {needsDriver > 0 && ` ${needsDriver} driver account${needsDriver === 1 ? '' : 's'} not yet matched to a driver profile.`}
        </p>
      </div>

      {actionError && <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{actionError}</p>}
      {notice && <p role="status" className="text-sm" style={{ color: 'var(--color-success)' }}>{notice}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
        </CardHeader>
        <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {members.map((m) => {
            const account = accountByUser.get(m.userId)
            const assignable = unassignedDrivers.concat(drivers.filter((d) => d.id === account?.assigned_driver_id))
            return (
              <li key={m.membershipId} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{m.displayName ?? account?.email ?? 'Unnamed member'}</p>
                    {account?.email && m.displayName && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{account.email}</p>}
                  </div>
                  <Button variant="secondary" disabled={busy} onClick={() => setPending({ kind: 'removeMember', member: m })} aria-label={`Remove ${m.displayName ?? 'member'} from league`}>
                    Remove from league
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Roles">
                  {ALL_ROLES.map((role) => {
                    const has = m.roles.includes(role)
                    const ownerLocked = role === 'owner' && !permissions.canGrantOwnerRole
                    return has ? (
                      <button key={role} onClick={() => setPending({ kind: 'removeRole', member: m, role })} disabled={busy || ownerLocked} aria-label={`Remove ${ROLE_LABEL[role]} role`}>
                        <Badge tone="accent">{ROLE_LABEL[role]} ×</Badge>
                      </button>
                    ) : (
                      <button
                        key={role}
                        onClick={() => run(() => addRole(m.membershipId, role), `${ROLE_LABEL[role]} role added.`, m.membershipId === selectedLeague.membershipId)}
                        disabled={busy || ownerLocked}
                        className="text-xs underline"
                        style={{ color: 'var(--color-text-muted)' }}
                        aria-label={`Add ${ROLE_LABEL[role]} role`}
                      >
                        +{ROLE_LABEL[role]}
                      </button>
                    )
                  })}
                </div>
                {m.roles.includes('driver') && (
                  <label className="block text-xs">
                    <span className="mb-1 block" style={{ color: 'var(--color-text-muted)' }}>Driver profile</span>
                    <select
                      value={account?.assigned_driver_id ?? ''}
                      disabled={busy}
                      onChange={(e) => {
                        const nextDriver = e.target.value
                        if (nextDriver) {
                          // One account per driver (and per league): release the account's current driver first, then link the new one.
                          void run(async () => {
                            if (account?.assigned_driver_id && account.assigned_driver_id !== nextDriver) await assignDriverAccount(account.assigned_driver_id, null)
                            await assignDriverAccount(nextDriver, m.userId)
                          }, 'Driver profile linked.')
                        } else if (account?.assigned_driver_id) {
                          void run(() => assignDriverAccount(account.assigned_driver_id as string, null), 'Driver profile cleared.')
                        }
                      }}
                      className="w-full max-w-xs rounded-lg border bg-transparent px-2 py-1.5 text-sm"
                      style={{ borderColor: 'var(--color-border)' }}
                    >
                      <option value="">Not linked</option>
                      {assignable.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.display_name}
                          {d.driver_number ? ` #${d.driver_number}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      {pending && (
        <Modal title={pending.kind === 'removeRole' ? 'Remove role?' : 'Remove member?'} onClose={() => !busy && setPending(null)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {pending.kind === 'removeRole'
              ? `This removes only the ${ROLE_LABEL[pending.role]} role from ${pending.member.displayName ?? 'this member'}. Their other roles stay intact.`
              : `${pending.member.displayName ?? 'This member'} will lose access to ${selectedLeague.league.name}. Race history stays on their driver profile.`}
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                pending.kind === 'removeRole'
                  ? run(() => removeRole(pending.member.membershipId, pending.role), `${ROLE_LABEL[pending.role]} role removed.`, pending.member.membershipId === selectedLeague.membershipId)
                  : run(() => removeMember(pending.member.membershipId), 'Member removed.')
              }
            >
              {busy ? 'Working…' : 'Remove'}
            </Button>
            <Button variant="secondary" onClick={() => setPending(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
