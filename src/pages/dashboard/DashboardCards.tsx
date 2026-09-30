import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { DriverAvatar } from '@/components/DriverAvatar'
import { MultiSeriesTrendChart } from '@/components/charts/MultiSeriesTrendChart'
import { EmptyState } from '@/components/States'
import { Field } from '@/components/Field'
import { seriesColor } from '@/utils/colors'
import { formatDate, formatDateTime, formatLapTime } from '@/utils/format'
import { eventDisplayTitle, eventRoundLabel } from '@/utils/currentRace'
import { distanceText, eventPhaseLabel, heroMetadataText, heroRoundLabel, isRaceSessionLive, raceCountdown } from '@/utils/dashboardModel'
import { seriesFilter, classSeries, regionSeries, rankedDriverRows, OVERALL_SERIES, type SeriesKey } from '@/utils/standingsEngine'
import { standingsConfigForSeason } from '@/services/standingsData'
import { pointsTrend } from '@/utils/dashboardModel'
import type { DashboardData } from '@/services/dashboardData'
import type { DriverRow } from '@/types/database'

const muted = { color: 'var(--color-text-muted)' }

function DriverLine({ driver, detail }: { driver: DriverRow | null | undefined; detail?: string | null }) {
  if (!driver) return <span style={muted}>Not available</span>
  return (
    <span className="flex items-center gap-2">
      <DriverAvatar driver={driver} size="sm" />
      <span>
        <Link to={`/drivers/${driver.id}`} className="font-medium hover:underline">
          {driver.display_name}
        </Link>
        {detail && <span className="block text-xs" style={muted}>{detail}</span>}
      </span>
    </span>
  )
}

/** Universal next-race hero — every role, exactly once. The label/"live" flag come from the session state, never `events.status` alone. */
export function HeroCard({ data, canOpenRaceWeekend }: { data: DashboardData; canOpenRaceWeekend: boolean }) {
  const event = data.upcoming
  if (!event) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Next race</CardTitle>
        </CardHeader>
        <p className="text-sm" style={muted}>
          No upcoming race is scheduled.{' '}
          <Link to="/championships" className="underline" style={{ color: 'var(--color-accent)' }}>
            View the schedule
          </Link>
        </p>
      </Card>
    )
  }
  const sessionState = data.upcomingSession?.state ?? null
  const phaseLabel = eventPhaseLabel(event.status, sessionState)
  const countdown = raceCountdown(event.event_date, isRaceSessionLive(sessionState))
  const target = canOpenRaceWeekend ? `/race-weekend/${event.id}` : '/championships'
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-accent)' }}>
            {heroRoundLabel(event.round)}
            {phaseLabel && <span className="ml-2"><Badge tone={event.status === 'postponed' ? 'warning' : 'success'}>{phaseLabel}</Badge></span>}
          </p>
          <h2 className="text-xl font-bold">
            <Link to={target} className="hover:underline">
              {data.upcomingTrackName ?? eventDisplayTitle(event)}
            </Link>
          </h2>
          {data.upcomingTrackName && event.track_layout && <p className="text-sm" style={muted}>{event.track_layout}</p>}
          <p className="text-sm" style={muted}>
            {heroMetadataText({
              classesEnabled: data.championship.classes_enabled,
              className: data.upcomingClassName,
              dateText: event.event_date ? formatDate(event.event_date) : null,
              timeText: event.start_time ? event.start_time.slice(0, 5) : null,
            })}
            {' · '}
            {distanceText(event)}
          </p>
          {data.championship.regions_enabled && data.upcomingRegionName && (
            <p className="text-xs" style={muted}>{data.upcomingRegionName}</p>
          )}
        </div>
        <div className="text-center" aria-label={countdown.isLive ? 'Race is live' : countdown.primaryText === '—' ? 'Date to be announced' : `${countdown.primaryText} ${countdown.unitText}`.trim()}>
          <p className="text-4xl font-black leading-none" style={{ color: countdown.isLive ? 'var(--color-success)' : 'var(--color-text)' }}>
            {countdown.primaryText}
          </p>
          {countdown.unitText && <p className="text-xs font-semibold tracking-widest" style={muted}>{countdown.unitText}</p>}
        </div>
      </div>
    </Card>
  )
}

export function SetupWarningBanner({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <Card role="status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Setup needs attention</p>
          <p className="text-sm" style={muted}>Missing {items.join(', ')}.</p>
        </div>
        <Link to="/championships" className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
          Open setup
        </Link>
      </div>
    </Card>
  )
}

