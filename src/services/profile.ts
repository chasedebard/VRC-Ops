import { supabase } from '@/supabase/client'
import type { ProfileRow } from '@/types/database'

// `authenticated` only has a column-level GRANT on profiles (see migration
// 20260621120001_backend_cost_security_safeguards.sql), deliberately
// excluding `email` from direct client reads — a `select('*')` here fails
// with "permission denied for table profiles" because the wildcard expands
// to every column, including the ungranted one. Enumerate columns explicitly.
const PROFILE_COLUMNS =
  'id, display_name, first_name, last_name, avatar_url, avatar_storage_path, profile_completed, created_at, updated_at'

const AVATAR_BUCKET = 'user-avatars'

export async function getOwnProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .returns<ProfileRow[]>()
    .maybeSingle()
  if (error) throw error
  return data
}

export async function updateOwnProfile(
  userId: string,
  patch: Partial<Pick<ProfileRow, 'display_name' | 'first_name' | 'last_name' | 'avatar_url' | 'avatar_storage_path'>>,
): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...patch, profile_completed: true, updated_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw error
}

/**
 * Uploads a new account avatar to the versioned shape `{user_id}/avatar/{uuid}.jpg` (storage policy
 * `user_avatars_insert`), so the profile row can be updated — and the previous object deleted — only after the new one
 * is safely persisted.
 */
export async function uploadAccountAvatar(userId: string, jpeg: Blob): Promise<string> {
  const path = `${userId}/avatar/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, jpeg, {
    contentType: 'image/jpeg',
    upsert: false,
  })
  if (error) throw error
  return path
}

export async function deleteAccountAvatar(path: string): Promise<void> {
  const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([path])
  if (error) throw error
}

const SIGNED_URL_TTL_SECONDS = 60 * 60
const urlCache = new Map<string, { url: string; expiresAt: number }>()

/** Signed URL for an account avatar (private bucket; readable by the owner and league co-members). */
export async function getAccountAvatarUrl(path: string): Promise<string | null> {
  const cached = urlCache.get(path)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error || !data) return null
  urlCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}

/**
 * Saves profile text fields and an optional avatar change in the safe order iOS uses: upload the new object, update the
 * row, and only then delete the old object — if the row update fails, the orphaned new upload is cleaned up instead.
 */
export async function saveProfileWithAvatar(
  userId: string,
  fields: { display_name: string; first_name: string | null; last_name: string | null },
  avatar: { kind: 'unchanged' } | { kind: 'remove' } | { kind: 'new'; jpeg: Blob },
  previousPath: string | null,
): Promise<void> {
  let uploadedPath: string | null = null
  const patch: Parameters<typeof updateOwnProfile>[1] = { ...fields }
  if (avatar.kind === 'remove') {
    patch.avatar_storage_path = null
  } else if (avatar.kind === 'new') {
    uploadedPath = await uploadAccountAvatar(userId, avatar.jpeg)
    patch.avatar_storage_path = uploadedPath
  }
  try {
    await updateOwnProfile(userId, patch)
  } catch (err) {
    if (uploadedPath) await deleteAccountAvatar(uploadedPath).catch(() => undefined)
    throw err
  }
  const nextPath = avatar.kind === 'new' ? uploadedPath : avatar.kind === 'remove' ? null : previousPath
  if (previousPath && previousPath !== nextPath) {
    urlCache.delete(previousPath)
    await deleteAccountAvatar(previousPath).catch(() => undefined)
  }
}
