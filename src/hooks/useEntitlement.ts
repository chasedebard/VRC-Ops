import { useContext } from 'react'
import { EntitlementContext } from '@/app/EntitlementProvider'

export function useEntitlement() {
  const ctx = useContext(EntitlementContext)
  if (!ctx) throw new Error('useEntitlement must be used within EntitlementProvider')
  return ctx
}
