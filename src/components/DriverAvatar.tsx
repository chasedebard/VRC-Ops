import { useEffect, useState } from 'react'
import { getDriverAvatarUrl } from '@/services/storage'
import type { DriverRow } from '@/types/database'

export type DriverAvatarSize = 'sm' | 'md' | 'card' | 'hero'

const SIZE_PX: Record<DriverAvatarSize, number> = { sm: 28, md: 40, card: 72, hero: 110 }
const FONT_PX: Record<DriverAvatarSize, number> = { sm: 10, md: 14, card: 26, hero: 38 }

/** Stable, deterministic color per driver (no class-color join needed) — same
 *  palette approach as the native app's class-tinted initials circle, just
 *  keyed by driver id instead of class since class color isn't in this schema. */
const PALETTE = ['#3b82f6', '#f97316', '#a855f7', '#22c55e', '#ef4444', '#eab308', '#06b6d4', '#ec4899']

function colorForDriver(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

function initialsFor(displayName: string): string {
  return displayName
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

interface DriverAvatarProps {
  driver: Pick<DriverRow, 'id' | 'display_name' | 'profile_image_path' | 'image_url'>
  size?: DriverAvatarSize
  className?: string
}

/**
 * Mirrors the native app's VRCRemoteDriverAvatarView: prefers
 * profile_image_path (Supabase Storage, signed URL) falling back to the
 * legacy image_url, shows a neutral loading circle while the URL resolves
 * (never initials-then-flash), and falls back to initials on a
 * per-driver-colored circle if there's no photo or it fails to load.
 */
export function DriverAvatar({ driver, size = 'sm', className = '' }: DriverAvatarProps) {
  const px = SIZE_PX[size]
  const hasSource = Boolean(driver.profile_image_path || driver.image_url)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(hasSource)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!hasSource) {
      setLoading(false)
      setUrl(null)
      return
    }
    setLoading(true)
    setFailed(false)
    getDriverAvatarUrl(driver)
      .then((resolved) => {
        if (cancelled) return
        setUrl(resolved)
        setLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver.id, driver.profile_image_path, driver.image_url])

  const style = { width: px, height: px, minWidth: px }

  if (loading) {
    return (
      <div
        className={`rounded-full ${className}`}
        style={{ ...style, backgroundColor: 'var(--color-border)' }}
        aria-hidden
      />
    )
  }

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={driver.display_name}
        className={`rounded-full object-cover ${className}`}
        style={style}
        onError={() => setFailed(true)}
      />
    )
  }

  const color = colorForDriver(driver.id)
  return (
    <div
      className={`flex items-center justify-center rounded-full font-bold ${className}`}
      style={{ ...style, backgroundColor: `${color}26`, color, fontSize: FONT_PX[size] }}
    >
      {initialsFor(driver.display_name)}
    </div>
  )
}
