import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useEntitlement } from '@/hooks/useEntitlement'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { APPLE_MANAGE_SUBSCRIPTIONS_URL, APP_STORE_URL } from '@/config/links'
import {
  LEAGUE_PLUS_GROUP_NAME,
  PRO_GROUP_NAME,
  RENEWAL_TEXT,
  availableBenefits,
  isComplimentaryGrant,
  isComplimentaryLeagueRecord,
  isRecordEntitled,
  isWorldChampionGrant,
  leaguePlusPlanName,
  parseRenewalState,
  premiumAccessDescription,
  premiumAccessLabel,
  proPlanName,
  showsManageButton,
} from '@/utils/subscriptionModel'
import { isFeatureUnlocked } from '@/config/featureRegistry'
import { formatDate, formatDateTime } from '@/utils/format'

/**
 * Account ▸ Subscription (iOS `VRCSubscriptionSettingsView`). The website never sells, renews or cancels anything —
 * purchases and management happen in the App Store — so this is a truthful read-out of what the backend has on record
 * (`subscriptions`, `league_subscriptions`, `vrc_user_is_pro`, `vrc_has_premium_access`) plus links to the right place
 * to act. It never infers access from a stored boolean.
 */
export default function SubscriptionPage() {
  const { state } = useAuth()
  const { selectedLeague } = useLeagueSession()
  const { status, hasAccess, source, subscription, leagueSubscription, lastCheckedAt, error, refresh } = useEntitlement()
  const [refreshing, setRefreshing] = useState(false)

  const userId = state.kind === 'authenticated' ? state.user.id : null
  const leagueName = selectedLeague?.league.name ?? null
  const leagueComplimentary = isComplimentaryLeagueRecord(leagueSubscription)
  const proEntitled = subscription ? isRecordEntitled(subscription) : false
  const proComplimentary = proEntitled && isComplimentaryGrant(subscription)
  const ownsLeagueRecord = Boolean(userId && leagueSubscription && leagueSubscription.purchaser_user_id === userId)
  const manageable = showsManageButton({
    ownsActivePro: proEntitled && !proComplimentary,
    ownsLeagueRecord,
    leagueRecordIsComplimentary: leagueSubscription ? leagueComplimentary : null,
  })
  const lapsed = subscription && !proEntitled ? subscription : null

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  const renewal = parseRenewalState(subscription?.renewal_state)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link to="/account" className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
          ← Account
        </Link>
        <h1 className="text-2xl font-bold">{PRO_GROUP_NAME}</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Subscription status, billing, and premium benefits
        </p>
      </div>

      {status === 'error' && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error ?? "Couldn't check your subscription status."}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Subscription status</CardTitle>
          {hasAccess ? (
            <Badge tone="success">Active</Badge>
          ) : status === 'loading' ? (
            <Badge tone="neutral">Checking…</Badge>
          ) : (
            <Badge tone="neutral">Free</Badge>
          )}
        </CardHeader>
        <dl className="space-y-2 text-sm">
          <Row label="Current plan" value={proEntitled ? proPlanName(subscription) : 'Free'} />
          <Row label="Premium access" value={premiumAccessLabel(source, leagueComplimentary)} />
          {proEntitled && subscription?.expires_at && (
            <Row label={renewal === 'will_renew' ? 'Renewal date' : 'Active until'} value={formatDate(subscription.expires_at)} />
          )}
          {proEntitled && <Row label="Renewal" value={RENEWAL_TEXT[renewal]} />}
          {subscription?.last_verified_at && <Row label="Last verified" value={formatDateTime(subscription.last_verified_at)} />}
        </dl>

        {isWorldChampionGrant(subscription) && proEntitled && (
          <p className="mt-3 text-xs" style={{ color: 'var(--color-warning)' }}>
            👑 Complimentary — your World Champion reward
            {subscription?.expires_at ? ` until ${formatDate(subscription.expires_at)}` : ''}. No subscription to manage.
          </p>
        )}
        {proComplimentary && !isWorldChampionGrant(subscription) && (
          <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Complimentary access — no App Store subscription to manage.
          </p>
        )}
        {lapsed && (
          <p className="mt-3 text-xs" style={{ color: 'var(--color-warning)' }}>
            {lapsed.status === 'revoked'
              ? `Your ${proPlanName(lapsed)} subscription was refunded and is no longer active.`
              : `Your ${proPlanName(lapsed)} subscription expired${lapsed.expires_at ? ` on ${formatDate(lapsed.expires_at)}` : ''}. Resubscribe anytime to restore access.`}
          </p>
        )}
      </Card>

      {source === 'league_plus' ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {premiumAccessDescription(source, leagueName, leagueComplimentary)}
        </p>
      ) : source === 'none' && leagueName && !proEntitled ? (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          League Plus access only applies to eligible leagues. You are viewing {leagueName}, which doesn&apos;t give you League
          Plus access. Subscribe to Pro for premium access across all of your leagues.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {manageable ? (
          <a
            href={APPLE_MANAGE_SUBSCRIPTIONS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
          >
            Manage subscription in the App Store
          </a>
        ) : !proComplimentary ? (
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-lg px-3.5 py-2 text-sm font-medium"
            style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
          >
            Upgrade to {PRO_GROUP_NAME} in the iOS app
          </a>
        ) : null}
        <Button variant="secondary" onClick={handleRefresh} disabled={refreshing || status === 'loading'}>
          {refreshing ? 'Checking…' : 'Refresh status'}
        </Button>
        {selectedLeague?.roles.includes('owner') && (
          <Link
            to="/admin/league-plus"
            className="inline-flex items-center rounded-lg border px-3.5 py-2 text-sm font-medium"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {LEAGUE_PLUS_GROUP_NAME} for {selectedLeague.league.name}
          </Link>
        )}
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Premium benefits</h2>
        <p className="mb-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {hasAccess ? 'Included in your plan' : `Included with ${PRO_GROUP_NAME}`}
        </p>
        <Card>
          <ul className="space-y-3">
            {availableBenefits().map((benefit) => (
              <li key={benefit.key} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{benefit.title}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {benefit.summary}
                  </p>
                </div>
                <span
                  aria-label={isFeatureUnlocked(benefit.feature, hasAccess) ? 'Included' : 'Locked'}
                  style={{ color: isFeatureUnlocked(benefit.feature, hasAccess) ? 'var(--color-success)' : 'var(--color-text-muted)' }}
                >
                  {isFeatureUnlocked(benefit.feature, hasAccess) ? '✓' : '🔒'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Subscriptions are purchased, renewed, restored and cancelled in the iPhone and iPad app (Apple handles billing). This
        page only reflects the status the VRC servers have verified with Apple
        {lastCheckedAt ? ` — last checked ${formatDateTime(lastCheckedAt.toISOString())}` : ''}. Premium access is never
        granted from a stored flag: the server decides it each time.
      </p>
      {leagueSubscription && (
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {selectedLeague?.league.name}: {leaguePlusPlanName(leagueSubscription.product_id)}
        </p>
      )}
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
