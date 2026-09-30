import { useState } from 'react'
import { Card, CardHeader, CardTitle } from './Card'
import { Badge } from './Badge'
import { Button } from './Button'
import { useEntitlement } from '@/hooks/useEntitlement'
import { formatDateTime } from '@/utils/format'

const APP_STORE_URL = 'https://apps.apple.com/us/app/vrc-ops/id6780654622'

interface ProLockedStateProps {
  title?: string
  description?: string
}

/**
 * The website never sells or processes a subscription itself — this is the
 * required "subscribe through the app" state for any Pro-gated surface.
 * Shows a distinct message when the last entitlement check itself failed
 * (network/RLS error) vs. a confirmed-free state, and always offers a manual
 * recheck for the "subscribed on iOS, website hasn't seen it yet" case.
 */
export function ProLockedState({
  title = 'VRC Ops Pro required',
  description = 'This feature is included with VRC Ops Pro or a league with VRC League Plus.',
}: ProLockedStateProps) {
  const { status, error, lastCheckedAt, refresh } = useEntitlement()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refresh()
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Card className="mx-auto max-w-lg text-center">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Badge tone="warning">PRO</Badge>
      </CardHeader>

      {status === 'error' ? (
        <p className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error ?? "Couldn't check your subscription status."}
        </p>
      ) : (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </p>
      )}

      <p className="mt-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        VRC Ops Pro is available through the iPhone and iPad app. Download or open VRC Ops from the
        App Store and subscribe with the same account. Your Pro access will then be available on the
        website.
      </p>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition"
          style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
        >
          Open the App Store
        </a>
        <Button variant="secondary" onClick={handleRefresh} disabled={refreshing || status === 'loading'}>
          {refreshing ? 'Checking…' : 'Already subscribed? Refresh'}
        </Button>
      </div>

      {lastCheckedAt && (
        <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Last checked {formatDateTime(lastCheckedAt.toISOString())}
        </p>
      )}
    </Card>
  )
}
