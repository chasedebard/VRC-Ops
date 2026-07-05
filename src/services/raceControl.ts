import { supabase } from '@/supabase/client'
import type { EventSessionNoteRow, EventSessionRow, SessionState } from '@/types/database'

export async function getEventSession(eventId: string): Promise<EventSessionRow | null> {
  const { data, error } = await supabase
    .from('event_sessions')
    .select('*')
    .eq('event_id', eventId)
    .returns<EventSessionRow[]>()
    .maybeSingle()
  if (error) throw error
  return data
}

export function subscribeToEventSession(
  eventId: string,
  onChange: (session: EventSessionRow) => void,
) {
  const channel = supabase
    .channel(`event_session:${eventId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'event_sessions', filter: `event_id=eq.${eventId}` },
      (payload) => onChange(payload.new as EventSessionRow),
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}

/**
 * Drives the event_sessions state machine. The server (vrc_session_transition) is the
 * authority on which transitions are legal; this call will fail with a Postgres error
 * if the target state isn't reachable from the current one or the caller lacks
 * canOperateRaceControl, so the UI should surface `error.message` rather than
 * re-implementing the state machine client-side.
 */
export async function transitionSession(
  eventId: string,
  expectedVersion: number,
  target: SessionState,
  reason: string | null,
  override = false,
): Promise<EventSessionRow> {
  const { data, error } = await supabase.rpc('vrc_session_transition', {
    p_event: eventId,
    p_expected_version: expectedVersion,
    p_target: target,
    p_reason: reason,
    p_override: override,
  })
  if (error) throw error
  return data as EventSessionRow
}

export async function getSessionNotes(eventId: string): Promise<EventSessionNoteRow[]> {
  const { data, error } = await supabase
    .from('event_session_notes')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .returns<EventSessionNoteRow[]>()
  if (error) throw error
  return data ?? []
}

export async function addSessionNote(
  eventId: string,
  leagueId: string,
  note: string,
): Promise<void> {
  const { error } = await supabase
    .from('event_session_notes')
    .insert({ event_id: eventId, league_id: leagueId, note })
  if (error) throw error
}
