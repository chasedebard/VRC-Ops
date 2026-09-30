export const canonicalSiteUrl = 'https://vrc-ops.org'
export const canonicalHost = 'vrc-ops.org'
export const wwwHost = 'www.vrc-ops.org'
export const authCallbackPath = '/auth/callback'

const localHostnames = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

function hasBrowserWindow(): boolean {
  return typeof window !== 'undefined'
}

function isLocalHostname(hostname: string): boolean {
  return localHostnames.has(hostname.toLowerCase())
}

function normalizeBaseUrl(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  try {
    const url = new URL(withProtocol)
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function isLocalUrl(value: string): boolean {
  try {
    return isLocalHostname(new URL(value).hostname)
  } catch {
    return false
  }
}

export function getAppBaseUrl(): string {
  const configured = import.meta.env.VITE_APP_BASE_URL
  const normalized = configured ? normalizeBaseUrl(configured) : null

  if (normalized && !(import.meta.env.PROD && isLocalUrl(normalized))) {
    return normalized
  }

  if (import.meta.env.DEV && hasBrowserWindow() && isLocalHostname(window.location.hostname)) {
    return window.location.origin
  }

  return canonicalSiteUrl
}

export function normalizeAppPath(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.startsWith('//')) return null

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed)
      const sameOrigin = hasBrowserWindow() && url.origin === window.location.origin
      const canonicalOrigin = url.protocol === 'https:' && [canonicalHost, wwwHost].includes(url.hostname)
      const localDevOrigin = import.meta.env.DEV && isLocalHostname(url.hostname)

      if (!sameOrigin && !canonicalOrigin && !localDevOrigin) return null
      return `${url.pathname}${url.search}${url.hash}` || '/'
    }
  } catch {
    return null
  }

  if (!trimmed.startsWith('/')) return null
  return trimmed
}

export function getAuthCallbackUrl(options: { type?: string; next?: string | null } = {}): string {
  const callbackUrl = new URL(authCallbackPath, `${getAppBaseUrl()}/`)
  if (options.type) callbackUrl.searchParams.set('type', options.type)

  const next = normalizeAppPath(options.next)
  if (next) callbackUrl.searchParams.set('next', next)

  return callbackUrl.toString()
}

export function redirectWwwToCanonical(): boolean {
  if (!hasBrowserWindow() || window.location.hostname.toLowerCase() !== wwwHost) return false

  const target = new URL(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
    canonicalSiteUrl,
  )
  window.location.replace(target.toString())
  return true
}
