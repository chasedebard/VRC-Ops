import type { EventRow, EventStatus, GameId } from '@/types/database'

/**
 * Race (event) form model — mirrors iOS `VRCEventSetupFlow` / `VRCClientValidation.event` and the live database triggers
 * (`private.validate_event_integrity`: TRACK_REQUIRED, RACE_DISTANCE_REQUIRED, CLASS_REQUIRED when the championship uses classes; `title` is NOT NULL).
 * The race name is GENERATED from the selected track and layout; a custom title is an optional override.
 */

export type DistanceType = 'laps' | 'endurance'

export interface EventFormState {
  round: string
  trackId: string
  date: string
  time: string
  distanceType: DistanceType
  distanceValue: string
  classId: string
  regionId: string
  customTitle: string
  qualifyingMinutes: string
  tireRules: string
  fuelRules: string
  weatherNotes: string
  penaltyNotes: string
  notes: string
  status: EventStatus
  isPublished: boolean
}

export const MANUALLY_SELECTABLE_STATUSES: EventStatus[] = ['draft', 'scheduled', 'cancelled', 'postponed', 'archived']

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  live: 'Live',
  completed: 'Completed',
  cancelled: 'Cancelled',
  postponed: 'Postponed',
  archived: 'Archived',
}

export function emptyEventForm(suggestedRound: number): EventFormState {
  return {
    round: String(suggestedRound),
    trackId: '',
    date: '',
    time: '',
    distanceType: 'laps',
    distanceValue: '',
    classId: '',
    regionId: '',
    customTitle: '',
    qualifyingMinutes: '',
    tireRules: '',
    fuelRules: '',
    weatherNotes: '',
    penaltyNotes: '',
    notes: '',
    status: 'scheduled',
    isPublished: false,
  }
}

export function eventFormFromRow(event: EventRow): EventFormState {
  return {
    round: String(event.round),
    trackId: event.track_id ?? '',
    date: event.event_date ?? '',
    time: event.start_time ? event.start_time.slice(0, 5) : '',
    distanceType: event.race_distance_type ?? 'laps',
    distanceValue: event.race_value ? String(event.race_value) : '',
    classId: event.class_id ?? '',
    regionId: event.region_id ?? '',
    customTitle: event.custom_title ?? '',
    qualifyingMinutes: event.qualifying_minutes ? String(event.qualifying_minutes) : '',
    tireRules: event.tire_rules ?? '',
    fuelRules: event.fuel_rules ?? '',
    weatherNotes: event.weather_notes ?? '',
    penaltyNotes: event.penalty_notes ?? '',
    notes: event.notes ?? '',
    status: event.status,
    isPublished: event.is_published,
  }
}

/** "Suzuka Circuit — Grand Prix": the track's name plus its layout, or "Untitled Race" with no track. */
export function generatedEventTitle(track: { name: string; layout: string | null } | null | undefined): string {
  const name = (track?.name ?? '').trim()
  const layout = (track?.layout ?? '').trim()
  if (!name) return layout || 'Untitled Race'
  return layout ? `${name} — ${layout}` : name
}

export interface EventFormContext {
  /** Championship flags decide what the server requires, not whether the season happens to have linked classes/regions. */
  classesEnabled: boolean
  regionsEnabled: boolean
  game: GameId
  existingRounds: Set<number>
  /** Editing: this event's own round is not a conflict. */
  editingRound?: number | null
}

const positiveInt = (value: string): number | null => {
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return n > 0 ? n : null
}

