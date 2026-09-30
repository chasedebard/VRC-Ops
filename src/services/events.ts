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
