export type EntitlementSource = 'individual_pro' | 'league_plus' | 'none'

export interface ResolvedEntitlement {
  hasAccess: boolean
  source: EntitlementSource
}

/**
 * Mirrors VRCSubscriptionModels.resolve (iOS) and the backend's
 * vrc_has_premium_access RPC: individual Pro short-circuits — it applies
 * regardless of league — then League+ on the active league (already
 * membership-gated server-side by the RPC), then free. Role is never a
 * factor; only purchasing League+ is owner-restricted, not consuming it.
 */
export function resolveEntitlement(isIndividualPro: boolean, hasLeaguePlus: boolean): ResolvedEntitlement {
  if (isIndividualPro) return { hasAccess: true, source: 'individual_pro' }
  if (hasLeaguePlus) return { hasAccess: true, source: 'league_plus' }
  return { hasAccess: false, source: 'none' }
}
