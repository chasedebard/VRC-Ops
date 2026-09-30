import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useEntitlement } from '@/hooks/useEntitlement'
import {
  activateSeason,
  createSeason,
  deleteChampionshipWithSeasons,
  getChampionship,
  getLeagueSeasons,
  getSeasons,
  setChampionshipGame,
  updateChampionship,
} from '@/services/championships'
import { ACTIVE_SEASON_LIMIT_MESSAGE, GAME_IDS, GAME_LABEL, allowsGameSelection, canCreateAdditionalActiveSeason, featureDefinition, featureState, gameAvailability, isFeatureProLocked } from '@/config/featureRegistry'
import { CHAMPIONSHIP_STATUS_LABEL, featureFlagsFromRow, identityFormFromRow, identityIssues, identityPatch, type ChampionshipIdentityForm, type FeatureFlags } from '@/utils/championshipForm'
import { seasonCreationIssues } from '@/utils/seasonValidation'
import { backendErrorMessage, functionErrorMessage } from '@/utils/backendErrors'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { ChampionshipRow, ChampionshipStatus, GameId, SeasonRow } from '@/types/database'

const selectStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }

/**
 * Championship management (iOS `VRCChampionshipView`): identity and colours, feature settings, seasons (create and activate within the plan's
 * active-season limit), a guarded game change, and Owner-only deletion through the trusted Edge Function. Members who can't manage setup see
 * the same page read-only.
 */
