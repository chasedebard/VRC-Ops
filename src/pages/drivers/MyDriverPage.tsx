import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getDrivers } from '@/services/drivers'
import { getLinkedDriver, updateSelfDriverProfile } from '@/services/driverProfileData'
import { deleteDriverPhoto, invalidateDriverAvatarCache, uploadDriverPhoto } from '@/services/storage'
import { prepareSquareJpeg } from '@/utils/imageProcessing'
import { driverNumberMessages } from '@/utils/driverValidation'
import { hasAcceptedCurrentDoc } from '@/utils/legalState'
import { backendErrorMessage } from '@/utils/backendErrors'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { DriverAvatar } from '@/components/DriverAvatar'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { DriverRow } from '@/types/database'

/**
 * My Driver (iOS `VRCDriverSelfServiceView`). Only the self-service fields are editable; the official number, team, class, region, roles,
 * results, rating and standings stay with league staff — the backend trigger `vrc_guard_driver_self_update` rejects those columns for
 * anyone who can't manage the league, so this page cannot be used to write them. Photo changes require the current Sharing Terms.
 */
export default function MyDriverPage() {
  const { state } = useAuth()
  const { selectedLeague, legal } = useLeagueSession()
  const userId = state.kind === 'authenticated' ? state.user.id : null
  const leagueId = selectedLeague?.league.id ?? null

  const [driver, setDriver] = useState<DriverRow | null | undefined>(undefined)
  const [leagueDrivers, setLeagueDrivers] = useState<DriverRow[]>([])
  const [form, setForm] = useState({ displayName: '', firstName: '', lastName: '', requested: '', bio: '', platformId: '', racingId: '' })
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const canEditImages = hasAcceptedCurrentDoc(legal, 'sharing')

  function seed(d: DriverRow) {
    setForm({
      displayName: d.display_name,
      firstName: d.first_name ?? '',
      lastName: d.last_name ?? '',
      requested: d.requested_driver_number ?? '',
      bio: d.bio ?? '',
      platformId: d.platform_id ?? '',
      racingId: d.racing_id ?? '',
    })
  }

  async function load() {
    if (!leagueId || !userId) return
    setError(null)
    try {
      const [mine, all] = await Promise.all([getLinkedDriver(leagueId, userId), getDrivers(leagueId, true)])
      setDriver(mine)
      setLeagueDrivers(all)
      if (mine) seed(mine)
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load your driver profile.'))
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, userId])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error && driver === undefined) return <ErrorState message={error} onRetry={load} />
  if (driver === undefined) return <LoadingState label="Loading your driver…" />
  if (driver === null) {
    return (
      <EmptyState
        title="No linked driver profile"
        description="Ask an Owner or Admin to link your account to your league driver before self-service editing is available."
        action={
          <Link to="/drivers" className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
            Browse drivers
          </Link>
        }
      />
    )
  }

  const current = driver
  const requestedNumber = form.requested.trim()
  const problems = driverNumberMessages(requestedNumber, current.id, leagueDrivers)
  // Requesting a number other than the current one starts a pending request; clearing the field withdraws it.
  const normalizedRequest = requestedNumber && requestedNumber !== (current.driver_number ?? '') ? requestedNumber : null
  const dirty =
    form.displayName !== current.display_name ||
    form.firstName !== (current.first_name ?? '') ||
    form.lastName !== (current.last_name ?? '') ||
    normalizedRequest !== current.requested_driver_number ||
    form.bio !== (current.bio ?? '') ||
    form.platformId !== (current.platform_id ?? '') ||
    form.racingId !== (current.racing_id ?? '')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      await updateSelfDriverProfile(current.id, {
        display_name: form.displayName.trim(),
        first_name: form.firstName.trim() || null,
        last_name: form.lastName.trim() || null,
        requested_driver_number: normalizedRequest,
        driver_number_request_status: normalizedRequest === null ? null : 'pending',
        bio: form.bio.trim() || null,
        platform_id: form.platformId.trim() || null,
        racing_id: form.racingId.trim() || null,
      })
      setNotice('Driver profile saved.')
      await load()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not save your profile.'))
    } finally {
      setSaving(false)
    }
  }

  async function changePhoto(file: File | undefined) {
    if (!file) return
    setPhotoBusy(true)
    setError(null)
    try {
      const jpeg = await prepareSquareJpeg(file)
      const previous = current.profile_image_path
      const path = await uploadDriverPhoto(current.league_id, current.id, new File([jpeg], 'profile.jpg', { type: 'image/jpeg' }))
      try {
        await updateSelfDriverProfile(current.id, { profile_image_path: path, image_url: path })
      } catch (err) {
        await deleteDriverPhoto(path).catch(() => undefined)
        throw err
      }
      if (previous && previous !== path) {
        invalidateDriverAvatarCache(previous)
        await deleteDriverPhoto(previous).catch(() => undefined)
      }
      setNotice('Photo updated.')
      await load()
    } catch (err) {
      setError(backendErrorMessage(err, err instanceof Error ? err.message : 'Could not update your photo.'))
    } finally {
      setPhotoBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removePhoto() {
    const previous = current.profile_image_path
    setPhotoBusy(true)
    setError(null)
    try {
      await updateSelfDriverProfile(current.id, { profile_image_path: null, image_url: null })
      if (previous) {
        invalidateDriverAvatarCache(previous)
        await deleteDriverPhoto(previous).catch(() => undefined)
      }
      setNotice('Photo removed.')
      await load()
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not remove your photo.'))
    } finally {
      setPhotoBusy(false)
    }
  }

  const hasPhoto = Boolean(current.profile_image_path || current.image_url)

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">My Driver</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Only self-service fields are shown.{' '}
          <Link to={`/drivers/${current.id}`} className="underline" style={{ color: 'var(--color-accent)' }}>
            View my public profile
          </Link>
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm" style={{ color: 'var(--color-success)' }}>
          {notice}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile photo</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-4">
          <DriverAvatar driver={current} size="hero" />
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void changePhoto(e.target.files?.[0])} />
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" type="button" disabled={!canEditImages || photoBusy} onClick={() => fileRef.current?.click()}>
                {photoBusy ? 'Working…' : hasPhoto ? 'Replace photo' : 'Upload photo'}
              </Button>
              {hasPhoto && (
                <Button variant="ghost" type="button" disabled={!canEditImages || photoBusy} onClick={removePhoto}>
                  Remove
                </Button>
              )}
            </div>
            <p className="text-xs" style={{ color: canEditImages ? 'var(--color-text-muted)' : 'var(--color-warning)' }}>
              {canEditImages
                ? 'Your photo is cropped to a square and compressed before upload.'
                : 'Accept the Sharing Terms (Settings ▸ Legal & privacy) before uploading, replacing or removing driver images.'}
            </p>
          </div>
        </div>
      </Card>

      <form onSubmit={save} className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>Public identity</CardTitle>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Optional" />
            <Field label="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Optional" />
            <Field label="Display name" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required className="sm:col-span-2" />
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt style={{ color: 'var(--color-text-muted)' }}>Current number</dt>
              <dd className="font-medium">{current.driver_number ?? 'Not assigned'}</dd>
            </div>
            {current.driver_number_request_status && current.requested_driver_number && (
              <div className="flex justify-between gap-3">
                <dt style={{ color: 'var(--color-text-muted)' }}>Requested</dt>
                <dd>
                  <Badge tone={current.driver_number_request_status === 'pending' ? 'warning' : 'neutral'}>
                    #{current.requested_driver_number} · {current.driver_number_request_status}
                  </Badge>
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-3">
            <Field
              label="Requested number"
              value={form.requested}
              onChange={(e) => setForm({ ...form, requested: e.target.value })}
              placeholder={current.driver_number ?? 'Optional'}
              hint="An Owner or Admin approves number requests."
            />
            {problems.map((m) => (
              <p key={m} className="mt-1 text-xs" style={{ color: 'var(--color-warning)' }}>
                {m}
              </p>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Driver bio</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <Field label="Short description" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} placeholder="Optional" />
            <Field label="Platform ID" value={form.platformId} onChange={(e) => setForm({ ...form, platformId: e.target.value })} placeholder="Permitted by league settings" />
            <Field label="Game identity" value={form.racingId} onChange={(e) => setForm({ ...form, racingId: e.target.value })} placeholder="Permitted by league settings" />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Managed by league staff</CardTitle>
          </CardHeader>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Official driver number, team assignment, region, roles, membership status, championship assignment, results, rating, penalties, standings, verification, administrative
            notes, and class assumptions are not part of driver self-editing.
          </p>
        </Card>

        <div className="flex gap-2">
          <Button type="button" variant="secondary" disabled={!dirty || saving} onClick={() => seed(current)}>
            Reset
          </Button>
          <Button type="submit" disabled={!dirty || saving || problems.length > 0 || !form.displayName.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </div>
  )
}
