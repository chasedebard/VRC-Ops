import type { EventRow } from '@/types/database'

/** yyyy-MM-dd in the viewer's local calendar — string comparison avoids UTC off-by-one errors (matches iOS `dayKey`). */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Port of iOS `VRCRaceWeekendCurrentRace.resolve` — the single "current race" every screen agrees on:
 * a live event first; otherwise the nearest dated event today or later that isn't completed; otherwise the most
 * recent past event; otherwise the first round. Cancelled/archived events never count as dated candidates.
 */
export function resolveCurrentRace(events: EventRow[], now: Date = new Date()): EventRow | null {
  if (events.length === 0) return null
  const live = events.find((e) => e.status === 'live')
  if (live) return live

  const today = dayKey(now)
  const dated = events.filter((e) => e.event_date && e.status !== 'cancelled' && e.status !== 'archived')

  const upcoming = dated
    .filter((e) => (e.event_date ?? '') >= today && e.status !== 'completed')
    .sort((a, b) => {
      if ((a.event_date ?? '') !== (b.event_date ?? '')) return (a.event_date ?? '') < (b.event_date ?? '') ? -1 : 1
      return a.round - b.round
    })
  if (upcoming[0]) return upcoming[0]

  const past = dated
    .filter((e) => (e.event_date ?? '') < today)
    .sort((a, b) => {
      if ((a.event_date ?? '') !== (b.event_date ?? '')) return (a.event_date ?? '') > (b.event_date ?? '') ? -1 : 1
      return b.round - a.round
    })
  if (past[0]) return past[0]

  return [...events].sort((a, b) => a.round - b.round)[0] ?? null
}

export type CurrentRaceTemporality = 'Current' | 'Upcoming' | 'Completed'

export function raceTemporality(event: EventRow, now: Date = new Date()): CurrentRaceTemporality {
  if (event.status === 'live') return 'Current'
  if (event.status === 'completed') return 'Completed'
  if (!event.event_date) return 'Upcoming'
  return event.event_date >= dayKey(now) ? 'Upcoming' : 'Completed'
}

/** "Round 4 · Suzuka" style title: prefers the custom title when one is set. */
export function eventDisplayTitle(event: Pick<EventRow, 'title' | 'custom_title'>): string {
  const custom = event.custom_title?.trim()
  return custom ? custom : event.title
}

export function eventRoundLabel(event: Pick<EventRow, 'round'>): string {
  return event.round > 0 ? `Round ${event.round}` : 'Unscheduled'
}
