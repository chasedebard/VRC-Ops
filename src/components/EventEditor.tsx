import { useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Modal } from '@/components/Modal'
import {
  EVENT_STATUS_LABEL,
  eventPayload,
  generatedEventTitle,
  selectableStatuses,
  validateEventForm,
  type EventFormContext,
  type EventFormState,
  type EventPayload,
} from '@/utils/eventForm'
import type { ClassRow, EventRow, RegionRow, TrackRow } from '@/types/database'

const selectStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }

/**
 * Race (event) editor for create and edit (iOS `VRCEventSetupFlow` / `VRCEventDetailView`). The race name is generated from the track and
 * layout; class is required only when the championship runs classes; GT7's region is derived server-side from the track's country. Status can
 * only be set by hand to draft / scheduled / cancelled / postponed / archived — live and completed belong to Race Control.
 */
export function EventEditor({
  title,
  initial,
  tracks,
  classes,
  regions,
  context,
  editing,
  onSave,
  onDelete,
  onClose,
}: {
  title: string
  initial: EventFormState
  tracks: TrackRow[]
  /** Already narrowed to the season's classes (or all, when none are linked yet). */
  classes: ClassRow[]
  regions: RegionRow[]
  context: EventFormContext
  editing?: EventRow
  onSave: (payload: EventPayload) => Promise<string | null>
  onDelete?: () => Promise<string | null>
  onClose: () => void
}) {
  const [form, setForm] = useState<EventFormState>(initial)
  const [showAdvanced, setShowAdvanced] = useState(Boolean(initial.customTitle || initial.qualifyingMinutes || initial.tireRules || initial.fuelRules || initial.weatherNotes || initial.penaltyNotes || initial.notes))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [trackSearch, setTrackSearch] = useState('')

  const set = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const track = tracks.find((t) => t.id === form.trackId) ?? null
  const errors = validateEventForm(form, { ...context, editingRound: editing?.round ?? null })
  const filteredTracks = useMemo(() => {
    const q = trackSearch.trim().toLowerCase()
    const list = q ? tracks.filter((t) => `${t.name} ${t.layout ?? ''} ${t.country ?? ''}`.toLowerCase().includes(q)) : tracks
    // Keep the selected track in the list even when the search filters it out.
    return track && !list.some((t) => t.id === track.id) ? [track, ...list] : list
  }, [tracks, trackSearch, track])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (errors.length > 0 || !track) return
    setBusy(true)
    setError(null)
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || null
    const failure = await onSave(eventPayload(form, track, context, timeZone))
    setBusy(false)
    if (failure) setError(failure)
  }

  return (
    <Modal title={title} onClose={() => !busy && onClose()} dismissible={!busy}>
      <form onSubmit={submit} className="max-h-[75vh] space-y-4 overflow-y-auto pr-1">
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Track</legend>
          <Field label="Search tracks" type="search" value={trackSearch} onChange={(e) => setTrackSearch(e.target.value)} />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Track and layout</span>
            <select value={form.trackId} onChange={(e) => set('trackId', e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={selectStyle}>
              <option value="">Select a track…</option>
              {filteredTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {generatedEventTitle(t)}
                </option>
              ))}
            </select>
          </label>
          {tracks.length === 0 && <p className="text-xs" style={{ color: 'var(--color-warning)' }}>No tracks in the catalog yet — add tracks first.</p>}
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Race name: <strong>{form.customTitle.trim() || generatedEventTitle(track)}</strong> — generated from the track
            {editing ? '; saving updates it when the track changes' : ''}.
          </p>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-1 text-sm font-semibold">Schedule</legend>
          <Field label="Round" type="number" min={1} value={form.round} onChange={(e) => set('round', e.target.value)} required />
          <Field label="Date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          <Field label="Start time" type="time" value={form.time} onChange={(e) => set('time', e.target.value)} hint="Optional" />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold">Format</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Distance</span>
              <select value={form.distanceType} onChange={(e) => set('distanceType', e.target.value as 'laps' | 'endurance')} className="w-full rounded-lg border px-3 py-2 text-sm" style={selectStyle}>
                <option value="laps">Laps</option>
                <option value="endurance">Endurance (minutes)</option>
              </select>
            </label>
            <Field label={form.distanceType === 'endurance' ? 'Minutes' : 'Laps'} type="number" min={1} value={form.distanceValue} onChange={(e) => set('distanceValue', e.target.value)} required />
          </div>
          {context.classesEnabled && (
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Class</span>
              <select value={form.classId} onChange={(e) => set('classId', e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={selectStyle}>
                <option value="">Select a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {context.regionsEnabled &&
            (context.game === 'gran_turismo_7' ? (
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Region is set automatically from the track&apos;s country.
              </p>
            ) : (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Region</span>
                <select value={form.regionId} onChange={(e) => set('regionId', e.target.value)} required className="w-full rounded-lg border px-3 py-2 text-sm" style={selectStyle}>
                  <option value="">Select a region…</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          {!context.classesEnabled && !context.regionsEnabled && (
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              This championship uses neither classes nor regions.
            </p>
          )}
        </fieldset>

        <div>
          <button type="button" className="text-sm underline" onClick={() => setShowAdvanced((v) => !v)} aria-expanded={showAdvanced}>
            {showAdvanced ? 'Hide advanced options' : 'Advanced options'}
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3">
              <Field label="Custom race name" value={form.customTitle} placeholder={generatedEventTitle(track)} onChange={(e) => set('customTitle', e.target.value)} />
              <Field label="Qualifying (minutes)" type="number" min={1} value={form.qualifyingMinutes} onChange={(e) => set('qualifyingMinutes', e.target.value)} />
              <Field label="Tyre rules" value={form.tireRules} onChange={(e) => set('tireRules', e.target.value)} />
              <Field label="Fuel rules" value={form.fuelRules} onChange={(e) => set('fuelRules', e.target.value)} />
              <Field label="Weather notes" value={form.weatherNotes} onChange={(e) => set('weatherNotes', e.target.value)} />
              <Field label="Penalty notes" value={form.penaltyNotes} onChange={(e) => set('penaltyNotes', e.target.value)} />
              <Field label="Notes" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          )}
        </div>

        {editing && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Status</legend>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Event status</span>
              <select value={form.status} onChange={(e) => set('status', e.target.value as EventRow['status'])} className="w-full rounded-lg border px-3 py-2 text-sm" style={selectStyle}>
                {selectableStatuses(editing.status).map((s) => (
                  <option key={s} value={s} disabled={s === 'live' || s === 'completed'}>
                    {EVENT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Live and Completed are set by Race Control, not by hand.
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.isPublished} onChange={(e) => set('isPublished', e.target.checked)} />
              Published
            </label>
          </fieldset>
        )}

        {errors.length > 0 && (
          <ul className="space-y-0.5 text-xs" style={{ color: 'var(--color-warning)' }}>
            {errors.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || errors.length > 0}>
              {busy ? 'Saving…' : editing ? 'Save event' : 'Create race'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
          </div>
          {editing && onDelete && (
            <Button type="button" variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
              Delete event
            </Button>
          )}
        </div>
      </form>

      {confirmDelete && onDelete && (
        <div role="alertdialog" aria-label="Confirm delete" className="mt-4 rounded-lg border p-3 text-sm" style={{ borderColor: 'var(--color-danger)' }}>
          <p className="mb-2">Delete this event? Its results, qualifying and session history are removed with it. This can’t be undone.</p>
          <div className="flex gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                const failure = await onDelete()
                setBusy(false)
                if (failure) setError(failure)
              }}
            >
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Keep
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
