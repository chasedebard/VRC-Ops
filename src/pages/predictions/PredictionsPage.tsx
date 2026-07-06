import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { getSeasonEvents, resolveUpcomingEvent } from '@/services/events'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { getDrivers } from '@/services/drivers'
import { getLatestStandings, getAvailableStandingsGroups } from '@/services/standings'
import { classesService, regionsService } from '@/services/catalog'
import { savePredictionRun } from '@/services/predictions'
import { DEFAULT_SCORING_RULE } from '@/utils/scoring'
import {
  buildChampionshipForecast,
  buildFactorInputs,
  computeLeaguePriors,
  computePace,
  confidenceTier,
  fastestLapScore,
  formatPercent,
  leagueAveragePacePerRound,
  normalizeToProbabilitiesBayesian,
  podiumScore,
  poleScore,
  predictionConfidence,
  raceWinnerScore,
  type ChampionshipForecast,
} from '@/utils/predictions'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { ChampionshipRow, SeasonRow, StandingsType } from '@/types/database'

interface MarketRow {
  driverId: string
  displayName: string
  probability: number
}

const MAX_POINTS_PER_ROUND =
  DEFAULT_SCORING_RULE.positionPoints[0] + DEFAULT_SCORING_RULE.poleBonus + DEFAULT_SCORING_RULE.fastestLapBonus

