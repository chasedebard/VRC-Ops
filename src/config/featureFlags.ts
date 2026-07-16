/**
 * No remote feature-flag service exists in this repo yet — this is a static,
 * trivially swappable stand-in for one. The customizable dashboard's only
 * integration point with rollout state is this one constant, read by
 * DashboardPage's routing conditional; flipping it back to 'hidden' fully
 * restores the previous fixed Home dashboard with zero other changes.
 */
export type FeatureFlagStatus = 'hidden' | 'coming_soon' | 'active'

export const DASHBOARD_CUSTOMIZATION_STATUS: FeatureFlagStatus = 'active'
