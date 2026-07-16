import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { RequirePermission } from '@/permissions/Guard'
import {
  addRole,
  getLeagueMembers,
  removeMember,
  removeRole,
  type MemberSummary,
} from '@/services/leagues'
import {
  createInvitationCode,
  createViewerCode,
  getLeagueInvitations,
  resendInvitationEmail,
  revokeInvitation,
  revokeViewerCode,
  sendInvitationEmail,
} from '@/services/invitations'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { ROLE_LABEL } from '@/permissions/resolver'
import { toSafeErrorMessage } from '@/utils/errors'
import type { InvitationRow, VrcRole } from '@/types/database'

const ALL_ROLES: VrcRole[] = ['owner', 'admin', 'marshal', 'driver', 'viewer']

export default function AdminPage() {
  return (
    <RequirePermission permission="usesAdminShell">
      <AdminContent />
    </RequirePermission>
  )
}

function AdminContent() {
  const { selectedLeague, permissions } = useLeagueSession()
  const [members, setMembers] = useState<MemberSummary[] | null>(null)
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRoles, setInviteRoles] = useState<VrcRole[]>(['driver'])
  const [inviteResult, setInviteResult] = useState<string | null>(null)
  const [viewerCode, setViewerCode] = useState<string | null>(null)

  async function load(cancelledRef?: { current: boolean }) {
    if (!selectedLeague) return
    setError(null)
    try {
      const [m, inv] = await Promise.all([
        getLeagueMembers(selectedLeague.league.id),
        getLeagueInvitations(selectedLeague.league.id),
      ])
      if (cancelledRef?.current) return
      setMembers(m)
      setInvitations(inv)
    } catch (err) {
      if (cancelledRef?.current) return
      setError(toSafeErrorMessage(err, 'Could not load league members.'))
    }
  }

  useEffect(() => {
    const cancelledRef = { current: false }
    setMembers(null)
    setInvitations(null)
    load(cancelledRef)
    return () => {
      cancelledRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.league.id])

  function toggleInviteRole(role: VrcRole) {
    setInviteRoles((roles) =>
      roles.includes(role) ? roles.filter((r) => r !== role) : [...roles, role],
    )
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedLeague || inviteRoles.length === 0) return
    setBusy(true)
    setInviteResult(null)
    try {
      if (inviteEmail.trim()) {
        const result = await sendInvitationEmail(selectedLeague.league.id, inviteRoles, inviteEmail, null)
        setInviteResult(`Email invite ${result.sendStatus}.`)
      } else {
        const result = await createInvitationCode(selectedLeague.league.id, inviteRoles, null)
        setInviteResult(`Invite code: ${result.code}`)
      }
      setInviteEmail('')
      await load()
    } catch (err) {
      setError(toSafeErrorMessage(err, 'Could not send invite.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateViewerCode() {
    if (!selectedLeague) return
    setBusy(true)
    try {
      setViewerCode(await createViewerCode(selectedLeague.league.id))
    } catch (err) {
      setError(toSafeErrorMessage(err, 'Could not create viewer code.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRevokeViewerCode() {
    if (!selectedLeague) return
    setBusy(true)
    try {
      await revokeViewerCode(selectedLeague.league.id)
      setViewerCode(null)
    } catch (err) {
      setError(toSafeErrorMessage(err, 'Could not revoke viewer code.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleAddRole(membershipId: string, role: VrcRole) {
    setBusy(true)
    try {
      await addRole(membershipId, role)
      await load()
    } catch (err) {
      setError(toSafeErrorMessage(err, 'Could not add role.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveRole(membershipId: string, role: VrcRole) {
    setBusy(true)
    try {
      await removeRole(membershipId, role)
      await load()
    } catch (err) {
      setError(toSafeErrorMessage(err, 'Could not remove role.'))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveMember(membershipId: string) {
    if (!confirm('Remove this member from the league?')) return
    setBusy(true)
    try {
      await removeMember(membershipId)
      await load()
    } catch (err) {
      setError(toSafeErrorMessage(err, 'Could not remove member.'))
    } finally {
      setBusy(false)
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (members === null || invitations === null) return <LoadingState />

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Administration</h1>
        <div className="flex gap-2 text-sm">
          <Link to="/tracks" className="underline" style={{ color: 'var(--color-text-muted)' }}>
            Tracks
          </Link>
          <Link to="/classes" className="underline" style={{ color: 'var(--color-text-muted)' }}>
            Classes
          </Link>
          <Link to="/regions" className="underline" style={{ color: 'var(--color-text-muted)' }}>
            Regions
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite a member</CardTitle>
        </CardHeader>
        <form onSubmit={handleInvite} className="space-y-3">
          <Field
            label="Email (leave blank for a shareable code)"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <div>
            <span className="mb-1 block text-sm font-medium">Roles</span>
            <div className="flex flex-wrap gap-2">
              {ALL_ROLES.filter((r) => r !== 'owner' || permissions.canGrantOwnerRole).map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={inviteRoles.includes(role)}
                    onChange={() => toggleInviteRole(role)}
                  />
                  {ROLE_LABEL[role]}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={busy || inviteRoles.length === 0}>
            {busy ? 'Sending…' : inviteEmail.trim() ? 'Send email invite' : 'Generate invite code'}
          </Button>
          {inviteResult && <p className="text-sm" style={{ color: 'var(--color-success)' }}>{inviteResult}</p>}
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Viewer broadcast code</CardTitle>
        </CardHeader>
        <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          A reusable 6-digit code anyone can use to follow the league as a viewer.
        </p>
        <div className="flex items-center gap-2">
          <Button onClick={handleCreateViewerCode} disabled={busy}>
            Generate new code
          </Button>
          <Button variant="secondary" onClick={handleRevokeViewerCode} disabled={busy}>
            Revoke active code
          </Button>
        </div>
        {viewerCode && <p className="mt-2 text-lg font-mono font-bold">{viewerCode}</p>}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations ({invitations.filter((i) => i.status === 'pending').length})</CardTitle>
        </CardHeader>
        {invitations.length === 0 ? (
          <EmptyState title="No invitations yet" />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {invitations.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {inv.email ?? `Code ${inv.code}`}
                </span>
                <div className="flex items-center gap-2">
                  <Badge tone={inv.status === 'pending' ? 'warning' : inv.status === 'accepted' ? 'success' : 'neutral'}>
                    {inv.status}
                  </Badge>
                  {inv.status === 'pending' && inv.email && (
                    <Button variant="secondary" onClick={() => resendInvitationEmail(inv.id)}>
                      Resend
                    </Button>
                  )}
                  {inv.status === 'pending' && (
                    <Button variant="secondary" onClick={() => revokeInvitation(inv.id).then(() => load())}>
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members ({members.length})</CardTitle>
        </CardHeader>
        <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {members.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <span className="font-medium">{m.displayName ?? 'Unnamed member'}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {ALL_ROLES.map((role) =>
                  m.roles.includes(role) ? (
                    <button
                      key={role}
                      onClick={() => handleRemoveRole(m.membershipId, role)}
                      disabled={busy || (role === 'owner' && !permissions.canGrantOwnerRole)}
                    >
                      <Badge tone="accent">{ROLE_LABEL[role]} ×</Badge>
                    </button>
                  ) : (
                    <button
                      key={role}
                      onClick={() => handleAddRole(m.membershipId, role)}
                      disabled={busy || (role === 'owner' && !permissions.canGrantOwnerRole)}
                      className="text-xs underline"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      +{ROLE_LABEL[role]}
                    </button>
                  ),
                )}
                <Button variant="secondary" onClick={() => handleRemoveMember(m.membershipId)} disabled={busy}>
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