export default function ChampionshipDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { selectedLeague, permissions } = useLeagueSession()
  const { hasAccess } = useEntitlement()
  const [championship, setChampionship] = useState<ChampionshipRow | null>(null)
  const [seasons, setSeasons] = useState<SeasonRow[] | null>(null)
  const [otherActiveCount, setOtherActiveCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pendingGame, setPendingGame] = useState<GameId | null>(null)

  const canManage = permissions.canManageSetup
  const leagueId = selectedLeague?.league.id ?? null

  const load = useCallback(async () => {
    if (!id || !leagueId) return
    setError(null)
    try {
      const [c, s, leagueSeasons] = await Promise.all([getChampionship(id), getSeasons(id), getLeagueSeasons(leagueId).catch(() => [] as SeasonRow[])])
      setChampionship(c)
      setSeasons(s)
      setOtherActiveCount(leagueSeasons.filter((x) => (x.is_active || x.status === 'active') && x.championship_id !== id).length)
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load the championship.'))
    }
  }, [id, leagueId])

  useEffect(() => {
    void load()
  }, [load])

  async function run(action: () => Promise<void>, success?: string) {
    setBusy(true)
    setActionError(null)
    setNotice(null)
    try {
      await action()
      if (success) setNotice(success)
      await load()
    } catch (err) {
      setActionError(backendErrorMessage(err, 'That change could not be saved.'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteChampionship() {
    if (!id) return
    setBusy(true)
    setActionError(null)
    try {
      await deleteChampionshipWithSeasons(id)
      navigate('/championships')
    } catch (err) {
      setActionError(await functionErrorMessage(err, 'Could not delete the championship.'))
      setBusy(false)
      setConfirmDelete(false)
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (championship === null || seasons === null) return <LoadingState label="Loading championship…" />

  const blockActivation = !canCreateAdditionalActiveSeason(otherActiveCount, hasAccess)
  const blockMessage = hasAccess ? ACTIVE_SEASON_LIMIT_MESSAGE : featureDefinition('multipleActiveSeasons').message

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/championships" className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
            ← Championships
          </Link>
          <h1 className="text-2xl font-bold">{championship.name}</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {championship.series_name || GAME_LABEL[championship.game_id]}
          </p>
        </div>
        <Badge tone={championship.status === 'active' ? 'success' : 'neutral'}>{CHAMPIONSHIP_STATUS_LABEL[championship.status]}</Badge>
      </div>

      {actionError && <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{actionError}</p>}
      {notice && <p role="status" className="text-sm" style={{ color: 'var(--color-success)' }}>{notice}</p>}

      {canManage && (
        <IdentityCard
          key={`identity-${championship.id}-${championship.updated_at}`}
          championship={championship}
          busy={busy}
          onSave={(patch) => run(() => updateChampionship(championship.id, patch), 'Championship saved.')}
          onChangeGame={(game) => setPendingGame(game)}
          isOwner={permissions.canManageLeague}
          hasResults={seasons.length > 0}
        />
      )}

      {canManage && (
        <FeaturesCard
          key={`features-${championship.id}-${championship.updated_at}`}
          championship={championship}
          busy={busy}
          onSave={(flags) => run(() => updateChampionship(championship.id, flags), 'Feature settings saved.')}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Seasons</CardTitle>
          {canManage && <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New season'}</Button>}
        </CardHeader>

        {showCreate && (
          <NewSeasonForm
            busy={busy}
            onCreate={async (draft) => {
              await run(async () => {
                await createSeason({ championship_id: championship.id, league_id: championship.league_id, ...draft })
                setShowCreate(false)
              }, 'Season created.')
            }}
          />
        )}

        {seasons.length === 0 ? (
          <EmptyState title="No seasons yet" description="Create a season to start scheduling events." />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {seasons.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <Link to={`/seasons/${s.id}`} className="font-medium hover:underline">
                  {s.name} {s.year ? `(${s.year})` : ''}
                </Link>
                <div className="flex items-center gap-2">
                  {s.is_active && <Badge tone="success">Active</Badge>}
                  <Badge>{s.status}</Badge>
                  {canManage && !s.is_active && (
                    <Button variant="secondary" onClick={() => run(() => activateSeason(s.id), `${s.name} is now the active season.`)} disabled={busy || blockActivation} title={blockActivation ? blockMessage : undefined}>
                      Set active
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {canManage && blockActivation && seasons.some((s) => !s.is_active) && (
          <p className="mt-2 text-xs" style={{ color: 'var(--color-warning)' }}>
            {blockMessage}
            {isFeatureProLocked('multipleActiveSeasons', hasAccess) ? ' Switching within this championship is always available.' : ''}
          </p>
        )}
      </Card>

      {permissions.canManageLeague && (
        <Card style={{ borderColor: 'var(--color-danger)' }}>
          <CardHeader>
            <CardTitle style={{ color: 'var(--color-danger)' }}>Archive &amp; delete</CardTitle>
          </CardHeader>
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Set the status to Archived to keep it for history. Deleting a championship also deletes its seasons and logo, and can&apos;t be undone.
          </p>
          <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete championship
          </Button>
        </Card>
      )}

      {confirmDelete && (
        <Modal title="Delete championship?" onClose={() => !busy && setConfirmDelete(false)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            “{championship.name}” and all of its seasons will be deleted. This can&apos;t be undone.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="danger" onClick={deleteChampionship} disabled={busy}>
              {busy ? 'Deleting…' : 'Delete'}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Keep
            </Button>
          </div>
        </Modal>
      )}

      {pendingGame && (
        <Modal title="Change game?" onClose={() => !busy && setPendingGame(null)} dismissible={!busy}>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            This championship will use {GAME_LABEL[pendingGame]}. Its current tracks and events stay as they are and must be reassigned to the new game&apos;s catalog.
          </p>
          <div className="mt-4 flex gap-2">
            <Button
              variant="danger"
              disabled={busy}
              onClick={async () => {
                await run(() => setChampionshipGame(championship.id, pendingGame, true), 'Game changed.')
                setPendingGame(null)
              }}
            >
              Change to {GAME_LABEL[pendingGame]}
            </Button>
            <Button variant="secondary" onClick={() => setPendingGame(null)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function IdentityCard({
  championship,
  busy,
  onSave,
  onChangeGame,
  isOwner,
  hasResults,
}: {
  championship: ChampionshipRow
  busy: boolean
  onSave: (patch: Partial<ChampionshipRow>) => void
  onChangeGame: (game: GameId) => void
  isOwner: boolean
  hasResults: boolean
}) {
  const [form, setForm] = useState<ChampionshipIdentityForm>(identityFormFromRow(championship))
  const issues = identityIssues(form)
  const set = <K extends keyof ChampionshipIdentityForm>(key: K, value: ChampionshipIdentityForm[K]) => setForm((f) => ({ ...f, [key]: value }))
  const otherGames = GAME_IDS.filter((g) => g !== championship.game_id)
  const canChangeGame = !hasResults || isOwner

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
      </CardHeader>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (issues.length === 0) onSave(identityPatch(form))
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} required />
          <Field label="Series name" value={form.seriesName} onChange={(e) => set('seriesName', e.target.value)} placeholder="Optional" />
        </div>
        <Field label="Description" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Optional" />

        <div>
          <p className="text-sm font-medium">Game</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{GAME_LABEL[championship.game_id]}</span>
            <label className="text-xs">
              <span className="sr-only">Change game</span>
              <select
                value=""
                disabled={!canChangeGame}
                onChange={(e) => e.target.value && onChangeGame(e.target.value as GameId)}
                className="rounded-lg border px-2 py-1 text-xs"
                style={selectStyle}
              >
                <option value="">Change game…</option>
                {otherGames.map((g) => (
                  <option key={g} value={g} disabled={!allowsGameSelection(g)}>
                    {GAME_LABEL[g]}
                    {gameAvailability(g) === 'comingSoon' ? ' — Coming soon' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Switching games doesn&apos;t move existing tracks or events. Once the championship has seasons, only an Owner may change the game.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Primary color" value={form.primary} onChange={(e) => set('primary', e.target.value)} placeholder="#087BFF" />
          <Field label="Secondary color" value={form.secondary} onChange={(e) => set('secondary', e.target.value)} placeholder="#C7C7CC" />
          <Field label="Accent color" value={form.accent} onChange={(e) => set('accent', e.target.value)} placeholder="#64D2FF" />
        </div>

        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium">Status</span>
          <select value={form.status} onChange={(e) => set('status', e.target.value as ChampionshipStatus)} className="w-full rounded-lg border px-3 py-2 text-sm" style={selectStyle}>
            {(Object.keys(CHAMPIONSHIP_STATUS_LABEL) as ChampionshipStatus[]).map((s) => (
              <option key={s} value={s}>
                {CHAMPIONSHIP_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>

        {issues.map((m) => (
          <p key={m} className="text-xs" style={{ color: 'var(--color-warning)' }}>
            {m}
          </p>
        ))}
        <Button type="submit" disabled={busy || issues.length > 0}>
          Save changes
        </Button>
      </form>
    </Card>
  )
}

interface FlagRow {
  key: keyof FeatureFlags
  label: string
  feature?: Parameters<typeof featureState>[0]
}

const FLAG_ROWS: { heading: string | null; rows: FlagRow[] }[] = [
  {
    heading: null,
    rows: [
      { key: 'classes_enabled', label: 'Classes' },
      { key: 'regions_enabled', label: 'Regions' },
    ],
  },
  {
    heading: 'Capture & intelligence',
    rows: [
      { key: 'practice_capture_enabled', label: 'Practice capture', feature: 'telemetryCapture' },
      { key: 'driver_telemetry_enabled', label: 'Driver telemetry', feature: 'telemetryCapture' },
      { key: 'viewer_capture_enabled', label: 'Viewer capture', feature: 'telemetryCapture' },
      { key: 'predictions_enabled', label: 'Predictions', feature: 'predictions' },
      { key: 'replay_enabled', label: 'Race Replay', feature: 'raceReplayCreation' },
    ],
  },
]

/** Feature settings. Hidden registry features never render; coming-soon ones render disabled with a label (iOS `featureToggle`). */
function FeaturesCard({ championship, busy, onSave }: { championship: ChampionshipRow; busy: boolean; onSave: (flags: FeatureFlags) => void }) {
  const [flags, setFlags] = useState<FeatureFlags>(featureFlagsFromRow(championship))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Feature settings</CardTitle>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Off by default. Save to apply.</span>
      </CardHeader>
      <p className="mb-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        Teams are configured per season — open a season to enable teams or manage its roster. Telemetry settings control what the mobile apps capture; the website itself can&apos;t record telemetry.
      </p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          onSave(flags)
        }}
      >
        {FLAG_ROWS.map((group) => {
          const rows = group.rows.filter((r) => !r.feature || featureState(r.feature) !== 'hidden')
          if (rows.length === 0) return null
          return (
            <fieldset key={group.heading ?? 'core'} className="space-y-2">
              {group.heading && <legend className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{group.heading}</legend>}
              {rows.map((row) => {
                const availability = row.feature ? featureState(row.feature) : 'active'
                const active = availability === 'active'
                return (
                  <label key={row.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={active ? flags[row.key] : false}
                      disabled={!active || busy}
                      onChange={(e) => setFlags((f) => ({ ...f, [row.key]: e.target.checked }))}
                    />
                    {row.label}
                    {availability === 'comingSoon' && <Badge tone="neutral">Coming soon</Badge>}
                  </label>
                )
              })}
            </fieldset>
          )
        })}
        <Button type="submit" variant="secondary" disabled={busy}>
          Save feature settings
        </Button>
      </form>
    </Card>
  )
}

function NewSeasonForm({ busy, onCreate }: { busy: boolean; onCreate: (draft: Partial<SeasonRow> & { name: string }) => Promise<void> }) {
  const [name, setName] = useState('')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [notes, setNotes] = useState('')
  const issues = seasonCreationIssues({ name, yearText: year, startDate: start || null, endDate: end || null })
  return (
    <form
      className="mb-4 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (issues.length === 0) void onCreate({ name: name.trim(), year: year.trim() ? Number(year) : null, start_date: start || null, end_date: end || null, notes: notes.trim() || null, status: 'draft' })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Field label="Year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
        <Field label="Start date" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        <Field label="End date" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
      </div>
      <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
      {name.trim() !== '' &&
        issues.map((m) => (
          <p key={m} className="text-xs" style={{ color: 'var(--color-warning)' }}>
            {m}
          </p>
        ))}
      <Button type="submit" disabled={busy || issues.length > 0}>
        {busy ? 'Creating…' : 'Create season'}
      </Button>
    </form>
  )
}
