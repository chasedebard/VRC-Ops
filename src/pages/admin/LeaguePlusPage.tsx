import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useEntitlement } from '@/hooks/useEntitlement'
import { RequirePermission } from '@/permissions/Guard'
import { getLeagueMembers, type MemberSummary } from '@/services/leagues'
import { getLeaguePlusSeatCount, getLeaguePlusSeatHolders, seatsAvailable, setLeaguePlusSeat } from '@/services/leaguePlus'
import { getLeagueInvitations } from '@/services/invitations'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { ErrorState, LoadingState, EmptyState } from '@/components/States'
import { APPLE_MANAGE_SUBSCRIPTIONS_URL, APP_STORE_URL } from '@/config/links'
import { LEAGUE_PLUS_SEAT_LIMIT } from '@/config/featureRegistry'
import {
  LEAGUE_PLUS_GROUP_NAME,
  isComplimentaryLeagueRecord,
  isRecordEntitled,
  leaguePlusPlanName,
  parseRenewalState,
} from '@/utils/subscriptionModel'
import { ROLE_LABEL } from '@/permissions/resolver'
import { formatDate } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'
import { useAuth } from '@/hooks/useAuth'

/**
 * Administration ▸ League Plus (iOS `VRCLeaguePlusSettingsView`, owner only): status, billing owner, seat usage and the
 * members using shared access. League Plus is resolved and enforced server-side (`vrc_has_premium_access`); this page
 * only displays that state. Purchase and billing happen in the App Store — never here.
 *
 * Beyond the iOS screen, it shows the live seat model (`league_plus_seats`: access for up to 15 SELECTED members) and
 * lets the owner grant/revoke a seat through the owner-only `vrc_set_league_plus_seat` RPC.
 */
export default function LeaguePlusPage() {
  return (
    <RequirePermission permission="canManageLeague">
      <LeaguePlusContent />
    </RequirePermission>
  )
}

