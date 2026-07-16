import { DASHBOARD_CUSTOMIZATION_STATUS } from '@/config/featureFlags'
import DashboardPage from './DashboardPage'
import CustomizableDashboardPage from './CustomizableDashboardPage'

/**
 * Single integration point between the legacy fixed Home dashboard and the
 * new customizable tile dashboard. The two share no state — flipping
 * DASHBOARD_CUSTOMIZATION_STATUS back to 'hidden' fully restores the
 * previous behavior with zero other changes.
 */
export default function HomePage() {
  if (DASHBOARD_CUSTOMIZATION_STATUS === 'active') return <CustomizableDashboardPage />

  if (DASHBOARD_CUSTOMIZATION_STATUS === 'coming_soon') {
    return (
      <div className="space-y-4">
        <div
          className="rounded-lg border p-3 text-sm"
          style={{ borderColor: 'var(--color-accent)', color: 'var(--color-text-muted)' }}
        >
          A customizable dashboard is coming soon.
        </div>
        <DashboardPage />
      </div>
    )
  }

  return <DashboardPage />
}
