import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { RequirePermission } from '@/permissions/Guard'
import { getEvent } from '@/services/events'
import { getResultAudit } from '@/services/results'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDateTime } from '@/utils/format'
import type { EventRow, ResultAuditRow } from '@/types/database'

export default function ResultsAuditLogPage() {
  return (
    <RequirePermission permission="canApproveResults">
      <ResultsAuditLogContent />
    </RequirePermission>
  )
}

function ResultsAuditLogContent() {
  const { eventId } = useParams<{ eventId: string }>()
  const [event, setEvent] = useState<EventRow | null>(null)
  const [entries, setEntries] = useState<ResultAuditRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!eventId) return
    setError(null)
    try {
      const [e, audit] = await Promise.all([getEvent(eventId), getResultAudit(eventId)])
      setEvent(e)
      setEntries(audit)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the audit log.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (entries === null) return <LoadingState />

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Results audit log</h1>
        {event && (
          <Link
            to={`/race-weekend/${event.id}`}
            className="text-sm underline"
            style={{ color: 'var(--color-text-muted)' }}
          >
            Round {event.round}
            {event.custom_title ? ` — ${event.custom_title}` : ''}
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Every result-set change ({entries.length})</CardTitle>
        </CardHeader>
        {entries.length === 0 ? (
          <EmptyState
            title="No changes recorded yet"
            description="Every submit, review, approval, lock, and reopen for this event's results will appear here."
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {entries.map((entry) => (
              <li key={entry.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">
                    {entry.action}
                    {entry.actor_role ? ` — ${entry.actor_role}` : ''}
                  </span>
                  <span style={{ color: 'var(--color-text-muted)' }}>{formatDateTime(entry.created_at)}</span>
                </div>
                {(entry.previous_state || entry.new_state) && (
                  <p className="mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                    {entry.previous_state ?? '—'} → {entry.new_state ?? '—'}
                  </p>
                )}
                {entry.reason && <p className="mt-0.5 italic">{entry.reason}</p>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
