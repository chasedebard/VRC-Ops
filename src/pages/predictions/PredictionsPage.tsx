import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { getSeasonEvents } from '@/services/events'
import { getDrivers } from '@/services/drivers'
import {
  getLatestPredictionRuns,
  getPredictionEvaluations,
  requestPredictionRecompute,
  subscribeToPredictions,
} from '@/services/predictions'
import { resolveCurrentRace, eventDisplayTitle, eventRoundLabel } from '@/utils/currentRace'
import {
  buildMovement,
  buildSpotlight,
  buildTopStory,
  findMarket,
  orderedRaceMarkets,
  percentText,
  previousProbability,
  resolveAccuracy,
} from '@/utils/predictionPresentation'
import {
  CHAMPIONSHIP_CATEGORY,
  CONFIDENCE_LABEL,
  MARKET_LABEL,
  PHASE_LABEL,
  PREDICTION_MODEL_VERSION,
  RACE_CATEGORY,
  type ChampionshipForecast,
  type PredictionMarketResult,
  type PredictionSet,
  type StoredPredictionEvaluation,
  type StoredPredictionRun,
} from '@/types/predictions'
import { FeatureLegalGate } from '@/components/FeatureLegalGate'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { formatDateTime } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { ChampionshipRow, EventRow, SeasonRow } from '@/types/database'

/**
 * Predictions hub (iOS `VRCPredictionsHubView`). Every number on this page is READ from `prediction_runs` /
 * `prediction_evaluations`, which the server-side `predictions-worker` computes — the browser never calculates or
 * writes odds. Premium entitlement is enforced by the route's ProGate, and the AI consent gate below wraps the fetch
 * so nothing loads until consent is confirmed (RLS also requires it).
 */
export default function PredictionsPage() {
  return (
    <FeatureLegalGate docType="ai">
      <PredictionsContent />
    </FeatureLegalGate>
  )
}

interface HubData {
  championship: ChampionshipRow
  season: SeasonRow
  event: EventRow | null
  events: EventRow[]
  driverNames: Map<string, string>
  storedRuns: StoredPredictionRun[]
  evaluations: StoredPredictionEvaluation[]
}

