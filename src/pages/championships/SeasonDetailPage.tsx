import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { activateSeason, getChampionship, getLeagueSeasons, getSeason, subscribeToSeason, updateSeason } from '@/services/championships'
import { createEvent, deleteEvent, getEventClasses, getSeasonEvents, setEventClasses, updateEvent } from '@/services/events'
import { getTracks } from '@/services/tracks'
import { getSeasonClassIds, getSeasonRegionIds, gt7SelectedGroupPickerItems, listLeagueClasses, listLeagueRegions, setSeasonClasses, setSeasonRegions } from '@/services/setup'
import { useEntitlement } from '@/hooks/useEntitlement'
import { ACTIVE_SEASON_LIMIT_MESSAGE, canCreateAdditionalActiveSeason, featureDefinition } from '@/config/featureRegistry'
import { EventEditor } from '@/components/EventEditor'
import { SeasonActivationCard, SeasonSettingsCard, SeasonStructureCard, type ActiveSeasonBlock } from '@/pages/championships/SeasonSetupCards'
import { eventFormFromRow, emptyEventForm, nextSuggestedRound, plannedEventClassSync, EVENT_STATUS_LABEL, type EventPayload } from '@/utils/eventForm'
import { missingActivationRequirements } from '@/utils/seasonValidation'
import { backendErrorMessage } from '@/utils/backendErrors'
import { eventDisplayTitle } from '@/utils/currentRace'
import {
  SeasonRecomputeError,
  runSeasonScoringRecompute,
  type SeasonScoringRecomputeResult,
} from '@/services/scoringRecompute'
import { hasEffectiveScoringConfigChanged, isValidSeasonBonusPoints } from '@/utils/scoring'
import { bonusFormFromSeason, type BonusFormState } from '@/pages/championships/seasonBonusForm'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatBonusPoints, formatDate } from '@/utils/format'
import type { ChampionshipRow, ClassRow, EventRow, RegionRow, SeasonRow, TrackRow } from '@/types/database'

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
  const { hasAccess } = useEntitlement()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [regions, setRegions] = useState<RegionRow[]>([])
  const [seasonClassIds, setSeasonClassIds] = useState<string[]>([])
  const [seasonRegionIds, setSeasonRegionIds] = useState<string[]>([])
  const [otherActiveSeasons, setOtherActiveSeasons] = useState(0)
  // `null` = closed, `'new'` = creating, otherwise the event being edited.
  const [editor, setEditor] = useState<'new' | EventRow | null>(null)

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
        const leagueId = selectedLeague.league.id
        const [trackRows, classRows, regionRows, classIds, regionIds, leagueSeasons] = await Promise.all([
          c ? getTracks(c.game_id, leagueId).catch(() => []) : Promise.resolve([]),
          listLeagueClasses(leagueId).catch(() => []),
          listLeagueRegions(leagueId).catch(() => []),
          getSeasonClassIds(s.id).catch(() => []),
          getSeasonRegionIds(s.id).catch(() => []),
          getLeagueSeasons(leagueId).catch(() => []),
        ])
        setTracks(trackRows)
        setClasses(classRows)
        setRegions(regionRows)
        setSeasonClassIds(classIds)
        setSeasonRegionIds(regionIds)
        // Only genuinely active seasons in OTHER championships count: activating within a championship is a swap.
        setOtherActiveSeasons(leagueSeasons.filter((x) => (x.is_active || x.status === 'active') && x.championship_id !== s.championship_id).length)
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

  async function refreshAfterWrite() {
    if (!id) return
    const [updated, ev] = await Promise.all([getSeason(id), getSeasonEvents(id)])
    if (updated) setSeason(updated)
    setEvents(ev)
  }

  /** Returns an error message to show in the editor, or null on success. */
  async function saveEvent(payload: EventPayload): Promise<string | null> {
    if (!season || !selectedLeague || editor === null) return 'Select a season first.'
    try {
      let eventId: string
      if (editor === 'new') {
        const created = await createEvent({ ...payload, league_id: selectedLeague.league.id, championship_id: season.championship_id, season_id: season.id })
        eventId = created.id
      } else {
        await updateEvent(editor.id, payload)
        eventId = editor.id
      }
      // Results are saved against `event_classes`, which the database does not derive from `events.class_id`.
      if (payload.class_id) {
        const sync = plannedEventClassSync((await getEventClasses(eventId)).map((row) => row.class_id), payload.class_id)
        if (sync) await setEventClasses(eventId, selectedLeague.league.id, sync)
      }
      setEditor(null)
      await refreshAfterWrite()
      return null
    } catch (err) {
      return backendErrorMessage(err, 'Could not save the event.')
    }
  }

  async function removeEvent(): Promise<string | null> {
    if (editor === null || editor === 'new') return null
    try {
      await deleteEvent(editor.id)
      setEditor(null)
      await refreshAfterWrite()
      return null
    } catch (err) {
      return backendErrorMessage(err, 'Could not delete the event.')
    }
  }

  async function saveSeasonSettings(patch: Partial<SeasonRow>): Promise<string | null> {
    if (!season) return 'Season not loaded.'
    try {
      // Setting Active by hand must respect the same plan limit as the activation button (server re-checks).
      if (patch.status === 'active' && !(season.is_active || season.status === 'active')) {
        await activateSeason(season.id)
        const { status: _status, ...rest } = patch
        void _status
        if (Object.keys(rest).length > 0) await updateSeason(season.id, rest)
      } else {
        await updateSeason(season.id, patch)
      }
      await refreshAfterWrite()
      return null
    } catch (err) {
      return backendErrorMessage(err, 'Could not save the season.')
    }
  }

  async function saveStructure(classIds: string[] | null, regionIds: string[] | null): Promise<string | null> {
    if (!season || !selectedLeague) return 'Season not loaded.'
    try {
      if (classIds) await setSeasonClasses(season.id, selectedLeague.league.id, classIds)
      if (regionIds) await setSeasonRegions(season.id, selectedLeague.league.id, regionIds)
      if (classIds) setSeasonClassIds(classIds)
      if (regionIds) setSeasonRegionIds(regionIds)
      return null
    } catch (err) {
      return backendErrorMessage(err, 'Could not save the structure.')
    }
  }

  async function activate(): Promise<string | null> {
    if (!season) return 'Season not loaded.'
    try {
      await activateSeason(season.id)
      await refreshAfterWrite()
      return null
    } catch (err) {
      return backendErrorMessage(err, 'Could not activate the season.')
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

  const canManage = permissions.canManageSetup
  const busyForm = savingBonus || recomputing
  const activeBlock: ActiveSeasonBlock = canCreateAdditionalActiveSeason(otherActiveSeasons, hasAccess)
    ? null
    : hasAccess
      ? { reason: 'limitReached', message: ACTIVE_SEASON_LIMIT_MESSAGE }
      : { reason: 'requiresPro', message: featureDefinition('multipleActiveSeasons').message }
  const gt7 = championship?.game_id === 'gran_turismo_7'
  const classItems = gt7 ? gt7SelectedGroupPickerItems(classes) : classes.map((c) => ({ id: c.id, label: c.name }))
  // A season with no linked classes/regions still offers every league one (mirrors iOS) so required fields are never unreachable.
  const eventClasses = seasonClassIds.length > 0 ? classes.filter((c) => seasonClassIds.includes(c.id)) : classes
  const eventRegions = seasonRegionIds.length > 0 ? regions.filter((r) => seasonRegionIds.includes(r.id)) : regions

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

      {canManage && (
        <SeasonSettingsCard key={`${season.id}-${season.updated_at}`} season={season} disabled={false} activeBlock={activeBlock} onSave={saveSeasonSettings} />
      )}

      {canManage && championship && (
        <SeasonStructureCard
          key={`structure-${season.id}-${seasonClassIds.join()}-${seasonRegionIds.join()}`}
          classesEnabled={championship.classes_enabled}
          regionsEnabled={championship.regions_enabled}
          classItems={classItems}
          regionItems={regions.map((r) => ({ id: r.id, label: r.name }))}
          selectedClassIds={seasonClassIds}
          selectedRegionIds={seasonRegionIds}
          disabled={false}
          onSave={saveStructure}
        />
      )}

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
          {canManage && <Button onClick={() => setEditor('new')}>New race</Button>}
        </CardHeader>

        {events.length === 0 ? (
          <EmptyState title="No events scheduled" description="Add your first race weekend to this season." />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {events
              .slice()
              .sort((a, b) => a.round - b.round)
              .map((event) => (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <Link to={`/race-weekend/${event.id}`} className="font-medium hover:underline">
                      Round {event.round} — {eventDisplayTitle(event)}
                    </Link>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {[formatDate(event.event_date), event.start_time ? event.start_time.slice(0, 5) : null, event.race_value ? `${event.race_value} ${event.race_distance_type === 'endurance' ? 'min' : event.race_value === 1 ? 'lap' : 'laps'}` : null]
                        .filter((x) => x && x !== '—')
                        .join(' · ') || 'Date to be announced'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={EVENT_STATUS_TONE[event.status]}>{EVENT_STATUS_LABEL[event.status]}</Badge>
                    {canManage && (
                      <Button variant="secondary" onClick={() => setEditor(event)} aria-label={`Edit round ${event.round}`}>
                        Edit
                      </Button>
                    )}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {canManage && (
        <SeasonActivationCard
          key={`activate-${season.id}-${season.status}-${events.length}-${season.year}`}
          season={season}
          missing={missingActivationRequirements(season.year, events.length)}
          activeBlock={activeBlock}
          disabled={false}
          onActivate={activate}
        />
      )}

      {editor !== null && championship && (
        <EventEditor
          title={editor === 'new' ? 'New race' : `Edit round ${editor.round}`}
          initial={editor === 'new' ? emptyEventForm(nextSuggestedRound(events.map((e) => e.round))) : eventFormFromRow(editor)}
          tracks={tracks}
          classes={eventClasses}
          regions={eventRegions}
          context={{
            classesEnabled: championship.classes_enabled,
            regionsEnabled: championship.regions_enabled,
            game: championship.game_id,
            existingRounds: new Set(events.map((e) => e.round)),
          }}
          editing={editor === 'new' ? undefined : editor}
          onSave={saveEvent}
          onDelete={editor === 'new' ? undefined : removeEvent}
          onClose={() => setEditor(null)}
        />
      )}
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
