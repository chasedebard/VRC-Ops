import { useState } from 'react'
import { useEntitlement } from '@/hooks/useEntitlement'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Badge } from './Badge'
import { Button } from './Button'
import { formatDate, formatDateTime } from '@/utils/format'
import type { LeagueSubscriptionStatus, SubscriptionStatus } from '@/types/database'

const APP_STORE_URL = 'https://apps.apple.com/us/app/vrc-ops/id6780654622'

const STATUS_LABEL: Record<SubscriptionStatus | LeagueSubscriptionStatus, string> = {
  active: 'Active',
  grace_period: 'Grace period',
  billing_retry: 'Billing issue',
  expired: 'Expired',
  revoked: 'Refunded',
  pending_verification: 'Verifying…',
}

const STATUS_TONE: Record<SubscriptionStatus | LeagueSubscriptionStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  grace_period: 'warning',
  billing_retry: 'warning',
  expired: 'neutral',
  revoked: 'danger',
  pending_verification: 'neutral',
}

/**
 * Read-only mirror of iOS's VRCSubscriptionSettingsView / VRCLeaguePlusSettingsView.
 * The website never manages or cancels a subscription — Apple is the only place
 * that happens — this only shows what the backend currently has on record and
 * offers a manual recheck for the "just subscribed on iOS" sync-lag case.
 */
export function SubscriptionStatusCard() {
  const { status, hasAccess, source, subscription, leagueSubscription, lastCheckedAt, error, refresh } =
    useEntitlement()
  const { selectedLeague } = useLeagueSession()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  const record = source === 'individual_pro' ? subscription : source === 'league_plus' ? leagueSubscription : (subscription ?? leagueSubscription)

  if (status === 'loading' && !lastCheckedAt) {
    return <p className="text-sm">Checking…</p>
  }

  return (
    <div className="space-y-3">
      {status === 'error' && (
        <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error ?? "Couldn't check your subscription status."}
        </p>
      )}

      {hasAccess ? (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={record ? STATUS_TONE[record.status] : 'success'}>
              {record ? STATUS_LABEL[record.status] : 'Active'}
            </Badge>
            <span className="font-medium">
              {source === 'individual_pro'
                ? 'VRC Ops Pro'
                : `VRC League Plus — via ${selectedLeague?.league.name ?? 'this league'}`}
            </span>
          </div>
          {record?.expires_at && (
            <p style={{ color: 'var(--color-text-muted)' }}>
              {record.status === 'grace_period' ? 'Access until' : 'Renews'} {formatDate(record.expires_at)}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          {record ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[record.status]}>{STATUS_LABEL[record.status]}</Badge>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {'user_id' in record ? 'VRC Ops Pro' : 'VRC League Plus'} is not currently active.
              </span>
            </div>
          ) : (
            <p style={{ color: 'var(--color-text-muted)' }}>
              Not subscribed to VRC Ops Pro, and this league doesn't have VRC League Plus.
            </p>
          )}
          <p style={{ color: 'var(--color-text-muted)' }}>
            VRC Ops Pro is available through the iPhone and iPad app. Download or open VRC Ops from
            the App Store and subscribe with the same account — your Pro access will then appear here.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {!hasAccess && (
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
          >
            Open the App Store
          </a>
        )}
        <Button variant="secondary" onClick={handleRefresh} disabled={refreshing || status === 'loading'}>
          {refreshing ? 'Checking…' : 'Refresh status'}
        </Button>
      </div>

      {lastCheckedAt && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Last checked {formatDateTime(lastCheckedAt.toISOString())}
        </p>
      )}
    </div>
  )
}
