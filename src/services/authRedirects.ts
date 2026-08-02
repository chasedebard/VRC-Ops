import { normalizeAppPath } from '@/utils/siteUrl'

export const PENDING_INVITE_KEY = 'vrc-pending-invite-token'

const defaultPostAuthPath = '/dashboard'
const redirectParamNames = ['next', 'redirectTo', 'redirect', 'returnTo']

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function getCurrentUrl(): string {
  return window.location.href
}

export function setPendingInviteToken(token: string): void {
  getStorage()?.setItem(PENDING_INVITE_KEY, token)
}

export function clearPendingInviteToken(): void {
  getStorage()?.removeItem(PENDING_INVITE_KEY)
}

export function getPendingInvitePath(): string | null {
  const token = getStorage()?.getItem(PENDING_INVITE_KEY)
  return token ? `/invite/${encodeURIComponent(token)}` : null
}

export function getRedirectPathFromUrl(url = getCurrentUrl()): string | null {
  const parsed = new URL(url)

  for (const param of redirectParamNames) {
    const redirectPath = normalizeAppPath(parsed.searchParams.get(param))
    if (redirectPath) return redirectPath
  }

  return null
}

export function getRequestedPostAuthRedirectPath(url = getCurrentUrl()): string | null {
  return getPendingInvitePath() ?? getRedirectPathFromUrl(url)
}

export function getPostAuthRedirectPath(url = getCurrentUrl()): string {
  return getRequestedPostAuthRedirectPath(url) ?? defaultPostAuthPath
}

export function authPathWithRedirect(path: string, redirectPath: string | null): string {
  const safeRedirectPath = normalizeAppPath(redirectPath)
  const target = new URL(path, 'https://vrc-ops.org')

  if (safeRedirectPath) target.searchParams.set('next', safeRedirectPath)

  return `${target.pathname}${target.search}`
}
