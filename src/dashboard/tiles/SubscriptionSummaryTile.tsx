import { registerTile } from '../registry'
import { SubscriptionStatusCard } from '@/components/SubscriptionStatusCard'
import { CreditCardIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function SubscriptionSummaryTile(_props: TileComponentProps) {
  return <SubscriptionStatusCard />
}

registerTile({
  type: 'subscription_summary',
  displayName: 'Subscription Summary',
  description: 'Your Pro / League Plus status and renewal date.',
  icon: CreditCardIcon,
  category: 'other',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'medium',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: SubscriptionSummaryTile,
})
