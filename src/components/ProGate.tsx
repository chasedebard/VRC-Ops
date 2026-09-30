import type { ReactNode } from 'react'
import { useEntitlement } from '@/hooks/useEntitlement'
import { ProLockedState } from './ProLockedState'
import { LoadingState } from './States'

interface ProGateProps {
  children: ReactNode
  title?: string
  description?: string
}

/**
 * Pro-tier counterpart to permissions/Guard's RequirePermission. Mounted at
 * the route or call-site level so gated children (and their data fetches)
 * never mount for a non-entitled visitor, rather than fetching first and
 * hiding the result.
 */
export function ProGate({ children, title, description }: ProGateProps) {
  const { status, hasAccess } = useEntitlement()
  if (status === 'loading') return <LoadingState label="Checking subscription status…" />
  if (!hasAccess) return <ProLockedState title={title} description={description} />
  return <>{children}</>
}
