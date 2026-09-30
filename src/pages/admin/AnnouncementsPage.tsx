import { useCallback, useEffect, useState } from 'react'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { RequirePermission } from '@/permissions/Guard'
import { deleteAnnouncement, listAnnouncements, postAnnouncement, updateAnnouncement } from '@/services/announcements'
import { backendErrorMessage } from '@/utils/backendErrors'
import { formatDateTime } from '@/utils/format'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Modal } from '@/components/Modal'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { LeagueAnnouncementRow } from '@/types/database'

/** Announcements manager: post, edit and delete the league messages shown on Home. Members read; Owner/Admin write (RLS enforced). */
export default function AnnouncementsPage() {
  return (
    <RequirePermission permission="canManageMembers">
      <Announcements />
    </RequirePermission>
  )
}

function Announcements() {
  const { selectedLeague } = useLeagueSession()
  const leagueId = selectedLeague?.league.id ?? null
  const [items, setItems] = useState<LeagueAnnouncementRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<{ id: string | null; title: string; body: string } | null>(null)
  const [deleting, setDeleting] = useState<LeagueAnnouncementRow | null>(null)

  const load = useCallback(async () => {
    if (!leagueId) return
    setError(null)
    try {
      setItems(await listAnnouncements(leagueId, 50))
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load announcements.'))
    }
  }, [leagueId])

  useEffect(() => {
    void load()
  }, [load])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!editing || !leagueId || !selectedLeague) return
    setBusy(true)
    setActionError(null)
    try {
      if (editing.id) await updateAnnouncement(editing.id, editing)
      else await postAnnouncement(leagueId, selectedLeague.membershipId, editing.title, editing.body)
      setEditing(null)
      await load()
    } catch (err) {
      setActionError(backendErrorMessage(err, 'Could not save the announcement.'))
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setBusy(true)
    setActionError(null)
    try {
      await deleteAnnouncement(deleting.id)
      setDeleting(null)
      await load()
    } catch (err) {
      setActionError(backendErrorMessage(err, 'Could not delete the announcement.'))
    } finally {
      setBusy(false)
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (items === null) return <LoadingState label="Loading announcements…" />

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Announcements</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Every league member sees the latest announcements on Home.</p>
        </div>
        <Button onClick={() => setEditing({ id: null, title: '', body: '' })}>New announcement</Button>
      </div>
      {actionError && <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{actionError}</p>}

      {items.length === 0 ? (
        <EmptyState title="No announcements yet" description="Post one to keep your drivers informed." />
      ) : (
        <ul className="space-y-3">
          {items.map((a) => (
            <li key={a.id}>
              <Card>
                <CardHeader>
                  <CardTitle>{a.title}</CardTitle>
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{formatDateTime(a.created_at)}</span>
                </CardHeader>
                <p className="whitespace-pre-wrap text-sm">{a.body}</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" onClick={() => setEditing({ id: a.id, title: a.title, body: a.body })}>Edit</Button>
                  <Button variant="ghost" onClick={() => setDeleting(a)}>Delete</Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Modal title={editing.id ? 'Edit announcement' : 'New announcement'} onClose={() => !busy && setEditing(null)} dismissible={!busy}>
          <form onSubmit={save} className="space-y-3">
            <Field label="Title" value={editing.title} maxLength={120} required onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Message</span>
              <textarea
                value={editing.body}
                rows={5}
                required
                onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !editing.title.trim() || !editing.body.trim()}>{busy ? 'Saving…' : 'Save'}</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <Modal title="Delete announcement?" onClose={() => !busy && setDeleting(null)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>“{deleting.title}” will be removed for every member.</p>
          <div className="mt-4 flex gap-2">
            <Button variant="danger" disabled={busy} onClick={confirmDelete}>Delete</Button>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={busy}>Keep</Button>
          </div>
        </Modal>
      )}
    </div>
  )
}
