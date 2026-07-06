import { supabase } from '@/supabase/client'
import type { EventClassRow, EventDriverRow, EventRow } from '@/types/database'

export async function getSeasonEvents(seasonId: string): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('season_id', seasonId)
    .order('round')
    .returns<EventRow[]>()
  if (error) throw error
  return data ?? []
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .returns<EventRow[]>()
    .maybeSingle()
  if (error) throw error
  return data
}

export type EventDraft = Pick<EventRow, 'league_id' | 'championship_id' | 'season_id' | 'round'> &
  Partial<EventRow>

export async function createEvent(draft: EventDraft): Promise<EventRow> {
  const { data, error } = await supabase
    .from('events')
    .insert(draft)
    .select('*')
    .returns<EventRow[]>()
    .single()
  if (error) throw error
  return data
}

export async function updateEvent(id: string, patch: Partial<EventRow>): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function getEventClasses(eventId: string): Promise<EventClassRow[]> {
  const { data, error } = await supabase
    .from('event_classes')
    .select('*')
    .eq('event_id', eventId)
    .returns<EventClassRow[]>()
  if (error) throw error
  return data ?? []
}

export async function setEventClasses(
  eventId: string,
  leagueId: string,
  classIds: string[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('event_classes')
    .delete()
    .eq('event_id', eventId)
  if (deleteError) throw deleteError
  if (classIds.length === 0) return
  const { error } = await supabase
    .from('event_classes')
    .insert(classIds.map((class_id) => ({ event_id: eventId, league_id: leagueId, class_id })))
  if (error) throw error
}

export async function getEventDrivers(eventId: string): Promise<EventDriverRow[]> {
  const { data, error } = await supabase
    .from('event_drivers')
    .select('*')
    .eq('event_id', eventId)
    .returns<EventDriverRow[]>()
  if (error) throw error
  return data ?? []
}

export async function setEventDrivers(
  eventId: string,
  leagueId: string,
  driverIds: string[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('event_drivers')
    .delete()
    .eq('event_id', eventId)
  if (deleteError) throw deleteError
  if (driverIds.length === 0) return
  const { error } = await supabase
    .from('event_drivers')
    .insert(driverIds.map((driver_id) => ({ event_id: eventId, league_id: leagueId, driver_id })))
  if (error) throw error
}

/**
 * Ports RacePrepUpcomingEventResolver.select(): pick exactly one event to surface as
 * "current/upcoming" on the Race Weekend hub — the earliest event dated today or later,
 * falling back to the most-recent incomplete event once the calendar is finished. Uses
 * yyyy-MM-dd string comparison to avoid UTC off-by-one issues, matching the Swift resolver.
 */
export function resolveUpcomingEvent(events: EventRow[]): EventRow | null {
  const usable = events.filter((e) => e.status !== 'cancelled' && e.status !== 'archived')
  if (usable.length === 0) return null

  const todayKey = new Date().toISOString().slice(0, 10)
  const dated = usable
    .filter((e) => e.event_date)
    .sort((a, b) => (a.event_date! < b.event_date! ? -1 : a.event_date! > b.event_date! ? 1 : 0))

  const upcoming = dated.find((e) => e.event_date! >= todayKey)
  if (upcoming) return upcoming

  const incomplete = [...usable]
    .filter((e) => e.status !== 'completed')
    .sort((a, b) => b.round - a.round)
  if (incomplete.length > 0) return incomplete[0]

  return dated.length > 0 ? dated[dated.length - 1] : usable[usable.length - 1]
}

/**
 * Most recent event whose race actually has official results — for a
 * dashboard "last race" summary and season-progress counts.
 *
 * `events.status` is administrative workflow state, not a reliable "this
 * race happened" signal — an event can sit at `scheduled` indefinitely even
 * after `vrc_save_results` finalizes its race results (status has to be
 * changed separately). The only trustworthy signal is whether the event has
 * a `race`-kind driver_history entry, so callers should pass the set of
 * event ids derived from season driver history
 * (`new Set(history.filter(h => h.result_kind === 'race').map(h => h.event_id))`).
 * Falls back to the `status`/date heuristic only if that set is omitted or empty.
 */
export function resolveLastCompletedEvent(
  events: EventRow[],
  completedEventIds?: Set<string>,
): EventRow | null {
  if (completedEventIds && completedEventIds.size > 0) {
    const withResults = events.filter((e) => completedEventIds.has(e.id)).sort((a, b) => b.round - a.round)
    if (withResults.length > 0) return withResults[0]
  }

  const completed = events.filter((e) => e.status === 'completed').sort((a, b) => b.round - a.round)
  if (completed.length > 0) return completed[0]

  const todayKey = new Date().toISOString().slice(0, 10)
  const past = events
    .filter((e) => e.event_date && e.event_date < todayKey && e.status !== 'cancelled')
    .sort((a, b) => b.round - a.round)
  return past[0] ?? null
}
