import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getAccountAvatarUrl, saveProfileWithAvatar } from '@/services/profile'
import { prepareSquareJpeg } from '@/utils/imageProcessing'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Field } from '@/components/Field'
import { Button } from '@/components/Button'
import { backendErrorMessage } from '@/utils/backendErrors'

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toUpperCase() || '?'
  )
}

/** Account avatar: an uploaded image, else initials. (The assigned-driver fallback lives on the driver profile.) */
export function AccountAvatar({ name, path, size = 72 }: { name: string; path: string | null; size?: number }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    if (!path) {
      setUrl(null)
      return
    }
    getAccountAvatarUrl(path).then((u) => {
      if (!cancelled) setUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [path])
  return url ? (
    <img src={url} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-full font-bold"
      style={{ width: size, height: size, backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
    >
      {initialsOf(name)}
    </span>
  )
}

/** Edit profile (display/first/last name and account image) — iOS `VRCProfileSettingsView`. */
export function ProfileCard() {
  const { state } = useAuth()
  const { profile, refresh } = useLeagueSession()
  const fileRef = useRef<HTMLInputElement>(null)
  const [displayName, setDisplayName] = useState(profile?.display_name ?? '')
  const [firstName, setFirstName] = useState(profile?.first_name ?? '')
  const [lastName, setLastName] = useState(profile?.last_name ?? '')
  const [newImage, setNewImage] = useState<Blob | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  useEffect(() => {
    setDisplayName(profile?.display_name ?? '')
    setFirstName(profile?.first_name ?? '')
    setLastName(profile?.last_name ?? '')
  }, [profile])

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  if (state.kind !== 'authenticated') return null
  const user = state.user

  // Clearing a previously-set optional field counts as a change just as much as setting one.
  const hasChanges =
    displayName.trim() !== (profile?.display_name ?? '') ||
    (firstName.trim() || null) !== (profile?.first_name ?? null) ||
    (lastName.trim() || null) !== (profile?.last_name ?? null) ||
    newImage !== null ||
    removeImage
  const canSave = hasChanges && displayName.trim().length > 0 && !busy

  async function onPickFile(file: File | undefined) {
    setImageError(null)
    if (!file) return
    try {
      const jpeg = await prepareSquareJpeg(file)
      setNewImage(jpeg)
      setRemoveImage(false)
      if (preview) URL.revokeObjectURL(preview)
      setPreview(URL.createObjectURL(jpeg))
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'That image could not be used.')
    }
  }

  async function save() {
    setBusy(true)
    setMessage(null)
    try {
      await saveProfileWithAvatar(
        user.id,
        {
          display_name: displayName.trim(),
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
        },
        removeImage ? { kind: 'remove' } : newImage ? { kind: 'new', jpeg: newImage } : { kind: 'unchanged' },
        profile?.avatar_storage_path ?? null,
      )
      setNewImage(null)
      setRemoveImage(false)
      setPreview(null)
      await refresh()
      setMessage({ tone: 'ok', text: 'Profile saved.' })
    } catch (err) {
      setMessage({ tone: 'error', text: backendErrorMessage(err, 'Could not save your profile.') })
    } finally {
      setBusy(false)
    }
  }

  const name = displayName || profile?.display_name || 'Your profile'
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          {preview ? (
            <img src={preview} alt="" className="h-[72px] w-[72px] rounded-full object-cover" />
          ) : removeImage ? (
            <AccountAvatar name={name} path={null} />
          ) : (
            <AccountAvatar name={name} path={profile?.avatar_storage_path ?? null} />
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Choose a profile image"
              onChange={(e) => {
                void onPickFile(e.target.files?.[0])
                e.target.value = ''
              }}
            />
            <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()}>
              {profile?.avatar_storage_path || newImage ? 'Change image' : 'Add image'}
            </Button>
            {(profile?.avatar_storage_path || newImage) && !removeImage && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setNewImage(null)
                  setPreview(null)
                  setRemoveImage(true)
                }}
              >
                Remove image
              </Button>
            )}
          </div>
        </div>
        {imageError && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
            {imageError}
          </p>
        )}
        <Field label="Email" value={user.email ?? ''} disabled readOnly />
        <Field label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" placeholder="Optional" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          <Field label="Last name" placeholder="Optional" value={lastName} onChange={(e) => setLastName(e.target.value)} />
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={!canSave}>
            {busy ? 'Saving…' : 'Save profile'}
          </Button>
          {message && (
            <span
              role={message.tone === 'error' ? 'alert' : 'status'}
              className="text-sm"
              style={{ color: message.tone === 'ok' ? 'var(--color-success)' : 'var(--color-danger)' }}
            >
              {message.text}
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}