export function RaceLeadersCard({ data, classLocked, regionLocked }: { data: DashboardData; classLocked: boolean; regionLocked: boolean }) {
  const classEnabled = data.championship.classes_enabled
  const regionEnabled = data.championship.regions_enabled
  const event = data.upcoming
  const classId = event?.class_id ?? null
  const regionId = event?.region_id ?? null
  const show = (classEnabled && classId) || (regionEnabled && regionId)
  if (!event || !show) return null
  function leader(key: SeriesKey) {
    const { rows } = leaderRows(data, key)
    return rows[0] ?? null
  }
  const block = (title: string, key: SeriesKey, locked: boolean) => {
    const top = locked ? null : leader(key)
    return (
      <div key={title}>
        <p className="text-xs" style={muted}>{title}</p>
        {locked ? (
          <p className="text-sm" style={muted}>🔒 Pro feature</p>
        ) : top ? (
          <p className="text-sm font-semibold">
            {top.number ? `#${top.number} ` : ''}
            {top.name} <span className="font-normal" style={muted}>· {top.points} pts</span>
          </p>
        ) : (
          <p className="text-sm" style={muted}>Standings not available</p>
        )}
      </div>
    )
  }
  const className = data.classes.find((c) => c.id === classId)?.name
  const regionName = data.regions.find((r) => r.id === regionId)?.name
  return (
    <Card>
      <CardHeader>
        <CardTitle>Championship leaders</CardTitle>
      </CardHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        {regionEnabled && regionId && block(`Region leader · ${regionName ?? 'Region'}`, regionSeries(regionId), regionLocked)}
        {classEnabled && classId && block(`Class leader · ${className ?? 'Class'}`, classSeries(classId), classLocked)}
      </div>
    </Card>
  )
}

/** The same engine, drop rounds and tie-break as the Standings screen — a class/region leader here always matches Standings. */
function leaderRows(data: DashboardData, key: SeriesKey) {
  return rankedDriverRows(data.eventScores.map((e) => e.scores), data.driverInfo, standingsConfigForSeason(data.season), seriesFilter(key))
}

export function SeasonProgressCard({ data }: { data: DashboardData }) {
  const pct = data.totalEvents > 0 ? Math.round((data.currentRound / data.totalEvents) * 100) : 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>Season progress</CardTitle>
        <span className="text-xs" style={muted}>{data.season.name}</span>
      </CardHeader>
      <p className="text-sm">
        Round {data.currentRound} of {data.totalEvents}
      </p>
      <div role="progressbar" aria-label="Season progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="mt-2 h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-border)' }}>
        <div className="h-full" style={{ width: `${pct}%`, backgroundColor: 'var(--color-accent)' }} />
      </div>
    </Card>
  )
}

export function LastRaceCard({ data }: { data: DashboardData }) {
  const race = data.lastRace
  if (!race) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Last race</CardTitle>
        </CardHeader>
        <p className="text-sm" style={muted}>No completed races yet.</p>
      </Card>
    )
  }
  const d = (id: string | undefined) => (id ? data.driversById.get(id) : undefined)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last race</CardTitle>
        <Link to={`/results/${race.event.id}`} className="text-xs underline" style={{ color: 'var(--color-accent)' }}>
          Results
        </Link>
      </CardHeader>
      <p className="font-semibold">{[eventRoundLabel(race.event), race.trackName ?? eventDisplayTitle(race.event), race.className].filter(Boolean).join(' · ')}</p>
      <p className="mb-3 text-xs" style={muted}>{distanceText(race.event)}</p>
      <dl className="space-y-2 text-sm">
        <div><dt className="text-xs" style={muted}>Winner</dt><dd><DriverLine driver={d(race.winner?.driver_id)} /></dd></div>
        <div><dt className="text-xs" style={muted}>Pole</dt><dd><DriverLine driver={d(race.pole?.driver_id)} /></dd></div>
        <div><dt className="text-xs" style={muted}>Fastest lap</dt><dd><DriverLine driver={d(race.fastestLap?.driver_id)} detail={race.fastestLap?.best_lap_ms ? formatLapTime(race.fastestLap.best_lap_ms) : null} /></dd></div>
      </dl>
    </Card>
  )
}