function PredictionsContent() {
  const { selectedLeague, permissions } = useLeagueSession()
  const leagueId = selectedLeague?.league.id
  const [data, setData] = useState<HubData | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [requestMessage, setRequestMessage] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const loadId = useRef(0)

  const load = useCallback(
    async (silent = false) => {
      if (!leagueId) return
      const id = ++loadId.current
      if (!silent) setData(undefined)
      else setRefreshing(true)
      setError(null)
      try {
        const active = await resolveActiveSeason(leagueId)
        if (!active) {
          if (id === loadId.current) setData(null)
          return
        }
        const [events, drivers, storedRuns, evaluations] = await Promise.all([
          getSeasonEvents(active.season.id),
          getDrivers(leagueId, true),
          getLatestPredictionRuns(active.season.id),
          getPredictionEvaluations(active.season.id),
        ])
        if (id !== loadId.current) return
        // The race markets target the current/next race: operable = not archived, cancelled or completed.
        const operable = events.filter((e) => e.status !== 'archived' && e.status !== 'cancelled' && e.status !== 'completed')
        setData({
          championship: active.championship,
          season: active.season,
          event: resolveCurrentRace(operable),
          events,
          driverNames: new Map(drivers.map((d) => [d.id, d.display_name])),
          storedRuns,
          evaluations,
        })
      } catch (err) {
        if (id === loadId.current) setError(backendErrorMessage(err, 'Could not load predictions.'))
      } finally {
        if (id === loadId.current) setRefreshing(false)
      }
    },
    [leagueId],
  )

  useEffect(() => {
    void load()
  }, [load])

  // The worker stores new runs/evaluations as results land — refresh (debounced) when it does.
  const seasonId = data?.season.id
  useEffect(() => {
    if (!seasonId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = subscribeToPredictions(seasonId, () => {
      clearTimeout(timer)
      timer = setTimeout(() => void load(true), 400)
    })
    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [seasonId, load])

  const view = useMemo(() => {
    if (!data) return null
    const raceRun = data.event
      ? data.storedRuns.find((r) => r.category === RACE_CATEGORY && r.event_id === data.event?.id)
      : undefined
    const championshipRun = data.storedRuns.find((r) => r.category === CHAMPIONSHIP_CATEGORY)
    const raceSet = raceRun?.payload ?? null
    const championshipSet = championshipRun?.payload ?? null
    const signature = championshipRun?.source_signature ?? raceRun?.source_signature ?? ''
    const movement =
      championshipSet && championshipRun ? buildMovement(championshipSet, data.storedRuns, championshipRun.source_signature) : []
    return {
      raceRun,
      championshipRun,
      raceSet,
      championshipSet,
      signature,
      movement,
      topStory: buildTopStory({
        race: raceSet,
        championship: championshipSet,
        eventTitle: data.event ? eventDisplayTitle(data.event) : null,
        remaining: championshipSet?.remaining_round_count ?? 0,
      }),
      spotlight: buildSpotlight({ race: raceSet, championship: championshipSet, movement }),
      reviews: resolveAccuracy({
        events: data.events.map((e) => ({ id: e.id, title: eventDisplayTitle(e) })),
        storedRuns: data.storedRuns,
        evaluations: data.evaluations,
        driverNames: data.driverNames,
      }),
      lastComputedAt: championshipRun?.generated_at ?? raceRun?.generated_at ?? null,
    }
  }, [data])

  async function handleRequest() {
    if (!data) return
    setRequesting(true)
    setRequestMessage(null)
    try {
      await requestPredictionRecompute(data.championship.id, data.season.id, data.event?.id ?? null)
      setRequestMessage('Queued. New predictions appear here as soon as the server finishes calculating them.')
    } catch (err) {
      setRequestMessage(backendErrorMessage(err, 'The prediction refresh could not be queued. Try again later.'))
    } finally {
      setRequesting(false)
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (data === undefined || !view) return <LoadingState label="Loading predictions…" />
  if (data === null) {
    return <EmptyState title="No active season" description="Predictions need an active season with a roster." />
  }

  const canRequest = permissions.canManageSetup
  const nothingStored = !view.raceSet && !view.championshipSet
  const groupMarkets = (key: 'class_championship' | 'region_championship') =>
    view.championshipSet?.markets.filter((m) => m.market === key) ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Predictions</h1>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {data.event ? `${eventRoundLabel(data.event)} · ${eventDisplayTitle(data.event)}` : data.season.name}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {view.lastComputedAt ? <span>Updated {formatDateTime(view.lastComputedAt)}</span> : null}
          {refreshing && <span aria-live="polite">Refreshing…</span>}
        </div>
      </div>

      {nothingStored ? (
        <EmptyState
          title="No predictions yet"
          description="Predictions appear once the season has an active roster. Odds are calculated on the server — they start wide with limited data and sharpen as official results come in."
          action={
            canRequest ? (
              <Button onClick={handleRequest} disabled={requesting}>
                {requesting ? 'Queuing…' : 'Request now'}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {view.topStory && (
            <Card>
              <div className="flex items-center justify-between gap-2">
                <Badge tone="accent">Top Story</Badge>
                <Badge tone="neutral">{CONFIDENCE_LABEL[view.topStory.confidence]}</Badge>
              </div>
              <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {view.topStory.title}
              </p>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xl font-bold">{view.topStory.subjectName}</p>
                <p className="text-3xl font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
                  {percentText(view.topStory.probability)}
                </p>
              </div>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {view.topStory.contextLine}
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {view.topStory.reasons.slice(0, 3).map((reason) => (
                  <li key={reason}>✓ {reason}</li>
                ))}
              </ul>
            </Card>
          )}

          <RaceSection
            raceSet={view.raceSet}
            hasEvent={Boolean(data.event)}
            canRequest={canRequest}
            requesting={requesting}
            onRequest={handleRequest}
            storedRuns={data.storedRuns}
            signature={view.raceRun?.source_signature ?? ''}
            eventId={data.event?.id ?? null}
          />

          {view.championshipSet && findMarket(view.championshipSet, 'championship') && (
            <section className="space-y-3">
              <SectionHeader
                title="Championship"
                subtitle={`${view.championshipSet.official_round_count} scored · ${view.championshipSet.remaining_round_count} remaining`}
              />
              <MarketCard
                market={findMarket(view.championshipSet, 'championship') as PredictionMarketResult}
                topCount={5}
                storedRuns={data.storedRuns}
                signature={view.championshipRun?.source_signature ?? ''}
                eventId={null}
              />
              {view.movement.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Movement</CardTitle>
                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Since the last stored update
                    </span>
                  </CardHeader>
                  <ul className="space-y-1 text-sm">
                    {view.movement.slice(0, 4).map((move) => (
                      <li key={move.driverId} className="flex items-center justify-between gap-2">
                        <span>
                          <span aria-hidden style={{ color: move.delta > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                            {move.delta > 0 ? '↗' : '↘'}
                          </span>{' '}
                          {move.driverName}
                          <span className="sr-only">{move.delta > 0 ? ' moved up' : ' moved down'}</span>
                        </span>
                        <span className="tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                          {percentText(move.previousProbability)} → {percentText(move.currentProbability)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
              {view.championshipSet.forecast && <ProjectedOrder forecast={view.championshipSet.forecast} />}
            </section>
          )}

          <GroupSection
            title="Class Championships"
            markets={groupMarkets('class_championship')}
            storedRuns={data.storedRuns}
            signature={view.championshipRun?.source_signature ?? ''}
          />
          <GroupSection
            title="Region Championships"
            markets={groupMarkets('region_championship')}
            storedRuns={data.storedRuns}
            signature={view.championshipRun?.source_signature ?? ''}
          />

          {view.spotlight && (
            <Card>
              <CardHeader>
                <CardTitle>Driver Spotlight</CardTitle>
                <span className="text-sm font-semibold">{view.spotlight.driverName}</span>
              </CardHeader>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Best market</dt>
                  <dd>
                    {MARKET_LABEL[view.spotlight.bestMarket]} · {percentText(view.spotlight.bestProbability)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Weakest market</dt>
                  <dd>
                    {MARKET_LABEL[view.spotlight.weakestMarket]} · {percentText(view.spotlight.weakestProbability)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Next race</dt>
                  <dd>{view.spotlight.raceOutlook}</dd>
                </div>
                <div>
                  <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Championship</dt>
                  <dd>
                    {view.spotlight.championshipOutlook} · {view.spotlight.trend}
                  </dd>
                </div>
              </dl>
              <Link
                to={`/drivers/${view.spotlight.driverId}`}
                className="mt-3 inline-block text-sm font-semibold underline"
                style={{ color: 'var(--color-accent)' }}
              >
                Open driver profile
              </Link>
            </Card>
          )}

          <section className="space-y-3">
            <SectionHeader title="Prediction Accuracy" subtitle="Stored predictions vs official results" />
            {view.reviews.length === 0 ? (
              <Card>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  Accuracy tracking starts now: each prediction update is stored, and once a race with a stored prediction
                  finishes, the predicted odds appear here beside the actual results.
                </p>
              </Card>
            ) : (
              view.reviews.map((review) => (
                <Card key={review.eventId}>
                  <CardHeader>
                    <CardTitle>{review.eventTitle}</CardTitle>
                    <Badge tone="neutral">
                      {PHASE_LABEL[review.phase]} · {review.reviews.reduce((s, r) => s + r.hitCount, 0)}/
                      {review.reviews.reduce((s, r) => s + r.sampleCount, 0)}
                    </Badge>
                  </CardHeader>
                  <ul className="space-y-2 text-sm">
                    {review.reviews.map((r) => (
                      <li key={r.market} className="flex items-start gap-2">
                        <Badge tone={r.outcome === 'hit' ? 'success' : r.outcome === 'miss' ? 'danger' : 'warning'}>
                          {r.outcome === 'hit' ? 'Hit' : r.outcome === 'miss' ? 'Miss' : 'Partial'}
                        </Badge>
                        <span>
                          <span className="font-medium">{MARKET_LABEL[r.market]}:</span> {r.summary}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))
            )}
          </section>

          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Odds are calculated on the server from official results, driver history, qualifying, and practice data. More
            completed rounds make them sharper. Telemetry never leaves the device that captured it. Model{' '}
            {PREDICTION_MODEL_VERSION}.
          </p>
        </>
      )}
      {requestMessage && (
        <p role="status" className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {requestMessage}
        </p>
      )}
    </div>
  )
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string | null }) {
  return (
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && (
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

function RaceSection({
  raceSet,
  hasEvent,
  canRequest,
  requesting,
  onRequest,
  storedRuns,
  signature,
  eventId,
}: {
  raceSet: PredictionSet | null
  hasEvent: boolean
  canRequest: boolean
  requesting: boolean
  onRequest: () => void
  storedRuns: StoredPredictionRun[]
  signature: string
  eventId: string | null
}) {
  if (raceSet) {
    return (
      <section className="space-y-3">
        <SectionHeader
          title="Race Predictions"
          subtitle={raceSet.phase === 'post_qualifying' ? 'Post-qualifying' : 'Pre-qualifying'}
        />
        {orderedRaceMarkets(raceSet.markets).map((market) => (
          <MarketCard
            key={market.market}
            market={market}
            topCount={5}
            storedRuns={storedRuns}
            signature={signature}
            eventId={eventId}
          />
        ))}
      </section>
    )
  }
  if (!hasEvent) return null
  // Predictions compute on a short server interval, so a brand-new or just-changed race can briefly have no stored
  // run yet — that is the normal in-between state, not an error.
  return (
    <Card>
      <CardTitle>Race Predictions</CardTitle>
      <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }} role="status">
        Recalculating predictions for this race… They appear here shortly.
      </p>
      {canRequest && (
        <Button className="mt-3" variant="secondary" onClick={onRequest} disabled={requesting}>
          {requesting ? 'Queuing…' : 'Request now'}
        </Button>
      )}
    </Card>
  )
}

function GroupSection({
  title,
  markets,
  storedRuns,
  signature,
}: {
  title: string
  markets: PredictionMarketResult[]
  storedRuns: StoredPredictionRun[]
  signature: string
}) {
  if (markets.length === 0) return null
  return (
    <section className="space-y-3">
      <SectionHeader title={title} />
      {markets.map((market) => (
        <MarketCard
          key={`${market.market}.${market.group_id}`}
          market={market}
          topCount={3}
          titleOverride={market.group_name}
          storedRuns={storedRuns}
          signature={signature}
          eventId={null}
        />
      ))}
    </section>
  )
}

function MarketCard({
  market,
  topCount,
  titleOverride,
  storedRuns,
  signature,
  eventId,
}: {
  market: PredictionMarketResult
  topCount: number
  titleOverride?: string | null
  storedRuns: StoredPredictionRun[]
  signature: string
  eventId: string | null
}) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? market.entries.slice(0, 10) : market.entries.slice(0, topCount)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titleOverride ?? MARKET_LABEL[market.market]}</CardTitle>
        <Badge tone={market.confidence === 'high' ? 'success' : market.confidence === 'medium' ? 'warning' : 'neutral'}>
          {CONFIDENCE_LABEL[market.confidence]}
        </Badge>
      </CardHeader>
      <p className="mb-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        {market.basis_summary}
      </p>
      <ol className="space-y-2">
        {shown.map((entry) => {
          const before = previousProbability({
            market: market.market,
            driverId: entry.driver_id,
            groupId: market.group_id,
            eventId,
            storedRuns,
            currentSignature: signature,
          })
          const delta = before === null ? null : entry.probability - before
          return (
            <li key={entry.driver_id} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  <span className="mr-2 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                    {entry.rank}
                  </span>
                  {entry.driver_number ? `#${entry.driver_number} ` : ''}
                  <Link to={`/drivers/${entry.driver_id}`} className="font-medium hover:underline">
                    {entry.driver_name}
                  </Link>
                </span>
                <span className="flex items-center gap-2 tabular-nums">
                  {delta !== null && Math.abs(delta) >= 0.005 && (
                    <span
                      className="text-xs"
                      style={{ color: delta > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}
                      title="Change since the previous stored update"
                    >
                      {delta > 0 ? '▲' : '▼'} {percentText(Math.abs(delta))}
                    </span>
                  )}
                  <strong>{percentText(entry.probability)}</strong>
                </span>
              </div>
              <div
                className="mt-1 h-1.5 rounded-full"
                style={{ backgroundColor: 'var(--color-border)' }}
                role="img"
                aria-label={`${entry.driver_name}: ${percentText(entry.probability)}`}
              >
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${Math.max(2, Math.min(100, entry.probability * 100))}%`, backgroundColor: 'var(--color-accent)' }}
                />
              </div>
              {expanded && entry.reasons.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {entry.reasons.map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        className="mt-3 text-xs font-semibold underline"
        style={{ color: 'var(--color-accent)' }}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Show less' : 'Why these odds'}
      </button>
      {expanded && (
        <div className="mt-2 space-y-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {market.inputs_used.length > 0 && <p>Used: {market.inputs_used.join(' · ')}</p>}
          {market.inputs_missing.length > 0 && <p>Missing: {market.inputs_missing.join(' · ')}</p>}
        </div>
      )}
    </Card>
  )
}

function ProjectedOrder({ forecast }: { forecast: ChampionshipForecast }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Projected Final Order</CardTitle>
      </CardHeader>
      <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        {forecast.narrative}
      </p>
      <ol className="space-y-1 text-sm">
        {forecast.projected.slice(0, 6).map((row) => (
          <li key={row.driver_id} className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              <span className="mr-2 tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                {row.projected_position}
              </span>
              {row.number ? `#${row.number} ` : ''}
              {row.name}
            </span>
            <span className="tabular-nums">{row.projected_points} pts</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
