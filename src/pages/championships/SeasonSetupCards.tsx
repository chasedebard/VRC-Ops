import { useState } from 'react'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { seasonCreationIssues } from '@/utils/seasonValidation'
import type { SeasonRow, SeasonStatus } from '@/types/database'

const STATUS_LABEL: Record<SeasonStatus, string> = { draft: 'Draft', active: 'Active', paused: 'Paused', completed: 'Completed', archived: 'Archived' }

/** Why another active season can't be set right now (free tier: one; Pro / League Plus: a league limit), or null when it can. */
export type ActiveSeasonBlock = { reason: 'requiresPro' | 'limitReached'; message: string } | null

/** Season identity + dates (iOS season editor steps 1 and 2). The Active status is disabled, with the reason, when activating would exceed the plan. */
export function SeasonSettingsCard({
  season,
  disabled,
  activeBlock,
  onSave,
}: {
  season: SeasonRow
  disabled: boolean
  activeBlock: ActiveSeasonBlock
  onSave: (patch: Partial<SeasonRow>) => Promise<string | null>
}) {
  const [name, setName] = useState(season.name)
  const [year, setYear] = useState(season.year ? String(season.year) : '')
  const [notes, setNotes] = useState(season.notes ?? '')
  const [status, setStatus] = useState<SeasonStatus>(season.status)
  const [start, setStart] = useState(season.start_date ?? '')
  const [end, setEnd] = useState(season.end_date ?? '')
  const [dropRounds, setDropRounds] = useState(String(season.drop_rounds ?? 0))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const alreadyActive = season.is_active || season.status === 'active'
  const blocksActive = !alreadyActive && activeBlock !== null
  const issues = seasonCreationIssues({ name, yearText: year, startDate: start || null, endDate: end || null })
  const drop = Number(dropRounds)
  const dropInvalid = !/^\d+$/.test(dropRounds.trim()) || drop > 20
  const dirty =
    name !== season.name ||
    year !== (season.year ? String(season.year) : '') ||
    notes !== (season.notes ?? '') ||
    status !== season.status ||
    start !== (season.start_date ?? '') ||
    end !== (season.end_date ?? '') ||
    Number(dropRounds) !== (season.drop_rounds ?? 0)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const failure = await onSave({
      name: name.trim(),
      year: year.trim() ? Number(year) : null,
      notes: notes.trim() || null,
      status,
      start_date: start || null,
      end_date: end || null,
      drop_rounds: drop,
    })
    setBusy(false)
    setMessage(failure ? { tone: 'error', text: failure } : { tone: 'ok', text: 'Season saved.' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Season details</CardTitle>
        <Badge tone={alreadyActive ? 'success' : 'neutral'}>{STATUS_LABEL[season.status]}</Badge>
      </CardHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} required disabled={disabled} />
          <Field label="Year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} disabled={disabled} />
          <Field label="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={disabled} />
          <Field label="End date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} disabled={disabled} />
          <Field label="Drop rounds" inputMode="numeric" value={dropRounds} onChange={(e) => setDropRounds(e.target.value)} disabled={disabled} hint="Lowest event totals that don't count toward the championship." />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Status</span>
            <select
              value={status}
              disabled={disabled}
              onChange={(e) => setStatus(e.target.value as SeasonStatus)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            >
              {(Object.keys(STATUS_LABEL) as SeasonStatus[]).map((s) => (
                <option key={s} value={s} disabled={s === 'active' && blocksActive}>
                  {STATUS_LABEL[s]}
                  {s === 'active' && blocksActive ? (activeBlock?.reason === 'requiresPro' ? ' — requires Pro' : ' — limit reached') : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
        <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={disabled} />
        {blocksActive && activeBlock && <p className="text-xs" style={{ color: 'var(--color-warning)' }}>{activeBlock.message}</p>}
        {[...issues, ...(dropInvalid ? ['Drop rounds must be a whole number from 0 to 20.'] : [])].map((m) => (
          <p key={m} className="text-xs" style={{ color: 'var(--color-warning)' }}>
            {m}
          </p>
        ))}
        {message && (
          <p role={message.tone === 'error' ? 'alert' : 'status'} className="text-sm" style={{ color: message.tone === 'error' ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {message.text}
          </p>
        )}
        <Button type="submit" disabled={disabled || busy || !dirty || issues.length > 0 || dropInvalid}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Card>
  )
}

/** Classes / regions used for events in this season (iOS step 3 "Structure"); shown only when the championship runs either. */
export function SeasonStructureCard({
  classesEnabled,
  regionsEnabled,
  classItems,
  regionItems,
  selectedClassIds,
  selectedRegionIds,
  disabled,
  onSave,
}: {
  classesEnabled: boolean
  regionsEnabled: boolean
  classItems: { id: string; label: string }[]
  regionItems: { id: string; label: string }[]
  selectedClassIds: string[]
  selectedRegionIds: string[]
  disabled: boolean
  onSave: (classIds: string[] | null, regionIds: string[] | null) => Promise<string | null>
}) {
  const [classes, setClasses] = useState(new Set(selectedClassIds))
  const [regions, setRegions] = useState(new Set(selectedRegionIds))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  if (!classesEnabled && !regionsEnabled) return null

  const toggle = (set: Set<string>, id: string, apply: (next: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    apply(next)
  }

  const group = (title: string, items: { id: string; label: string }[], set: Set<string>, apply: (n: Set<string>) => void) => (
    <fieldset>
      <legend className="mb-1 text-sm font-medium">{title}</legend>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--color-warning)' }}>
          No {title.toLowerCase()} yet. Add some from {title} management first.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" disabled={disabled} checked={set.has(item.id)} onChange={() => toggle(set, item.id, apply)} />
              {item.label}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  )

  async function save() {
    setBusy(true)
    setMessage(null)
    const failure = await onSave(classesEnabled ? [...classes] : null, regionsEnabled ? [...regions] : null)
    setBusy(false)
    setMessage(failure ? { tone: 'error', text: failure } : { tone: 'ok', text: 'Structure saved.' })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Structure</CardTitle>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Classes and regions used for events in this season</span>
      </CardHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {classesEnabled && group('Classes', classItems, classes, setClasses)}
        {regionsEnabled && group('Regions', regionItems, regions, setRegions)}
      </div>
      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className="mt-2 text-sm" style={{ color: message.tone === 'error' ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {message.text}
        </p>
      )}
      <Button className="mt-3" variant="secondary" onClick={save} disabled={disabled || busy}>
        {busy ? 'Saving…' : 'Save structure'}
      </Button>
    </Card>
  )
}

/** Review & activate (iOS step 6): the required-data checklist, then activation gated by the plan's active-season limit. */
export function SeasonActivationCard({
  season,
  missing,
  activeBlock,
  disabled,
  onActivate,
}: {
  season: SeasonRow
  missing: string[]
  activeBlock: ActiveSeasonBlock
  disabled: boolean
  onActivate: () => Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const alreadyActive = season.is_active || season.status === 'active'
  const blocked = !alreadyActive && activeBlock !== null

  async function activate() {
    setBusy(true)
    setError(null)
    setError(await onActivate())
    setBusy(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review &amp; activate</CardTitle>
      </CardHeader>
      {missing.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--color-success)' }}>✓ All required data present.</p>
      ) : (
        <ul className="space-y-0.5 text-sm" style={{ color: 'var(--color-warning)' }}>
          {missing.map((m) => (
            <li key={m}>⚠ {m}</li>
          ))}
        </ul>
      )}
      {blocked && activeBlock && <p className="mt-2 text-xs" style={{ color: 'var(--color-warning)' }}>{activeBlock.message}</p>}
      {error && <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
      <Button className="mt-3" onClick={activate} disabled={disabled || busy || alreadyActive || missing.length > 0 || blocked}>
        {alreadyActive ? 'Season is active' : busy ? 'Activating…' : 'Activate season'}
      </Button>
    </Card>
  )
}