export function DriverSpotlightCard({ driver, data }: { driver: DriverRow | null; data: DashboardData }) {
  if (!driver) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Driver spotlight</CardTitle>
        </CardHeader>
        <p className="text-sm" style={muted}>No active season drivers yet.</p>
      </Card>
    )
  }
  const standing = data.standings.find((s) => s.driverId === driver.id)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Driver spotlight</CardTitle>
      </CardHeader>
      <div className="flex items-center gap-3">
        <DriverAvatar driver={driver} size="card" />
        <div>
          <Link to={`/drivers/${driver.id}`} className="font-semibold hover:underline">
            {driver.display_name}
          </Link>
          <p className="text-sm" style={muted}>
            {standing ? `P${standing.position} · ${standing.points} pts · ${standing.wins} win${standing.wins === 1 ? '' : 's'}` : 'No official results yet; the spotlight updates as race data is finalized.'}
          </p>
        </div>
      </div>
    </Card>
  )
}

export function MyRatingCard({ data }: { data: DashboardData }) {
  const rating = data.myDriver?.rating
  if (!rating) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>My rating</CardTitle>
        <Badge tone="accent">{rating.rating_value.toFixed(1)}</Badge>
      </CardHeader>
      <dl className="grid grid-cols-3 gap-2 text-center text-sm">
        <div><dd className="text-lg font-bold">{rating.race_craft.toFixed(0)}</dd><dt className="text-xs" style={muted}>Race craft</dt></div>
        <div><dd className="text-lg font-bold">{rating.consistency.toFixed(0)}</dd><dt className="text-xs" style={muted}>Consistency</dt></div>
        <div><dd className="text-lg font-bold">{rating.qualifying !== null ? rating.qualifying.toFixed(0) : '—'}</dd><dt className="text-xs" style={muted}>Qualifying</dt></div>
      </dl>
      <p className="mt-2 text-xs" style={muted}>
        Last calculated {formatDateTime(rating.calculated_at)} · {rating.confidence} confidence. Recorded by the VRC Ops apps after result saves.
      </p>
    </Card>
  )
}

