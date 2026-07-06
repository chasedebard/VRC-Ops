import { supabase } from '@/supabase/client'
import type { DriverRow } from '@/types/database'

const DRIVER_PHOTO_BUCKET = 'driver-profile-images'
const UPLOAD_SIGNED_URL_TTL_SECONDS = 60 * 60

/**
 * Uploads a driver profile photo to the private `driver-profile-images` bucket
 * using the same deterministic path the native app writes
 * (`{league_id}/{driver_id}/profile/{uuid}.jpg`, enforced server-side by
 * vrc_guard_driver_profile_image_path). Storage RLS allows league
 * managers or the driver's own linked account to write here — anyone else's
 * upload attempt is rejected by the bucket policy, not just hidden by the UI.
 */
export async function uploadDriverPhoto(
  leagueId: string,
  driverId: string,
  file: File,
): Promise<string> {
  const path = `${leagueId}/${driverId}/profile/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(DRIVER_PHOTO_BUCKET).upload(path, file, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function deleteDriverPhoto(path: string): Promise<void> {
  const { error } = await supabase.storage.from(DRIVER_PHOTO_BUCKET).remove([path])
  if (error) throw error
}

/**
 * Mirrors the native app's `effectiveProfileImagePath` (VRCManagementModels.swift):
 * prefer the newer Storage-backed `profile_image_path`, fall back to the legacy
 * `image_url` column, which itself may be either a full external URL or an
 * older bucket-relative path.
 */
type AvatarSource = { kind: 'storage-path'; path: string } | { kind: 'external-url'; url: string }

function resolveAvatarSource(
  driver: Pick<DriverRow, 'profile_image_path' | 'image_url'>,
): AvatarSource | null {
  const path = driver.profile_image_path
  if (path) return { kind: 'storage-path', path }

  const legacy = driver.image_url
  if (!legacy) return null
  return legacy.includes('://')
    ? { kind: 'external-url', url: legacy }
    : { kind: 'storage-path', path: legacy }
}

/**
 * In-memory signed-URL cache, matching the native app's VRCDriverImageURLCache:
 * ~50 minute lifetime with a 60s safety margin, and concurrent requests for the
 * same path share one in-flight sign call instead of each re-signing.
 */
const SIGNED_URL_LIFETIME_MS = 50 * 60 * 1000
const SAFETY_MARGIN_MS = 60 * 1000
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>()
const inFlight = new Map<string, Promise<string | null>>()

async function getSignedUrl(path: string): Promise<string | null> {
  const cached = signedUrlCache.get(path)
  if (cached && cached.expiresAt > Date.now() + SAFETY_MARGIN_MS) return cached.url

  const pending = inFlight.get(path)
  if (pending) return pending

  const request = (async () => {
    const { data, error } = await supabase.storage
      .from(DRIVER_PHOTO_BUCKET)
      .createSignedUrl(path, UPLOAD_SIGNED_URL_TTL_SECONDS)
    inFlight.delete(path)
    if (error || !data) return null
    signedUrlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + SIGNED_URL_LIFETIME_MS })
    return data.signedUrl
  })()
  inFlight.set(path, request)
  return request
}

/** Resolves whatever image source a driver has (Storage path or legacy external URL) to a displayable URL. */
export async function getDriverAvatarUrl(
  driver: Pick<DriverRow, 'profile_image_path' | 'image_url'>,
): Promise<string | null> {
  const source = resolveAvatarSource(driver)
  if (!source) return null
  return source.kind === 'external-url' ? source.url : getSignedUrl(source.path)
}

export function invalidateDriverAvatarCache(path: string): void {
  signedUrlCache.delete(path)
}
