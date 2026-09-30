import { useCallback, useEffect, useState } from 'react'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { RequirePermission } from '@/permissions/Guard'
import {
  createInvitationCode,
  getLeagueInvitations,
  resendInvitationEmail,
  revokeInvitation,
  sendInvitationEmail,
  type InvitationWithRoles,
} from '@/services/invitations'
import { ROLE_LABEL } from '@/permissions/resolver'
import { backendErrorMessage } from '@/utils/backendErrors'
import { formatDate } from '@/utils/format'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { VrcRole } from '@/types/database'

const ALL_ROLES: VrcRole[] = ['owner', 'admin', 'marshal', 'driver', 'viewer']

/** Invitations (iOS `VRCInvitationsSection` / `VRCCreateInvitationView`): emailed single-use invites or manual codes, one or more roles, optional expiry. */
export default function InvitationsPage() {
  return (
    <RequirePermission permission="canSendInvitations">
      <Invitations />
    </RequirePermission>
  )
}

function Invitations() {
  const { selectedLeague, permissions } = useLeagueSession()
  const leagueId = selectedLeague?.league.id ?? null
  const [invitations, setInvitations] = useState<InvitationWithRoles[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [roles, setRoles] = useState<VrcRole[]>(['driver'])
  const [expires, setExpires] = useState('')
  const [revoking, setRevoking] = useState<InvitationWithRoles | null>(null)
  const [createdCode, setCreatedCode] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!leagueId) return
    setError(null)
    try {
      setInvitations(await getLeagueInvitations(leagueId))
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load invitations.'))
    }
  }, [leagueId])

  useEffect(() => {
    void load()
  }, [load])

  const toggleRole = (role: VrcRole) => setRoles((current) => (current.includes(role) ? current.filter((r) => r !== role) : [...current, role]))
  // Expiry is end-of-day in the viewer's zone, so "expires Friday" means through Friday.
  const expiresAt = expires ? new Date(`${expires}T23:59:59`).toISOString() : null

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setActionError(null)
    setNotice(null)
    setCreatedCode(null)
    try {
      await action()
      await load()
    } catch (err) {
      setActionError(backendErrorMessage(err, 'That invitation action could not be completed.'))
    } finally {
      setBusy(false)
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault()
    if (!leagueId || roles.length === 0) return
    const trimmed = email.trim()
    await run(async () => {
      if (trimmed) {
        const result = await sendInvitationEmail(leagueId, roles, trimmed, expiresAt)
        setNotice(result.sendStatus === 'sent' ? `Invite sent to ${trimmed}.` : `Invite created for ${trimmed}, but sending failed. Use Resend to try again.`)
      } else {
        const result = await createInvitationCode(leagueId, roles, expiresAt)
        setCreatedCode(result.code)
        setNotice('Invite code created. Share it with the person you are inviting.')
      }
      setEmail('')
    })
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setNotice('Code copied.')
    } catch {
      setNotice('Copy is unavailable in this browser — select the code and copy it manually.')
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (invitations === null) return <LoadingState label="Loading invitations…" />

  const pending = invitations.filter((i) => i.status === 'pending')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Invitations</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Roles are granted when the invitation is accepted; the server enforces who can grant what.</p>
      </div>

      {actionError && <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{actionError}</p>}
      {notice && <p role="status" className="text-sm" style={{ color: 'var(--color-success)' }}>{notice}</p>}
      {createdCode && (
        <Card>
          <p className="text-sm">Invite code</p>
          <p className="my-1 select-all font-mono text-2xl font-bold tracking-widest">{createdCode}</p>
          <Button variant="secondary" onClick={() => copy(createdCode)}>Copy code</Button>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
        </CardHeader>
        <form onSubmit={create} className="space-y-3">
          <Field label="Email (leave blank for a shareable code)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Roles</legend>
            <div className="flex flex-wrap gap-3">
              {ALL_ROLES.filter((r) => r !== 'owner' || permissions.canGrantOwnerRole).map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} />
                  {ROLE_LABEL[role]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Expires (optional)" type="date" value={expires} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setExpires(e.target.value)} />
          <Button type="submit" disabled={busy || roles.length === 0}>
            {busy ? 'Working…' : email.trim() ? 'Send email invite' : 'Create invite code'}
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invitations ({pending.length} pending)</CardTitle>
        </CardHeader>
        {invitations.length === 0 ? (
          <EmptyState title="No invitations yet" />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {invitations.map((inv) => (
              <li key={inv.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{inv.email ?? `Code ${inv.code}`}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {inv.invitation_roles.map((r) => ROLE_LABEL[r.role]).join(' · ') || 'No roles'}
                      {inv.expires_at ? ` · expires ${formatDate(inv.expires_at)}` : ''}
                      {inv.email && inv.send_status ? ` · email ${inv.send_status}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={inv.status === 'pending' ? 'warning' : inv.status === 'accepted' ? 'success' : 'neutral'}>{inv.status}</Badge>
                    {inv.status === 'pending' && !inv.email && <Button variant="secondary" onClick={() => copy(inv.code)}>Copy code</Button>}
                    {inv.status === 'pending' && inv.email && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            const result = await resendInvitationEmail(inv.id)
                            setNotice(result.sendStatus === 'sent' ? `Invite resent to ${inv.email}.` : `Resend to ${inv.email} failed. Please try again.`)
                          })
                        }
                      >
                        Resend
                      </Button>
                    )}
                    {inv.status === 'pending' && <Button variant="ghost" disabled={busy} onClick={() => setRevoking(inv)}>Revoke</Button>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {revoking && (
        <Modal title="Revoke invitation?" onClose={() => !busy && setRevoking(null)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {revoking.email ?? `Code ${revoking.code}`} will stop working immediately.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                await run(() => revokeInvitation(revoking.id))
                setRevoking(null)
              }}
            >
              Revoke
            </Button>
            <Button variant="secondary" onClick={() => setRevoking(null)} disabled={busy}>
              Keep
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