export function validateEventForm(form: EventFormState, ctx: EventFormContext): string[] {
  const errors: string[] = []
  const round = positiveInt(form.round)
  if (round === null) errors.push('Enter a round number of 1 or more.')
  else if (round !== ctx.editingRound && ctx.existingRounds.has(round)) errors.push(`Round ${round} is already used in this season.`)
  if (!form.trackId) errors.push('Choose a track.')
  if (form.date && !/^\d{4}-\d{2}-\d{2}$/.test(form.date)) errors.push('Enter a valid date.')
  if (form.time && !/^\d{2}:\d{2}$/.test(form.time)) errors.push('Enter a valid start time.')
  if (positiveInt(form.distanceValue) === null) errors.push(form.distanceType === 'endurance' ? 'Enter the race length in minutes.' : 'Enter the number of laps.')
  if (ctx.classesEnabled && !form.classId) errors.push('Choose a class.')
  // GT7's region always derives server-side from the track's country, so it never blocks saving; other games need a region when regions are on.
  if (ctx.regionsEnabled && ctx.game !== 'gran_turismo_7' && !form.regionId) errors.push('Choose a region.')
  if (form.qualifyingMinutes.trim() && positiveInt(form.qualifyingMinutes) === null) errors.push('Qualifying length must be a whole number of minutes.')
  return errors
}

export interface EventPayload {
  round: number
  title: string
  custom_title: string | null
  track_id: string
  track_layout: string | null
  event_date: string | null
  start_time: string | null
  time_zone: string | null
  class_id: string | null
  region_id: string | null
  qualifying_minutes: number | null
  race_distance_type: DistanceType
  race_value: number
  tire_rules: string | null
  fuel_rules: string | null
  weather_notes: string | null
  penalty_notes: string | null
  notes: string | null
  status: EventStatus
  is_published: boolean
}

const blankToNull = (value: string): string | null => value.trim() || null

/** Builds the write payload. Only call with a form that passed `validateEventForm`. */
export function eventPayload(
  form: EventFormState,
  track: { name: string; layout: string | null },
  ctx: Pick<EventFormContext, 'classesEnabled' | 'regionsEnabled' | 'game'>,
  timeZone: string | null,
): EventPayload {
  return {
    round: positiveInt(form.round) as number,
    title: generatedEventTitle(track),
    custom_title: blankToNull(form.customTitle),
    track_id: form.trackId,
    track_layout: blankToNull(track.layout ?? ''),
    event_date: form.date || null,
    start_time: form.time ? `${form.time}:00` : null,
    time_zone: form.time ? timeZone : null,
    class_id: ctx.classesEnabled ? form.classId || null : null,
    // For GT7 the server trigger overwrites region_id from the track's country; a stale client value is harmless but never sent when regions are off.
    region_id: ctx.regionsEnabled ? form.regionId || null : null,
    qualifying_minutes: positiveInt(form.qualifyingMinutes),
    race_distance_type: form.distanceType,
    race_value: positiveInt(form.distanceValue) as number,
    tire_rules: blankToNull(form.tireRules),
    fuel_rules: blankToNull(form.fuelRules),
    weather_notes: blankToNull(form.weatherNotes),
    penalty_notes: blankToNull(form.penaltyNotes),
    notes: blankToNull(form.notes),
    status: form.status,
    is_published: form.isPublished,
  }
}

/** The status choices for the editor: the manual ones, plus the event's current value when it is race-control-driven (live/completed). */
export function selectableStatuses(current: EventStatus): EventStatus[] {
  return MANUALLY_SELECTABLE_STATUSES.includes(current) ? MANUALLY_SELECTABLE_STATUSES : [...MANUALLY_SELECTABLE_STATUSES, current]
}

export function nextSuggestedRound(rounds: number[]): number {
  return rounds.length === 0 ? 1 : Math.max(...rounds) + 1
}

/**
 * `vrc_save_results` reads the event's classes from `event_classes` (it does NOT fall back to `events.class_id`), so the race's class has to
 * be mirrored there. Returns the class set to write, or null when nothing should change: a multi-class event (more than one row) that still
 * includes the chosen class is left alone, and an event whose single row already matches needs no write.
 */
export function plannedEventClassSync(existingClassIds: string[], chosenClassId: string | null): string[] | null {
  if (!chosenClassId) return null
  if (existingClassIds.length === 0) return [chosenClassId]
  if (existingClassIds.length === 1) return existingClassIds[0] === chosenClassId ? null : [chosenClassId]
  return existingClassIds.includes(chosenClassId) ? null : [chosenClassId]
}
