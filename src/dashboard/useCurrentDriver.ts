import { useAuth } from '@/hooks/useAuth'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import type { DriverRow } from '@/types/database'

/** The signed-in user's own driver row in the active league, or null if
 *  they're a Viewer/haven't linked a driver profile — driver-scoped tiles
 *  use this to render a "configuration required" state instead of crashing. */
export function useCurrentDriver(): DriverRow | null {
  const { state } = useAuth()
  const { drivers } = useDashboardBaseData()
  const userId = state.kind === 'authenticated' ? state.user.id : null
  if (!userId) return null
  return drivers.find((d) => d.user_id === userId) ?? null
}
