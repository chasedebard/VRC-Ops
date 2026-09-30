import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useEntitlement } from '@/hooks/useEntitlement'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { loadDriverProfile, type DriverProfileSnapshot } from '@/services/driverProfileData'
import { isFeatureUnlocked, isFeatureProLocked } from '@/config/featureRegistry'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { DriverAvatar } from '@/components/DriverAvatar'
import { MmrBadge } from '@/components/MmrBadge'
import { ProLockedState } from '@/components/ProLockedState'
import { TrendChart, type TrendPoint } from '@/components/charts/TrendChart'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { DriverAdminPanel } from '@/pages/drivers/DriverAdminPanel'
import { TrophyCase } from '@/pages/drivers/TrophyCase'
import { formatDate, formatLapTime } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'
import { myDriverIn } from '@/services/rivals'
import { getDrivers } from '@/services/drivers'

type Section = 'overview' | 'trophies'
type Scope = 'season' | 'career'

const fmt1 = (n: number | null) => (n === null ? '—' : n.toFixed(1))
const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * Driver profile (iOS `VRCGlobalDriverProfileView`). Everyone sees the identity, redacted Global Rating badge, rival marker, season card and
 * recent form; Season/Career analytics (trend, career, milestones, records, progression, rating history, class/track breakdowns, race log)
 * require `advancedDriverAnalytics` (Pro or League Plus) and are not even fetched without it. The Trophy Case is per championship.
 * Owners/Admins get management; the linked driver gets "Edit my profile".
 */
