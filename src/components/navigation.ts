import type { LeaguePermissions } from '@/permissions/resolver'

/**
 * Web mirror of the iOS shell's category model (`VRCMainCategory` / `VRCPermissionResolver.phase13Categories`). Role gating follows the
 * app: Race Weekend and Pit Wall are for drivers and race-control staff, Administration for Owner/Admin. Hiding an item is presentation
 * only — every route and every write is still enforced by RLS / RPCs.
 */
export interface NavItem {
  key: string
  to: string
  label: string
  /** Path prefixes that keep this item highlighted (and select its section sub-navigation). */
  match: string[]
  /** Premium feature marker shown while the viewer lacks Pro / League Plus. */
  premium?: boolean
}

export interface SubNavItem {
  to: string
  label: string
}

export function mainNavigation(permissions: LeaguePermissions): NavItem[] {
  const isDriverOrOps = permissions.roles.has('driver') || permissions.canOperateRaceControl
  const items: NavItem[] = [
    { key: 'home', to: '/dashboard', label: 'Home', match: ['/dashboard'] },
    { key: 'championship', to: '/championships', label: 'Championship', match: ['/championships', '/seasons', '/tracks', '/classes', '/regions'] },
  ]
  if (isDriverOrOps) {
    items.push({ key: 'raceWeekend', to: '/race-weekend', label: 'Race Weekend', match: ['/race-weekend', '/race-prep', '/qualifying'] })
  }
  items.push(
    { key: 'results', to: '/results', label: 'Results', match: ['/results'] },
    { key: 'standings', to: '/standings', label: 'Standings', match: ['/standings'] },
  )
  if (isDriverOrOps) items.push({ key: 'pitWall', to: '/pit-wall', label: 'Pit Wall', match: ['/pit-wall'], premium: true })
  items.push(
    { key: 'predictions', to: '/predictions', label: 'Predictions', match: ['/predictions'], premium: true },
    { key: 'drivers', to: '/drivers', label: 'Drivers', match: ['/drivers'] },
  )
  if (permissions.usesAdminShell) items.push({ key: 'administration', to: '/admin', label: 'Administration', match: ['/admin'] })
  items.push({ key: 'settings', to: '/account', label: 'Settings', match: ['/account'] })
  return items
}

export function isItemActive(item: NavItem, pathname: string): boolean {
  return item.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** Section sub-navigation (the iOS bottom-bar subsections), shown only where a category has more than one destination. */
export function subNavigation(itemKey: string, permissions: LeaguePermissions): SubNavItem[] {
  switch (itemKey) {
    case 'championship':
      return [
        { to: '/championships', label: 'Championships & seasons' },
        ...(permissions.canManageSetup
          ? [
              { to: '/tracks', label: 'Tracks' },
              { to: '/classes', label: 'Classes' },
              { to: '/regions', label: 'Regions' },
            ]
          : []),
      ]
    case 'drivers':
      return [
        { to: '/drivers', label: 'Directory' },
        ...(permissions.roles.has('driver') ? [{ to: '/drivers/me', label: 'My driver' }] : []),
      ]
    case 'administration':
      return [
        { to: '/admin', label: 'League' },
        { to: '/admin/members', label: 'Members' },
        { to: '/admin/invitations', label: 'Invitations' },
        { to: '/admin/announcements', label: 'Announcements' },
        { to: '/admin/league-plus', label: 'League Plus' },
      ]
    case 'settings':
      return [
        { to: '/account', label: 'Account' },
        { to: '/account/global-rating', label: 'Global rating' },
        { to: '/account/subscription', label: 'Subscription' },
        { to: '/account/leagues', label: 'Leagues' },
        { to: '/account/legal', label: 'Legal & privacy' },
      ]
    default:
      return []
  }
}