function LeaguePlusContent() {
  const { selectedLeague } = useLeagueSession()
  const { leagueSubscription, refresh: refreshEntitlement } = useEntitlement()
  const { state } = useAuth()
  const leagueId = selectedLeague?.league.id
  const userId = state.kind === 'authenticated' ? state.user.id : null
  const [members, setMembers] = useState<MemberSummary[] | null>(null)
  const [seatHolders, setSeatHolders] = useState<Set<string>>(new Set())
  const [seatCount, setSeatCount] = useState(0)
  const [pendingInvites, setPendingInvites] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const entitled = leagueSubscription ? isRecordEntitled(leagueSubscription) : false

  const load = useCallback(async () => {
    if (!leagueId) return
    setError(null)
    try {
      const [m, invites] = await Promise.all([getLeagueMembers(leagueId), getLeagueInvitations(leagueId)])
      setMembers(m.filter((x) => x.status === 'active'))
      setPendingInvites(invites.filter((i) => i.status === 'pending').length)
      if (entitled) {
        const [count, holders] = await Promise.all([getLeaguePlusSeatCount(leagueId), getLeaguePlusSeatHolders(leagueId)])
        setSeatCount(count)
        setSeatHolders(new Set(holders.map((h) => h.membershipId)))
      }
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load League Plus details.'))
    }
  }, [leagueId, entitled])

  useEffect(() => {
    void load()
  }, [load])

  async function toggleSeat(member: MemberSummary, grant: boolean) {
    if (!leagueId) return
    setBusyId(member.membershipId)
    setError(null)
    try {
      await setLeaguePlusSeat(leagueId, member.membershipId, grant)
      await load()
      await refreshEntitlement()
    } catch (err) {
      const text = backendErrorMessage(err, 'Could not change that seat.')
      setError(
        String((err as { message?: string })?.message ?? '').includes('LEAGUE_PLUS_SEAT_LIMIT')
          ? `All ${LEAGUE_PLUS_SEAT_LIMIT} League Plus seats are in use. Remove a seat first.`
          : text,
      )
    } finally {
      setBusyId(null)
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error && members === null) return <ErrorState message={error} onRetry={load} />
  if (members === null) return <LoadingState />

  const complimentary = isComplimentaryLeagueRecord(leagueSubscription)
  const renewal = parseRenewalState(leagueSubscription?.renewal_state)
  const purchaserMismatch = leagueSubscription ? leagueSubscription.purchaser_user_id !== selectedLeague.league.owner_id : false
  const purchaserName = leagueSubscription
    ? (members.find((m) => m.userId === leagueSubscription.purchaser_user_id)?.displayName ?? 'Unknown')
    : 'Unknown'
  const isPurchaser = Boolean(userId && leagueSubscription?.purchaser_user_id === userId)
  const available = seatsAvailable(seatCount)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link to="/admin" className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
          ← Administration
        </Link>
        <h1 className="text-2xl font-bold">{LEAGUE_PLUS_GROUP_NAME}</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Pro-equivalent access for up to {LEAGUE_PLUS_SEAT_LIMIT} selected members of {selectedLeague.league.name}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          {leagueSubscription ? (
            <Badge tone={entitled ? 'success' : leagueSubscription.status === 'pending_verification' ? 'neutral' : 'danger'}>
              {complimentary && entitled
                ? 'Permanent'
                : { active: 'Active', grace_period: 'Grace period', billing_retry: 'Billing retry', expired: 'Expired', revoked: 'Refunded', pending_verification: 'Verifying…' }[leagueSubscription.status]}
            </Badge>
          ) : (
            <Badge tone="neutral">Not active</Badge>
          )}
        </CardHeader>
        {leagueSubscription ? (
          <dl className="space-y-2 text-sm">
            <Row label="Plan" value={leaguePlusPlanName(leagueSubscription.product_id)} />
            {complimentary ? (
              <Row label="Renewal" value="Never expires — permanent grant" />
            ) : (
              leagueSubscription.expires_at && (
                <Row label={renewal === 'will_renew' ? 'Renews' : 'Access until'} value={formatDate(leagueSubscription.expires_at)} />
              )
            )}
            <Row label="Billing owner" value={complimentary ? 'None — complimentary' : purchaserName} />
          </dl>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            This league doesn&apos;t have an active League Plus subscription.
          </p>
        )}
        {purchaserMismatch && !complimentary && (
          <p className="mt-2 text-xs" style={{ color: 'var(--color-warning)' }}>
            Billing owner no longer matches the league owner. The original purchaser must keep this subscription active —
            ownership transfer does not move billing.
          </p>
        )}
        {entitled && !complimentary && (
          <div className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {isPurchaser ? (
              <a href={APPLE_MANAGE_SUBSCRIPTIONS_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                Manage subscription in the App Store
              </a>
            ) : (
              <p>This subscription is billed to {purchaserName}&apos;s Apple Account. Only the purchaser can manage or cancel it.</p>
            )}
          </div>
        )}
        {entitled && complimentary && (
          <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            This league&apos;s access is a permanent complimentary grant. There is no App Store subscription to manage or renew.
          </p>
        )}
        {!entitled && (
          <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            League Plus is purchased by the league owner in the iPhone and iPad app (Administration ▸ League Plus).{' '}
            <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              Open the App Store
            </a>
          </p>
        )}
      </Card>

      {entitled && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Seats</CardTitle>
            </CardHeader>
            <p className="text-2xl font-bold tabular-nums">
              {seatCount} of {LEAGUE_PLUS_SEAT_LIMIT} seats used
            </p>
            <div
              className="mt-2 h-2 rounded-full"
              style={{ backgroundColor: 'var(--color-border)' }}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={LEAGUE_PLUS_SEAT_LIMIT}
              aria-valuenow={seatCount}
              aria-label="League Plus seats used"
            >
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${Math.min(100, (seatCount / LEAGUE_PLUS_SEAT_LIMIT) * 100)}%`,
                  backgroundColor: available > 0 ? 'var(--color-accent)' : 'var(--color-warning)',
                }}
              />
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {available > 0 ? `${available} seat${available === 1 ? '' : 's'} available` : 'No seats available'}. A league can have
              more than {LEAGUE_PLUS_SEAT_LIMIT} members; only seat holders get League Plus access.
            </p>
            {pendingInvites > 0 && (
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {pendingInvites} pending invitation{pendingInvites === 1 ? '' : 's'} — these don&apos;t use a seat until accepted.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Members using League access</CardTitle>
            </CardHeader>
            {error && (
              <p role="alert" className="mb-2 text-sm" style={{ color: 'var(--color-danger)' }}>
                {error}
              </p>
            )}
            <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
              {members.map((m) => {
                const hasSeat = seatHolders.has(m.membershipId)
                return (
                  <li key={m.membershipId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-medium">{m.displayName ?? 'Unnamed member'}</p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {m.roles.map((r) => ROLE_LABEL[r]).join(', ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={hasSeat ? 'success' : 'neutral'}>{hasSeat ? 'Has a seat' : 'No seat'}</Badge>
                      <Button
                        variant="secondary"
                        disabled={busyId === m.membershipId || (!hasSeat && available === 0)}
                        onClick={() => toggleSeat(m, !hasSeat)}
                      >
                        {busyId === m.membershipId ? 'Saving…' : hasSeat ? 'Remove seat' : 'Give seat'}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>
        </>
      )}

      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        League Plus unlocks Pro-equivalent features for seat holders in {selectedLeague.league.name}. It&apos;s billed to the
        purchaser&apos;s Apple Account and stays separate from any personal {'VRC Ops Pro'} subscription.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}