export default function DriverProfilePage() {
  const { id } = useParams<{ id: string }>()
  const { state } = useAuth()
  const { selectedLeague, permissions } = useLeagueSession()
  const { hasAccess, status: entitlementStatus } = useEntitlement()
  const advanced = isFeatureUnlocked('advancedDriverAnalytics', hasAccess)
  const proLocked = isFeatureProLocked('advancedDriverAnalytics', hasAccess)

  const [snapshot, setSnapshot] = useState<DriverProfileSnapshot | null>(null)
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [viewerDriverId, setViewerDriverId] = useState<string | null | undefined>(undefined)
  const [section, setSection] = useState<Section>('overview')
  const [scope, setScope] = useState<Scope>('season')
  const [error, setError] = useState<string | null>(null)

  const userId = state.kind === 'authenticated' ? state.user.id : null
  const leagueId = selectedLeague?.league.id ?? null

  // The viewer's own driver drives the rival marker.
  useEffect(() => {
    if (!leagueId) return
    getDrivers(leagueId, true)
      .then((list) => setViewerDriverId(myDriverIn(list, userId)?.id ?? null))
      .catch(() => setViewerDriverId(null))
  }, [leagueId, userId])

  const load = useCallback(async () => {
    if (!id || !leagueId || viewerDriverId === undefined || entitlementStatus === 'loading') return
    setError(null)
    try {
      setSnapshot(await loadDriverProfile({ driverId: id, leagueId, advanced, viewerDriverId, seasonId }))
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load this driver.'))
    }
  }, [id, leagueId, advanced, viewerDriverId, seasonId, entitlementStatus])

  useEffect(() => {
    void load()
  }, [load])

  // Career scope snaps shut the moment Pro lapses (league data itself stays).
  useEffect(() => {
    if (!advanced) setScope('season')
  }, [advanced])

  const trendPoints = useMemo<TrendPoint[]>(
    () => (snapshot?.seasonTrend ?? []).map((p) => ({ label: `R${p.round}`, value: p.points })),
    [snapshot],
  )

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (!snapshot) return <LoadingState label="Loading driver…" />

  const { driver } = snapshot
  const isSelf = userId !== null && driver.user_id === userId
  const canManage = permissions.canManageSetup

  return (
    <div className="space-y-5">
      <Link to="/drivers" className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
        ← Drivers
      </Link>

      <div className="flex flex-wrap items-center gap-4">
        <DriverAvatar driver={driver} size="hero" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{driver.display_name}</h1>
            {driver.driver_number != null && <Badge tone="accent">#{driver.driver_number}</Badge>}
            {!driver.is_active && <Badge tone="warning">Inactive</Badge>}
            {snapshot.isViewerRival && (
              <span title="Your current rival this season" aria-label="Your current rival this season" className="text-lg">
                Ⓡ
              </span>
            )}
          </div>
          {snapshot.mmr && <MmrBadge tier={snapshot.mmr.tier} globalRank={snapshot.mmr.global_rank} titleBadge={snapshot.mmr.title_badge} />}
          {driver.bio && (
            <p className="max-w-prose text-sm" style={{ color: 'var(--color-text-muted)' }}>
              {driver.bio}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {isSelf && (
              <Link to="/drivers/me" className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
                Edit my profile
              </Link>
            )}
          </div>
        </div>
      </div>

      {snapshot.options.length > 1 && (
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Profile context</span>
          <select
            value={snapshot.selected?.seasonId ?? ''}
            onChange={(e) => setSeasonId(e.target.value)}
            className="rounded-lg border bg-transparent px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--color-border)' }}
          >
            {snapshot.options.map((o) => (
              <option key={o.seasonId} value={o.seasonId}>
                {o.label}
                {o.isActive ? ' (active)' : ''}
              </option>
            ))}
          </select>
        </label>
      )}

      <div role="tablist" aria-label="Profile sections" className="flex gap-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {(['overview', 'trophies'] as Section[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={section === s}
            onClick={() => setSection(s)}
            className="px-3 py-2 text-sm font-medium"
            style={{ borderBottom: `2px solid ${section === s ? 'var(--color-accent)' : 'transparent'}`, opacity: section === s ? 1 : 0.7 }}
          >
            {s === 'overview' ? 'Overview' : 'Trophy Case'}
          </button>
        ))}
      </div>

      {section === 'trophies' ? (
        snapshot.trophies ? (
          <TrophyCase trophies={snapshot.trophies} />
        ) : (
          <EmptyState title="Join a championship to start earning trophies" />
        )
      ) : (
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>{snapshot.season.title}</CardTitle>
              {snapshot.season.rank !== null && <Badge tone="accent">P{snapshot.season.rank}</Badge>}
            </CardHeader>
            {snapshot.season.hasResults ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                <Stat label="Points" value={snapshot.season.points} />
                <Stat label="Wins" value={snapshot.season.wins} />
                <Stat label="Podiums" value={snapshot.season.podiums} />
                <Stat label="Starts" value={snapshot.season.starts} />
                <Stat label="Poles" value={snapshot.season.poles} />
                <Stat label="Fastest laps" value={snapshot.season.fastestLaps} />
                <Stat label="Avg finish" value={fmt1(snapshot.season.averageFinish)} />
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No official results for this season yet.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent form</CardTitle>
              <Badge tone="neutral">{snapshot.trend.label}</Badge>
            </CardHeader>
            {snapshot.recent.length === 0 ? (
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No races yet.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {snapshot.recent.map((r) => (
                  <span key={r.eventId} className="rounded-lg border px-3 py-1.5 text-sm font-semibold" style={{ borderColor: 'var(--color-border)' }} title={`Round ${r.round}`}>
                    {r.label}
                  </span>
                ))}
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {snapshot.trend.subtitle}
                </span>
              </div>
            )}
          </Card>

          {proLocked ? (
            <ProLockedState
              title="Driver analytics & Career require VRC Ops Pro"
              description="Trends, career history, milestones, records, rating history and the full race log are included with VRC Ops Pro and League Plus."
            />
          ) : (
            advanced && (
              <>
                <div role="group" aria-label="Analytics scope" className="flex gap-2">
                  {(['season', 'career'] as Scope[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={scope === s}
                      onClick={() => setScope(s)}
                      className="rounded-full border px-4 py-1 text-sm font-medium"
                      style={{
                        borderColor: scope === s ? 'var(--color-accent)' : 'var(--color-border)',
                        backgroundColor: scope === s ? 'var(--color-accent)' : 'transparent',
                        color: scope === s ? 'var(--color-accent-contrast)' : 'var(--color-text)',
                      }}
                    >
                      {s === 'season' ? 'Season' : 'Career'}
                    </button>
                  ))}
                </div>
                {scope === 'season' ? <SeasonAnalytics snapshot={snapshot} trendPoints={trendPoints} /> : <CareerAnalytics snapshot={snapshot} />}
              </>
            )
          )}
        </div>
      )}

      {canManage && <DriverAdminPanel driver={driver} leagueId={selectedLeague.league.id} onChanged={load} />}
    </div>
  )
}

function SeasonAnalytics({ snapshot, trendPoints }: { snapshot: DriverProfileSnapshot; trendPoints: TrendPoint[] }) {
  const finish = snapshot.seasonTrend.filter((p) => p.finish !== null)
  const qualifying = snapshot.seasonTrend.filter((p) => p.qualifying !== null)
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Points trend</CardTitle>
          <Badge tone="accent">{snapshot.trend.subtitle}</Badge>
        </CardHeader>
        <div role="img" aria-label={`Cumulative points by round: ${trendPoints.map((p) => `${p.label} ${p.value}`).join(', ') || 'no data'}`}>
          <TrendChart points={trendPoints} />
        </div>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Finishing positions</CardTitle>
          </CardHeader>
          <div role="img" aria-label={`Finish by round: ${finish.map((p) => `R${p.round} P${p.finish}`).join(', ') || 'no data'}`}>
            <TrendChart points={finish.map((p) => ({ label: `R${p.round}`, value: p.finish as number, isWin: p.finish === 1, isPodium: (p.finish as number) <= 3 }))} height={120} />
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Lower is better.
          </p>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Qualifying positions</CardTitle>
          </CardHeader>
          <div role="img" aria-label={`Qualifying by round: ${qualifying.map((p) => `R${p.round} P${p.qualifying}`).join(', ') || 'no data'}`}>
            <TrendChart points={qualifying.map((p) => ({ label: `R${p.round}`, value: p.qualifying as number }))} height={120} />
          </div>
        </Card>
      </div>
    </div>
  )
}