export function StewardReviewCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Results awaiting review</CardTitle>
        {data.stewardPendingEvents.length > 0 && <Badge tone="warning">{data.stewardPendingEvents.length}</Badge>}
      </CardHeader>
      {data.stewardPendingEvents.length === 0 ? (
        <p className="text-sm" style={muted}>No results are waiting on official review.</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {data.stewardPendingEvents.map((event) => (
            <li key={event.id}>
              <Link to={`/results/${event.id}`} className="flex items-center justify-between py-2 text-sm hover:underline">
                <span>{eventRoundLabel(event)} · {eventDisplayTitle(event)}</span>
                <span aria-hidden>›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function StewardPenaltiesCard({ data }: { data: DashboardData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent penalties</CardTitle>
      </CardHeader>
      {data.recentPenalties.length === 0 ? (
        <p className="text-sm" style={muted}>No penalties issued.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {data.recentPenalties.map((p) => {
            const parts = [
              p.disqualification ? 'Disqualification' : null,
              p.time_penalty_ms ? `+${Math.round(p.time_penalty_ms / 1000)}s` : null,
              p.position_penalty ? `−${p.position_penalty} position${p.position_penalty === 1 ? '' : 's'}` : null,
              p.point_deduction ? `−${p.point_deduction} pts` : null,
            ].filter(Boolean)
            return (
              <li key={p.id}>
                <p className="font-medium">{data.driversById.get(p.driver_id)?.display_name ?? 'Driver'} <span className="font-normal" style={muted}>· {parts.join(', ') || p.penalty_type || 'Penalty'}</span></p>
                {p.reason && <p className="text-xs" style={muted}>{p.reason}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export function RecentActivityCard({ data }: { data: DashboardData }) {
  const attention = data.attention
  return (
    <Card>
      <CardHeader>
        <CardTitle>Needs attention</CardTitle>
        {attention && <span className="text-xs" style={muted}>{attention.healthSummaryText}</span>}
      </CardHeader>
      {!attention || !attention.hasAnything ? (
        <p className="text-sm" style={muted}>Nothing needs attention right now.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {attention.upcomingEventTitle && <li>Next up: <strong>{attention.upcomingEventTitle}</strong></li>}
          {attention.missingQualifyingEvents.length > 0 && <li>Qualifying results missing: {attention.missingQualifyingEvents.join(', ')}</li>}
          {attention.missingRaceEvents.length > 0 && <li>Race results missing: {attention.missingRaceEvents.join(', ')}</li>}
          {attention.pendingInvitationCount > 0 && (
            <li>
              {attention.pendingInvitationCount} pending invitation{attention.pendingInvitationCount === 1 ? '' : 's'} ·{' '}
              <Link to="/admin/invitations" className="underline">Manage</Link>
            </li>
          )}
          {attention.pendingDriverNumberRequests.length > 0 && <li>Number requests: {attention.pendingDriverNumberRequests.join(', ')}</li>}
        </ul>
      )}
    </Card>
  )
}

export function QuickActionsGrid({ actions }: { actions: { to: string; label: string; premium?: boolean; locked?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {actions.map((a) => (
        <Link key={a.label} to={a.to} className="block">
          <Card className="h-full text-center transition hover:shadow-md">
            <p className="font-semibold">{a.label}</p>
            {a.locked && <p className="text-xs" style={muted}>Pro</p>}
          </Card>
        </Link>
      ))}
    </div>
  )
}

export function QuickActionsCard({ actions }: { actions: { to: string; label: string; locked?: boolean }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick actions</CardTitle>
      </CardHeader>
      <QuickActionsGrid actions={actions} />
    </Card>
  )
}

export function AnnouncementsCard({ data, canPost, onPost }: { data: DashboardData; canPost: boolean; onPost: (title: string, body: string) => Promise<string | null> }) {
  const [composing, setComposing] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const failure = await onPost(title, body)
    setBusy(false)
    if (failure) setError(failure)
    else {
      setTitle('')
      setBody('')
      setComposing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Announcements</CardTitle>
        {canPost && (
          <Button variant="secondary" onClick={() => setComposing((v) => !v)} aria-expanded={composing}>
            {composing ? 'Cancel' : 'Post'}
          </Button>
        )}
      </CardHeader>
      {composing && (
        <form onSubmit={submit} className="mb-4 space-y-3">
          <Field label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Message</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
            />
          </label>
          {error && <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
          <Button type="submit" disabled={busy || !title.trim() || !body.trim()}>{busy ? 'Posting…' : 'Post announcement'}</Button>
        </form>
      )}
      {data.announcements.length === 0 ? (
        <p className="text-sm" style={muted}>No announcements yet.</p>
      ) : (
        <ul className="space-y-3">
          {data.announcements.map((a) => (
            <li key={a.id}>
              <p className="font-medium">{a.title}</p>
              <p className="whitespace-pre-wrap text-sm" style={muted}>{a.body}</p>
              <p className="text-xs" style={muted}>{formatDateTime(a.created_at)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function PointsTrendCard({ data, classLocked, regionLocked }: { data: DashboardData; classLocked: boolean; regionLocked: boolean }) {
  type Source = { id: string; label: string; key: SeriesKey }
  const sources: Source[] = [{ id: 'overall', label: 'Overall', key: OVERALL_SERIES }]
  if (data.championship.classes_enabled && !classLocked) {
    for (const id of data.seasonClassIds) sources.push({ id: `class:${id}`, label: data.classes.find((c) => c.id === id)?.name ?? 'Class', key: classSeries(id) })
  }
  if (data.championship.regions_enabled && !regionLocked) {
    for (const id of data.seasonRegionIds) sources.push({ id: `region:${id}`, label: data.regions.find((r) => r.id === id)?.name ?? 'Region', key: regionSeries(id) })
  }
  const [sourceId, setSourceId] = useState('overall')
  const source = sources.find((s) => s.id === sourceId) ?? sources[0]
  const names = new Map([...data.driverInfo].map(([id, info]) => [id, info.name]))
  const trend = pointsTrend(data.eventScores, seriesFilter(source.key), names)
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Championship points trend</CardTitle>
          <p className="text-xs" style={muted}>Total points after each round</p>
        </div>
        {sources.length > 1 && (
          <select aria-label="Trend series" value={source.id} onChange={(e) => setSourceId(e.target.value)} className="rounded-lg border bg-transparent px-2 py-1 text-sm" style={{ borderColor: 'var(--color-border)' }}>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        )}
      </CardHeader>
      {trend.series.length === 0 || trend.xLabels.length < 1 ? (
        <EmptyState title="No scored rounds yet" description="The trend appears once official results are saved." />
      ) : (
        <div role="img" aria-label={`Points after each round for ${trend.series.map((s) => `${s.label} ${s.values[s.values.length - 1]}`).join(', ')}`}>
          <MultiSeriesTrendChart xLabels={trend.xLabels} series={trend.series.map((s, i) => ({ id: s.driverId, label: s.label, color: seriesColor(i), values: s.values }))} />
        </div>
      )}
    </Card>
  )
}
