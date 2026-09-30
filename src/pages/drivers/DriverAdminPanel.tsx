import { useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { MfaStepUp } from '@/components/MfaStepUp'
import { getDrivers } from '@/services/drivers'
import {
  archiveDriver,
  assignDriverAccount,
  driverLinkFailureMessage,
  getDriverLinkStatuses,
  getLeagueMemberAccounts,
  linkDriverToAccount,
  updateDriverAsManager,
  type DriverLinkStatus,
  type MemberAccount,
} from '@/services/driverProfileData'
import { verifyChallenge } from '@/services/mfa'
import { backendErrorMessage } from '@/utils/backendErrors'
import { driverNumberMessages } from '@/utils/driverValidation'
import type { DriverRow } from '@/types/database'

/**
 * Owner/Admin driver management (iOS `VRCGlobalDriverAdminEditorSheet` + `VRCDriverGlobalLinkSheet`): edit identity fields, resolve a pending
 * number request, set active/inactive, assign the league account, and create the PERMANENT Global Rating link (fresh MFA step-up, then the
 * server-authoritative RPC). Every write is re-checked by RLS / SECURITY DEFINER RPCs — hiding this panel is not the security boundary.
 */
export function DriverAdminPanel({ driver, leagueId, onChanged }: { driver: DriverRow; leagueId: string; onChanged: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage driver</CardTitle>
        <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Hide' : 'Edit'}
        </Button>
      </CardHeader>
      {driver.driver_number_request_status === 'pending' && driver.requested_driver_number && (
        <p className="text-sm">
          <Badge tone="warning">Number request</Badge> wants #{driver.requested_driver_number}
        </p>
      )}
      {open && <Editor driver={driver} leagueId={leagueId} onChanged={onChanged} />}
    </Card>
  )
}

function Editor({ driver, leagueId, onChanged }: { driver: DriverRow; leagueId: string; onChanged: () => void | Promise<void> }) {
  const [others, setOthers] = useState<DriverRow[]>([])
  const [displayName, setDisplayName] = useState(driver.display_name)
  const [firstName, setFirstName] = useState(driver.first_name ?? '')
  const [lastName, setLastName] = useState(driver.last_name ?? '')
  const [number, setNumber] = useState(driver.driver_number ?? '')
  const [bio, setBio] = useState(driver.bio ?? '')
  const [platformId, setPlatformId] = useState(driver.platform_id ?? '')
  const [racingId, setRacingId] = useState(driver.racing_id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<MemberAccount[] | null>(null)
  const [linkStatus, setLinkStatus] = useState<DriverLinkStatus | null>(null)
  const [linkTarget, setLinkTarget] = useState<MemberAccount | null>(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  useEffect(() => {
    getDrivers(leagueId, true).then(setOthers).catch(() => undefined)
    getLeagueMemberAccounts(leagueId).then(setAccounts).catch(() => setAccounts([]))
    getDriverLinkStatuses(leagueId)
      .then((list) => setLinkStatus(list.find((s) => s.driver_id === driver.id) ?? null))
      .catch(() => undefined)
  }, [leagueId, driver.id])

  const numberProblems = driverNumberMessages(number, driver.id, others)
  const dirty =
    displayName !== driver.display_name ||
    firstName !== (driver.first_name ?? '') ||
    lastName !== (driver.last_name ?? '') ||
    number !== (driver.driver_number ?? '') ||
    bio !== (driver.bio ?? '') ||
    platformId !== (driver.platform_id ?? '') ||
    racingId !== (driver.racing_id ?? '')

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      setNotice(success)
      await onChanged()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not save.'))
    } finally {
      setBusy(false)
    }
  }

  const save = () =>
    run(
      () =>
        updateDriverAsManager(driver.id, {
          display_name: displayName.trim(),
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          driver_number: number.trim() || null,
          bio: bio.trim() || null,
          platform_id: platformId.trim() || null,
          racing_id: racingId.trim() || null,
        }),
      'Driver saved.',
    )

  const resolveRequest = (approve: boolean) =>
    run(
      () =>
        updateDriverAsManager(
          driver.id,
          approve
            ? { driver_number: driver.requested_driver_number, requested_driver_number: null, driver_number_request_status: 'approved' }
            : { requested_driver_number: null, driver_number_request_status: 'rejected' },
        ),
      approve ? 'Number approved.' : 'Request declined.',
    )

  const assigned = accounts?.find((a) => a.assigned_driver_id === driver.id) ?? null
  const available = (accounts ?? []).filter((a) => !a.assigned_driver_id || a.assigned_driver_id === driver.id)

  async function confirmLink(factorId: string, code: string): Promise<string | null> {
    if (!linkTarget) return 'Choose an account first.'
    setBusy(true)
    try {
      try {
        await verifyChallenge(factorId, code)
      } catch {
        return 'That code didn’t verify. Try the latest code from your authenticator app.'
      }
      const result = await linkDriverToAccount(driver.id, linkTarget.user_id)
      if (!result.ok) return driverLinkFailureMessage(result.error)
      setLinkStatus({ driver_id: driver.id, is_linked: true, link_status: 'active', link_valid_at: result.link_valid_at ?? null })
      setLinkTarget(null)
      setNotice('Global Rating link created. It is permanent.')
      await onChanged()
      return null
    } catch (err) {
      return backendErrorMessage(err, 'The Global Rating link could not be created. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm" style={{ color: 'var(--color-success)' }}>
          {notice}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        <Field label="Official number" value={number} onChange={(e) => setNumber(e.target.value)} />
        <Field label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
        <Field label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        <Field label="Platform ID" value={platformId} onChange={(e) => setPlatformId(e.target.value)} />
        <Field label="Game identity" value={racingId} onChange={(e) => setRacingId(e.target.value)} />
      </div>
      <Field label="Bio" value={bio} onChange={(e) => setBio(e.target.value)} />
      {numberProblems.map((m) => (
        <p key={m} className="text-xs" style={{ color: 'var(--color-warning)' }}>
          {m}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={busy || !dirty || !displayName.trim() || numberProblems.length > 0}>
          Save changes
        </Button>
        <Button variant="secondary" onClick={() => run(() => updateDriverAsManager(driver.id, { is_active: !driver.is_active }), driver.is_active ? 'Driver set inactive.' : 'Driver set active.')} disabled={busy}>
          {driver.is_active ? 'Set inactive' : 'Set active'}
        </Button>
      </div>

      {driver.driver_number_request_status === 'pending' && driver.requested_driver_number && (
        <div className="rounded-lg border p-3" style={{ borderColor: 'var(--color-border)' }}>
          <p className="mb-2 text-sm">
            Requested number <strong>#{driver.requested_driver_number}</strong>
          </p>
          <div className="flex gap-2">
            <Button onClick={() => resolveRequest(true)} disabled={busy || driverNumberMessages(driver.requested_driver_number, driver.id, others).length > 0}>
              Approve
            </Button>
            <Button variant="secondary" onClick={() => resolveRequest(false)} disabled={busy}>
              Decline
            </Button>
          </div>
          {driverNumberMessages(driver.requested_driver_number, driver.id, others).map((m) => (
            <p key={m} className="mt-1 text-xs" style={{ color: 'var(--color-warning)' }}>
              {m}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
        <h4 className="text-sm font-semibold">Linked account</h4>
        {accounts === null ? (
          <p className="text-sm">Loading members…</p>
        ) : (
          <label className="block text-sm">
            <span className="mb-1 block">League member account</span>
            <select
              value={assigned?.user_id ?? ''}
              disabled={busy}
              onChange={(e) => run(() => assignDriverAccount(driver.id, e.target.value || null), e.target.value ? 'Account linked.' : 'Account cleared.')}
              className="w-full rounded-lg border bg-transparent px-2 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <option value="">No account</option>
              {available.map((a) => (
                <option key={a.user_id} value={a.user_id}>
                  {a.display_name || a.email || `Member ${a.user_id.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          The linked account sees this driver under My Driver and can edit the self-service fields.
        </p>
      </div>

      <div className="space-y-2 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
        <h4 className="text-sm font-semibold">Global Rating link</h4>
        {linkStatus?.is_linked ? (
          <p className="text-sm">
            <Badge tone="success">{linkStatus.link_status === 'archived' ? 'Archived link' : 'Permanently linked'}</Badge> This driver&apos;s rated results belong to a
            parent account. The link can&apos;t be reassigned.
          </p>
        ) : assigned ? (
          <>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Link <strong>{driver.display_name}</strong> to <strong>{assigned.display_name || assigned.email || 'this account'}</strong> so that account&apos;s private Global Rating owns this
              driver&apos;s rated results. This is permanent and needs a fresh two-factor code.
            </p>
            <Button variant="secondary" onClick={() => setLinkTarget(assigned)} disabled={busy}>
              Create permanent Global Rating link…
            </Button>
          </>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Assign a league account above before creating a Global Rating link.
          </p>
        )}
      </div>

      <div className="border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
        <Button variant="danger" onClick={() => setConfirmArchive(true)} disabled={busy}>
          Archive driver
        </Button>
        <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Archiving retires the driver and keeps their race history.
        </p>
      </div>

      {linkTarget && (
        <Modal title="Create permanent Global Rating link" onClose={() => !busy && setLinkTarget(null)} dismissible={!busy}>
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {driver.display_name} → {linkTarget.display_name || linkTarget.email}. The server re-verifies this two-factor confirmation; the link can never be reassigned.
          </p>
          <MfaStepUp actionLabel="Create link" busy={busy} onConfirm={confirmLink} />
        </Modal>
      )}

      {confirmArchive && (
        <Modal title="Archive this driver?" onClose={() => !busy && setConfirmArchive(false)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {driver.display_name} will be archived and removed from active rosters. Race history is kept.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                await run(() => archiveDriver(driver.id), 'Driver archived.')
                setConfirmArchive(false)
              }}
            >
              Archive
            </Button>
            <Button variant="secondary" onClick={() => setConfirmArchive(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
