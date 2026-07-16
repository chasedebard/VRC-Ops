import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { createLeagueAnnouncement, getLeagueAnnouncements } from '@/services/announcements'
import { Button } from '@/components/Button'
import { LoadingState, EmptyState } from '@/components/States'
import { formatDateTime } from '@/utils/format'
import { toSafeErrorMessage } from '@/utils/errors'
import { MegaphoneIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function LeagueAnnouncementsTile(_props: TileComponentProps) {
  const { permissions, selectedLeague } = useLeagueSession()
  const { leagueId } = useDashboardBaseData()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: dashboardKeys.leagueAnnouncements(leagueId), queryFn: () => getLeagueAnnouncements(leagueId) })
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedLeague || !title.trim() || !body.trim()) return
    setPosting(true)
    setError(null)
    try {
      await createLeagueAnnouncement(leagueId, selectedLeague.membershipId, title.trim(), body.trim())
      setTitle('')
      setBody('')
      await queryClient.invalidateQueries({ queryKey: dashboardKeys.leagueAnnouncements(leagueId) })
    } catch (err) {
      setError(toSafeErrorMessage(err, 'Could not post the announcement.'))
    } finally {
      setPosting(false)
    }
  }

  if (query.isLoading) return <LoadingState />
  if (query.error) {
    return <EmptyState title="Could not load announcements" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }

  const announcements = query.data ?? []

  return (
    <div className="space-y-3">
      {permissions.canManageMembers && (
        <form onSubmit={handlePost} className="space-y-1.5 border-b pb-3 text-sm" style={{ borderColor: 'var(--color-border)' }}>
          <input
            className="w-full rounded-lg border px-2.5 py-1.5 text-sm"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border px-2.5 py-1.5 text-sm"
            style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            placeholder="What's happening in the league?"
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex items-center justify-between">
            {error && <span className="text-xs" style={{ color: 'var(--color-danger)' }}>{error}</span>}
            <Button type="submit" disabled={posting || !title.trim() || !body.trim()} className="ml-auto">
              {posting ? 'Posting…' : 'Post'}
            </Button>
          </div>
        </form>
      )}
      {announcements.length === 0 ? (
        <EmptyState title="No announcements yet" />
      ) : (
        <ul className="space-y-3 text-sm">
          {announcements.map((a) => (
            <li key={a.id}>
              <p className="font-medium">{a.title}</p>
              <p style={{ color: 'var(--color-text-muted)' }}>{a.body}</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {formatDateTime(a.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

registerTile({
  type: 'league_announcements',
  displayName: 'League Announcements',
  description: 'Recent owner or administrator announcements.',
  icon: MegaphoneIcon,
  category: 'other',
  supportedSizes: ['medium', 'wide', 'large'],
  defaultSize: 'medium',
  minSize: 'medium',
  maxSize: 'large',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: LeagueAnnouncementsTile,
})
