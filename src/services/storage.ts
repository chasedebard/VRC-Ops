import { supabase } from '@/supabase/client'

const DRIVER_PHOTO_BUCKET = 'driver-profile-images'
const SIGNED_URL_TTL_SECONDS = 60 * 60

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

/** Private bucket — members get a time-limited signed URL, not a public one. */
export async function getDriverPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(DRIVER_PHOTO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data.signedUrl
}

export async function deleteDriverPhoto(path: string): Promise<void> {
  const { error } = await supabase.storage.from(DRIVER_PHOTO_BUCKET).remove([path])
  if (error) throw error
}