export default function PredictionsPage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const [context, setContext] = useState<{ championship: ChampionshipRow; season: SeasonRow } | null | undefined>(
    undefined,
  )
  const [markets, setMarkets] = useState<Record<
    'raceWin' | 'podium' | 'pole' | 'fastestLap' | 'incidentRisk',
    MarketRow[]
  > | null>(null)
  const [confidence, setConfidence] = useState(0)
  const [completedRaces, setCompletedRaces] = useState(0)
  const [totalRounds, setTotalRounds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)

  const [forecastScope, setForecastScope] = useState<StandingsType>('overall')
  const [forecastGroupOptions, setForecastGroupOptions] = useState<{ id: string; label: string }[]>([])
  const [forecastGroupKey, setForecastGroupKey] = useState<string | null>(null)
  const [forecast, setForecast] = useState<ChampionshipForecast | null>(null)

  async function load() {
    if (!selectedLeague) return
    setError(null)
    try {
      const active = await resolveActiveSeason(selectedLeague.league.id)
      setContext(active)
      if (!active) return

      const [events, history, drivers] = await Promise.all([
        getSeasonEvents(active.season.id),
        getSeasonDriverHistory(active.season.id),
        getDrivers(selectedLeague.league.id, false),
      ])
      const upcoming = resolveUpcomingEvent(events)
      setEventId(upcoming?.id ?? null)
      setTotalRounds(events.length)

      const driverIds = Array.from(new Set(history.map((h) => h.driver_id)))
      const leaguePriors = computeLeaguePriors(history)
      const factorInputs = driverIds.map((id) => {
        const driver = drivers.find((d) => d.id === id)
        return buildFactorInputs(id, driver?.display_name ?? 'Driver', history, upcoming?.track_id ?? null, leaguePriors)
      })

      const completed = new Set(history.filter((h) => h.result_kind === 'race').map((h) => h.event_id)).size
      setCompletedRaces(completed)
      setConfidence(predictionConfidence(completed, events.length))

      function toMarket(scoreFn: (f: (typeof factorInputs)[number]) => number): MarketRow[] {
        const scored = factorInputs.map((f) => ({ driverId: f.driverId, score: scoreFn(f), sampleSize: f.completedRaceCount }))
        const probs = normalizeToProbabilitiesBayesian(scored)
        return probs
          .map((p) => ({
            driverId: p.driverId,
            displayName: factorInputs.find((f) => f.driverId === p.driverId)?.displayName ?? 'Driver',
            probability: p.probability,
          }))
          .sort((a, b) => b.probability - a.probability)
          .slice(0, 5)
      }

      function toIncidentRiskMarket(): MarketRow[] {
        return factorInputs
          .map((f) => ({ driverId: f.driverId, displayName: f.displayName, probability: f.incidentRisk }))
          .sort((a, b) => b.probability - a.probability)
          .slice(0, 5)
      }

      setMarkets({
        raceWin: toMarket(raceWinnerScore),
        podium: toMarket(podiumScore),
        pole: toMarket(poleScore),
        fastestLap: toMarket(fastestLapScore),
        incidentRisk: toIncidentRiskMarket(),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build predictions.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.league.id])

  // Championship/class/region forecast group options (mirrors StandingsPage).
  useEffect(() => {
    if (!context || !selectedLeague) return
    async function loadGroups() {
      if (forecastScope === 'overall') {
        setForecastGroupOptions([])
        setForecastGroupKey(null)
        return
      }
      const keys = await getAvailableStandingsGroups(context!.season.id, forecastScope)
      const catalog = forecastScope === 'class' ? classesService : regionsService
      const all = await catalog.list(selectedLeague!.league.id)
      const options = keys.map((k) => ({
        id: k,
        label: all.find((c) => c.id.toLowerCase() === k.toLowerCase())?.name ?? k,
      }))
      setForecastGroupOptions(options)
      setForecastGroupKey(options[0]?.id ?? null)
    }
    loadGroups()
  }, [context, forecastScope, selectedLeague])

  // Championship forecast computation for the selected scope.
  useEffect(() => {
    if (!context || !selectedLeague) return
    async function loadForecast() {
      try {
        const [standingsResult, history] = await Promise.all([
          getLatestStandings(context!.season.id, forecastScope, forecastGroupKey),
          getSeasonDriverHistory(context!.season.id),
        ])
        const rows = standingsResult?.rows.filter((r) => r.driver_id) ?? []
        if (rows.length === 0) {
          setForecast(null)
          return
        }
        const driverIds = rows.map((r) => r.driver_id as string)
        const drivers = await getDrivers(selectedLeague!.league.id, false)
        const standingsInput = rows.map((r) => ({
          driverId: r.driver_id as string,
          displayName: drivers.find((d) => d.id === r.driver_id)?.display_name ?? 'Driver',
          points: r.points,
          position: r.position,
        }))
        const leagueAvgPace = leagueAveragePacePerRound(history)
        const paceByDriver = new Map(driverIds.map((id) => [id, computePace(history, id, leagueAvgPace)]))
        setForecast(
          buildChampionshipForecast(standingsInput, paceByDriver, completedRaces, totalRounds, MAX_POINTS_PER_ROUND),
        )
      } catch {
        setForecast(null)
      }
    }
    loadForecast()
  }, [context, selectedLeague, forecastScope, forecastGroupKey, completedRaces, totalRounds])

  async function handleSave() {
    if (!context || !selectedLeague || !markets) return
    setSaveMessage(null)
    try {
      await savePredictionRun({
        leagueId: selectedLeague.league.id,
        championshipId: context.championship.id,
        seasonId: context.season.id,
        eventId,
        category: 'race_forecast',
        modelVersion: 'vrc-ops-web-v1',
        sourceSignature: `${context.season.id}:${completedRaces}`,
        sourceDataCutoff: new Date().toISOString(),
        officialRaceCount: completedRaces,
        inputSummary: `Computed from ${completedRaces} completed race(s).`,
        payload: markets,
      })
      setSaveMessage('Forecast saved for this league.')
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : 'Could not save forecast.')
    }
  }

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (context === undefined) return <LoadingState />
  if (context === null) {
    return <EmptyState title="No active season" description="Predictions need an active season with race history." />
  }
  if (markets === null) return <LoadingState />

  const tier = confidenceTier(confidence)
  const tone = tier === 'high' ? 'success' : tier === 'medium' ? 'warning' : 'neutral'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Predictions</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {context.championship.name} · {context.season.name}
          </p>
        </div>
        <Badge tone={tone}>{tier} confidence</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MarketCard title="Race winner" rows={markets.raceWin} />
        <MarketCard title="Podium" rows={markets.podium} />
        <MarketCard title="Pole position" rows={markets.pole} />
        <MarketCard title="Fastest lap" rows={markets.fastestLap} />
        <MarketCard
          title="Incident risk"
          rows={markets.incidentRisk}
          note="Performance Shaping Factor read on human-error exposure — track unfamiliarity, a recent racecraft-losses trend, and DNF rate. Each driver's own figure, not a share-of-field probability like the markets above."
        />
      </div>

      {permissions.canOperateRaceControl && (
        <div>
          <Button onClick={handleSave}>Save forecast for this league</Button>
          {saveMessage && <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>{saveMessage}</p>}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Championship forecast</h2>
          <div className="flex flex-wrap gap-1 rounded-lg border p-1" style={{ borderColor: 'var(--color-border)' }}>
            {(['overall', 'class', 'regional'] as StandingsType[]).map((t) => (
              <button
                key={t}
                onClick={() => setForecastScope(t)}
                className="rounded-md px-3 py-1 text-xs font-medium capitalize"
                style={{
                  backgroundColor: forecastScope === t ? 'var(--color-accent)' : 'transparent',
                  color: forecastScope === t ? 'var(--color-accent-contrast)' : 'var(--color-text)',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {forecastGroupOptions.length > 0 && (
          <select
            value={forecastGroupKey ?? ''}
            onChange={(e) => setForecastGroupKey(e.target.value)}
            className="rounded-lg border px-3 py-1.5 text-sm"
            style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
          >
            {forecastGroupOptions.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        )}

        <Card>
          {!forecast ? (
            <EmptyState
              title="Not enough official races yet"
              description="The championship forecast needs at least 2 completed races with saved standings."
            />
          ) : (
            <>
              <p className="mb-4 text-sm">{forecast.narrative}</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr style={{ color: 'var(--color-text-muted)' }}>
                      <th className="pb-2 pr-4">#</th>
                      <th className="pb-2 pr-4">Driver</th>
                      <th className="pb-2 pr-4">Points</th>
                      <th className="pb-2 pr-4">Projected</th>
                      <th className="pb-2 pr-4">Gap</th>
                      <th className="pb-2 pr-4"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                    {forecast.contenders.map((c) => (
                      <tr key={c.driverId}>
                        <td className="py-2 pr-4">{c.currentPosition}</td>
                        <td className="py-2 pr-4 font-medium">
                          <Link to={`/drivers/${c.driverId}`} className="hover:underline">
                            {c.displayName}
                          </Link>
                        </td>
                        <td className="py-2 pr-4">{c.currentPoints}</td>
                        <td className="py-2 pr-4">{c.projectedPoints}</td>
                        <td className="py-2 pr-4">{c.gapToLeader === 0 ? '—' : c.gapToLeader}</td>
                        <td className="py-2 pr-4">
                          {c.clinched && <Badge tone="success">Clinched</Badge>}
                          {c.eliminated && <Badge tone="danger">Eliminated</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}

function MarketCard({ title, rows, note }: { title: string; rows: MarketRow[]; note?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      {rows.length === 0 ? (
        <EmptyState title="Not enough data yet" />
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.map((row) => (
            <li key={row.driverId} className="flex items-center justify-between">
              <span>{row.displayName}</span>
              <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                {formatPercent(row.probability)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {note}
        </p>
      )}
    </Card>
  )
}
