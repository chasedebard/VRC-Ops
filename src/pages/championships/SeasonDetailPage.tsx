import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getChampionship, getSeason, subscribeToSeason, updateSeason } from '@/services/championships'
import { createEvent, getSeasonEvents } from '@/services/events'
import { getTracks } from '@/services/tracks'
import {
  SeasonRecomputeError,
  runSeasonScoringRecompute,
  type SeasonScoringRecomputeResult,
} from '@/services/scoringRecompute'
import { hasEffectiveScoringConfigChanged, isValidSeasonBonusPoints } from '@/utils/scoring'
import { bonusFormFromSeason, type BonusFormState } from '@/pages/championships/seasonBonusForm'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatBonusPoints, formatDate } from '@/utils/format'
import type { ChampionshipRow, EventRow, SeasonRow, TrackRow } from '@/types/database'

const EVENT_STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  scheduled: 'neutral',
  live: 'success',
  completed: 'neutral',
  cancelled: 'danger',
  postponed: 'warning',
  archived: 'neutral',
}

export default function SeasonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { selectedLeague, permissions } = useLeagueSession()
  const [season, setSeason] = useState<SeasonRow | null>(null)
  const [championship, setChampionship] = useState<ChampionshipRow | null>(null)
  const [events, setEvents] = useState<EventRow[] | null>(null)
  const [tracks, setTracks] = useState<TrackRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [round, setRound] = useState(1)
  const [trackId, setTrackId] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [busy, setBusy] = useState(false)

  const [bonusForm, setBonusForm] = useState<BonusFormState | null>(null)
  const [bonusError, setBonusError] = useState<string | null>(null)
  const [savingBonus, setSavingBonus] = useState(false)
  const [recomputing, setRecomputing] = useState(false)
  const [recomputeStatus, setRecomputeStatus] = useState<string | null>(null)
  const [teamsBusy, setTeamsBusy] = useState(false)

  async function load() {
    if (!id || !selectedLeague) return
    setError(null)
    try {
      const s = await getSeason(id)
      setSeason(s)
      if (s) setBonusForm((prev) => prev ?? bonusFormFromSeason(s))
      if (s) {
        const [c, ev] = await Promise.all([getChampionship(s.championship_id), getSeasonEvents(id)])
        setChampionship(c)
        setEvents(ev)
        if (c) setTracks(await getTracks(c.game_id, selectedLeague.league.id))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load season.')
    }
  }

  useEffect(() => {
    load()
    setBonusForm(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, selectedLeague?.league.id])

  // Keeps the read-only Scoring card (and, when the admin hasn't started editing, the Bonus
  // Points form) correct when another admin changes this season's settings on another device.
  useEffect(() => {
    if (!id) return
    return subscribeToSeason(id, (updated) => {
      setSeason(updated)
      setBonusForm((prev) => (prev === null ? bonusFormFromSeason(updated) : prev))
    })
  }, [id])

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!season || !selectedLeague) return
    setBusy(true)
    try {
      await createEvent({
        league_id: selectedLeague.league.id,
        championship_id: season.championship_id,
        season_id: season.id,
        round,
        track_id: trackId || null,
        event_date: eventDate || null,
        status: 'scheduled',
      })
      setShowCreate(false)
      setRound((r) => r + 1)
      setTrackId('')
      setEventDate('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create event.')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveBonusSettings(e: React.FormEvent) {
    e.preventDefault()
    if (!season || !bonusForm || savingBonus) return

    if (!isValidSeasonBonusPoints(bonusForm.poleBonusPoints) || !isValidSeasonBonusPoints(bonusForm.fastestLapBonusPoints)) {
      setBonusError('Bonus points must be 1, 2, or 3.')
      return
    }

    setBonusError(null)
    setRecomputeStatus(null)
    setSavingBonus(true)
    try {
      const patch: Partial<SeasonRow> = {
        pole_bonus_enabled: bonusForm.poleBonusEnabled,
        pole_bonus_points: bonusForm.poleBonusPoints,
        fastest_lap_bonus_enabled: bonusForm.fastestLapBonusEnabled,
        fastest_lap_bonus_points: bonusForm.fastestLapBonusPoints,
      }
      const configChanged = hasEffectiveScoringConfigChanged(season, patch)
      await updateSeason(season.id, patch)
      const updatedSeason: SeasonRow = { ...season, ...patch }
      setSeason(updatedSeason)
      setSavingBonus(false)

      if (configChanged) {
        setRecomputing(true)
        try {
          const result: SeasonScoringRecomputeResult = await runSeasonScoringRecompute(
            updatedSeason,
            'website_bonus_config_changed',
          )
          setRecomputeStatus(
            result.recomputed
              ? `Saved. Recalculated ${result.outputCount} result${result.outputCount === 1 ? '' : 's'} across ${result.eventCount} event${result.eventCount === 1 ? '' : 's'}.`
              : 'Saved. No finalized results needed recalculation.',
          )
        } catch (err) {
          // The season save already succeeded — don't claim the whole operation failed, but
          // don't silently show success either. Refetch so nothing optimistic lingers, and let
          // the admin retry the recompute safely (it's always a full re-derivation, never a delta).
          setBonusError(
            err instanceof SeasonRecomputeError
              ? err.message
              : 'Bonus settings were saved, but existing results could not be recalculated.',
          )
          await load()
        } finally {
          setRecomputing(false)
        }
      } else {
        setRecomputeStatus('Saved.')
      }
    } catch (err) {
      setBonusError(err instanceof Error ? err.message : 'Could not save bonus settings.')
      setSavingBonus(false)
    }
  }

  async function handleRetryRecompute() {
    if (!season || recomputing) return
    setBonusError(null)
    setRecomputing(true)
    try {
      const result = await runSeasonScoringRecompute(season, 'website_bonus_config_changed')
      setRecomputeStatus(
        result.recomputed
          ? `Recalculated ${result.outputCount} result${result.outputCount === 1 ? '' : 's'} across ${result.eventCount} event${result.eventCount === 1 ? '' : 's'}.`
          : 'No finalized results needed recalculation.',
      )
    } catch (err) {
      setBonusError(err instanceof SeasonRecomputeError ? err.message : 'Could not recalculate season scoring.')
    } finally {
      setRecomputing(false)
    }
  }

  async function handleToggleTeamsEnabled() {
    if (!season || teamsBusy) return
    setTeamsBusy(true)
    setError(null)
    try {
      const next = !season.teams_enabled
      await updateSeason(season.id, { teams_enabled: next })
      setSeason({ ...season, teams_enabled: next })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update teams setting.')
    } finally {
      setTeamsBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (season === null || events === null) return <LoadingState />

  const canManage = permissions.canManageMembers
  const busyForm = savingBonus || recomputing

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {season.name} {season.year ? `(${season.year})` : ''}
        </h1>
        {championship && (
          <Link to={`/championships/${championship.id}`} className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
            {championship.name}
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scoring</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Pole position bonus</span>
            <span className="font-mono font-medium">
              {formatBonusPoints(season.pole_bonus_enabled, season.pole_bonus_points)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span style={{ color: 'var(--color-text-muted)' }}>Fastest lap bonus</span>
            <span className="font-mono font-medium">
              {formatBonusPoints(season.fastest_lap_bonus_enabled, season.fastest_lap_bonus_points)}
            </span>
          </div>
        </div>
      </Card>

      {canManage && bonusForm && (
        <Card>
          <CardHeader>
            <CardTitle>Bonus Points</CardTitle>
          </CardHeader>
          <form onSubmit={handleSaveBonusSettings} className="space-y-4">
            <BonusPointsControl
              label="Pole position bonus"
              enabled={bonusForm.poleBonusEnabled}
              points={bonusForm.poleBonusPoints}
              disabled={busyForm}
              onToggle={(enabled) => setBonusForm({ ...bonusForm, poleBonusEnabled: enabled })}
              onPointsChange={(points) => setBonusForm({ ...bonusForm, poleBonusPoints: points })}
            />
            <BonusPointsControl
              label="Fastest lap bonus"
              enabled={bonusForm.fastestLapBonusEnabled}
              points={bonusForm.fastestLapBonusPoints}
              disabled={busyForm}
              onToggle={(enabled) => setBonusForm({ ...bonusForm, fastestLapBonusEnabled: enabled })}
              onPointsChange={(points) => setBonusForm({ ...bonusForm, fastestLapBonusPoints: points })}
            />

            {bonusError && <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{bonusError}</p>}
            {!bonusError && recomputeStatus && (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{recomputeStatus}</p>
            )}

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={busyForm}>
                {savingBonus ? 'Saving…' : recomputing ? 'Recalculating…' : 'Save'}
              </Button>
              {bonusError && !recomputing && (
                <Button type="button" variant="secondary" onClick={handleRetryRecompute}>
                  Retry recalculation
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
        </CardHeader>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={season.teams_enabled}
              disabled={!canManage || teamsBusy}
              onChange={handleToggleTeamsEnabled}
            />
            Teams enabled for this season
          </label>
          {season.teams_enabled && (
            <Link to={`/seasons/${season.id}/teams`} className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
              Manage teams →
            </Link>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Race calendar</CardTitle>
          {canManage && (
            <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'Cancel' : 'New event'}</Button>
          )}
        </CardHeader>

        {showCreate && (
          <form onSubmit={handleCreateEvent} className="mb-4 grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field
              label="Round"
              type="number"
              value={round}
              onChange={(e) => setRound(Number(e.target.value))}
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Track</span>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                value={trackId}
                onChange={(e) => setTrackId(e.target.value)}
              >
                <option value="">Select a track…</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} {t.layout ? `– ${t.layout}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <Field
              label="Date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
            <Button type="submit" disabled={busy || !round}>
              {busy ? 'Creating…' : 'Create'}
            </Button>
          </form>
        )}

        {events.length === 0 ? (
          <EmptyState title="No events scheduled" description="Add your first race weekend to this season." />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {events
              .slice()
              .sort((a, b) => a.round - b.round)
              .map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <Link to={`/race-weekend/${event.id}`} className="font-medium hover:underline">
                      Round {event.round}
                      {event.custom_title ? ` — ${event.custom_title}` : ''}
                    </Link>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {formatDate(event.event_date)}
                    </p>
                  </div>
                  <Badge tone={EVENT_STATUS_TONE[event.status]}>{event.status}</Badge>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

export function BonusPointsControl({
  label,
  enabled,
  points,
  disabled,
  onToggle,
  onPointsChange,
}: {
  label: string
  enabled: boolean
  points: number
  disabled: boolean
  onToggle: (enabled: boolean) => void
  onPointsChange: (points: number) => void
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={enabled}
          disabled={disabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        {label}
      </label>
      {enabled && (
        <div className="flex gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--color-border)' }} role="radiogroup" aria-label={`${label} points`}>
          {[1, 2, 3].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={points === value}
              disabled={disabled}
              onClick={() => onPointsChange(value)}
              className="flex-1 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: points === value ? 'var(--color-accent)' : 'transparent',
                color: points === value ? 'var(--color-accent-contrast)' : 'var(--color-text)',
              }}
            >
              +{value}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