function CareerAnalytics({ snapshot }: { snapshot: DriverProfileSnapshot }) {
  const detail = snapshot.careerDetail
  const career = snapshot.career
  const progression = snapshot.progression
  const [metric, setMetric] = useState<'points' | 'winRate' | 'podiumRate'>('points')
  const series: TrendPoint[] = progression.map((p) => ({
    label: `${p.round}`,
    value: metric === 'points' ? p.cumulativePoints : metric === 'winRate' ? p.winRate * 100 : p.podiumRate * 100,
  }))
  const latestRating = snapshot.ratingHistory[snapshot.ratingHistory.length - 1]

  return (
    <div className="space-y-5">
      {career && (
        <Card>
          <CardHeader>
            <CardTitle>Career</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            <Stat label="Seasons" value={career.seasons} />
            <Stat label="Starts" value={career.starts} />
            <Stat label="Wins" value={career.wins} />
            <Stat label="Podiums" value={career.podiums} />
            <Stat label="Poles" value={career.poles} />
            <Stat label="Points" value={career.totalPoints} />
          </div>
          {detail && detail.stats.starts > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
              <Fact label="Win rate" value={detail.stats.winRate !== null ? pct(detail.stats.winRate) : '—'} />
              <Fact label="Podium rate" value={detail.stats.podiumRate !== null ? pct(detail.stats.podiumRate) : '—'} />
              <Fact label="Finish rate" value={detail.stats.finishRate !== null ? pct(detail.stats.finishRate) : '—'} />
              <Fact label="DNF rate" value={detail.stats.dnfRate !== null ? pct(detail.stats.dnfRate) : '—'} />
              <Fact label="Avg finish" value={fmt1(detail.stats.averageFinish)} />
              <Fact label="Avg start" value={fmt1(detail.stats.averageStart)} />
              <Fact label="Positions gained" value={detail.stats.averagePositionsGained !== null ? detail.stats.averagePositionsGained.toFixed(1) : '—'} />
              <Fact label="Points / start" value={fmt1(detail.stats.averagePointsPerStart)} />
            </dl>
          )}
        </Card>
      )}

      {detail && detail.placements.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Seasons</CardTitle>
            {detail.championshipsWon > 0 && <Badge tone="warning">{detail.championshipsWon}× champion</Badge>}
          </CardHeader>
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {detail.placements.map((p) => (
              <li key={p.seasonId} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium">{p.seasonName}</span>
                <span className="flex items-center gap-2">
                  {p.rank !== null && (
                    <Badge tone={p.isChampionship ? 'warning' : 'neutral'}>
                      P{p.rank} of {p.fieldSize}
                      {!p.isCompleted ? ' (in progress)' : ''}
                    </Badge>
                  )}
                  <span style={{ color: 'var(--color-text-muted)' }}>{p.points} pts</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {snapshot.milestones.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Milestones</CardTitle>
          </CardHeader>
          <ol className="space-y-2">
            {snapshot.milestones.map((m) => (
              <li key={`${m.kind}-${m.title}`} className="text-sm">
                <p className="font-medium">{m.title}</p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {[m.date ? formatDate(m.date) : null, m.detail].filter(Boolean).join(' · ')}
                </p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {snapshot.records && (
        <Card>
          <CardHeader>
            <CardTitle>Records</CardTitle>
          </CardHeader>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <Fact label="Best finish" value={snapshot.records.bestFinish !== null ? `P${snapshot.records.bestFinish}` : '—'} />
            <Fact label="Worst finish" value={snapshot.records.worstFinish !== null ? `P${snapshot.records.worstFinish}` : '—'} />
            <Fact label="Favourite track" value={snapshot.records.favoriteTrack ?? '—'} />
            <Fact label="Most successful track" value={snapshot.records.mostSuccessfulTrack ?? '—'} />
            <Fact label="Most improved season" value={snapshot.records.mostImprovedSeason ?? '—'} />
            <Fact
              label="Biggest rival"
              value={snapshot.records.biggestRival && snapshot.records.biggestRivalName ? `${snapshot.records.biggestRivalName} — ${snapshot.records.biggestRival.record}` : '—'}
            />
          </dl>
        </Card>
      )}

      {progression.length >= 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Career progression</CardTitle>
            <div role="group" aria-label="Progression metric" className="flex gap-1">
              {(['points', 'winRate', 'podiumRate'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={metric === m}
                  onClick={() => setMetric(m)}
                  className="rounded-full border px-2.5 py-0.5 text-xs"
                  style={{ borderColor: metric === m ? 'var(--color-accent)' : 'var(--color-border)', fontWeight: metric === m ? 700 : 400 }}
                >
                  {m === 'points' ? 'Points' : m === 'winRate' ? 'Win rate' : 'Podium rate'}
                </button>
              ))}
            </div>
          </CardHeader>
          <div role="img" aria-label={`Career ${metric} after each of ${progression.length} races`}>
            <TrendChart points={series} />
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Rating history</CardTitle>
          {latestRating && <Badge tone="accent">{latestRating.rating_value.toFixed(1)}</Badge>}
        </CardHeader>
        {snapshot.ratingHistory.length >= 2 ? (
          <div role="img" aria-label={`Stored rating snapshots, latest ${latestRating?.rating_value.toFixed(1)}`}>
            <TrendChart points={snapshot.ratingHistory.map((r) => ({ label: formatDate(r.calculated_at), value: r.rating_value }))} />
          </div>
        ) : latestRating ? (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            One stored snapshot so far ({latestRating.rating_value.toFixed(1)}, {latestRating.confidence} confidence).
          </p>
        ) : (
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            No rating snapshots yet. The VRC Ops apps record one after each official result save; the website only displays them.
          </p>
        )}
      </Card>

      {snapshot.classStrengths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>By class</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-muted)' }}>
                  <th className="pb-2 pr-4">Class</th>
                  <th className="pb-2 pr-4">Starts</th>
                  <th className="pb-2 pr-4">Wins</th>
                  <th className="pb-2 pr-4">Podiums</th>
                  <th className="pb-2 pr-4">Avg finish</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {snapshot.classStrengths.map((c) => (
                  <tr key={c.classId}>
                    <td className="py-2 pr-4 font-medium">
                      {c.className}
                      {c.isLimitedData && <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>limited data</span>}
                    </td>
                    <td className="py-2 pr-4">{c.starts}</td>
                    <td className="py-2 pr-4">{c.wins}</td>
                    <td className="py-2 pr-4">{c.podiums}</td>
                    <td className="py-2 pr-4">{fmt1(c.averageFinish)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {snapshot.trackHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Track history</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-muted)' }}>
                  <th className="pb-2 pr-4">Circuit</th>
                  <th className="pb-2 pr-4">Starts</th>
                  <th className="pb-2 pr-4">Wins</th>
                  <th className="pb-2 pr-4">Podiums</th>
                  <th className="pb-2 pr-4">Best</th>
                  <th className="pb-2 pr-4">Avg finish</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {snapshot.trackHistory.map((t) => (
                  <tr key={t.key}>
                    <td className="py-2 pr-4 font-medium">{t.trackName}</td>
                    <td className="py-2 pr-4">{t.starts}</td>
                    <td className="py-2 pr-4">{t.wins}</td>
                    <td className="py-2 pr-4">{t.podiums}</td>
                    <td className="py-2 pr-4">{t.bestFinish !== null ? `P${t.bestFinish}` : '—'}</td>
                    <td className="py-2 pr-4">{fmt1(t.averageFinish)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <RaceLog rows={snapshot.raceLog} />
    </div>
  )
}

function RaceLog({ rows }: { rows: DriverProfileSnapshot['raceLog'] }) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? rows : rows.slice(0, 10)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Race log</CardTitle>
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {rows.length} race{rows.length === 1 ? '' : 's'}
        </span>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyState title="No races yet" description="Results appear here once official races are saved." />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr style={{ color: 'var(--color-text-muted)' }}>
                  <th className="pb-2 pr-4">Round</th>
                  <th className="pb-2 pr-4">Race</th>
                  <th className="pb-2 pr-4">Class</th>
                  <th className="pb-2 pr-4">Result</th>
                  <th className="pb-2 pr-4">Points</th>
                  <th className="pb-2 pr-4">FL</th>
                  <th className="pb-2 pr-4">Best lap</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2 pr-4">{r.round || '—'}</td>
                    <td className="py-2 pr-4">
                      <Link to={`/results/${r.eventId}`} className="hover:underline">
                        {r.title}
                      </Link>
                    </td>
                    <td className="py-2 pr-4">{r.className ?? '—'}</td>
                    <td className="py-2 pr-4 font-semibold">{r.resultLabel}</td>
                    <td className="py-2 pr-4">{r.points}</td>
                    <td className="py-2 pr-4">{r.fastestLap ? '✓' : ''}</td>
                    <td className="py-2 pr-4 font-mono">{formatLapTime(r.bestLapMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 10 && (
            <button type="button" className="mt-2 text-sm underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {label}
      </p>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
