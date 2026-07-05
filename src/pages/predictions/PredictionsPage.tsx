import { useEffect, useState } from 'react'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { resolveActiveSeason } from '@/utils/activeSeason'
import { getSeasonEvents, resolveUpcomingEvent } from '@/services/events'
import { getSeasonDriverHistory } from '@/services/driverProfile'
import { getDrivers } from '@/services/drivers'
import { savePredictionRun } from '@/services/predictions'
import {
  buildFactorInputs,
  confidenceTier,
  fastestLapScore,
  formatPercent,
  normalizeToProbabilities,
  podiumScore,
  poleScore,
  predictionConfidence,
  raceWinnerScore,
} from '@/utils/predictions'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { ChampionshipRow, SeasonRow } from '@/types/database'

interface MarketRow {
  driverId: string
  displayName: string
  probability: number
}

export default function PredictionsPage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const [context, setContext] = useState<{ championship: ChampionshipRow; season: SeasonRow } | null | undefined>(
    undefined,
  )
  const [markets, setMarkets] = useState<Record<'raceWin' | 'podium' | 'pole' | 'fastestLap', MarketRow[]> | null>(
    null,
  )
  const [confidence, setConfidence] = useState(0)
  const [completedRaces, setCompletedRaces] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)

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

      const driverIds = Array.from(new Set(history.map((h) => h.driver_id)))
      const factorInputs = driverIds.map((id) => {
        const driver = drivers.find((d) => d.id === id)
        return buildFactorInputs(id, driver?.display_name ?? 'Driver', history, upcoming?.track_id ?? null)
      })

      const completed = new Set(history.filter((h) => h.result_kind === 'race').map((h) => h.event_id)).size
      setCompletedRaces(completed)
      setConfidence(predictionConfidence(completed, events.length))

      function toMarket(scoreFn: (f: (typeof factorInputs)[number]) => number): MarketRow[] {
        const scored = factorInputs.map((f) => ({ driverId: f.driverId, score: scoreFn(f) }))
        const probs = normalizeToProbabilities(scored)
        return probs
          .map((p) => ({
            driverId: p.driverId,
            displayName: factorInputs.find((f) => f.driverId === p.driverId)?.displayName ?? 'Driver',
            probability: p.probability,
          }))
          .sort((a, b) => b.probability - a.probability)
          .slice(0, 5)
      }

      setMarkets({
        raceWin: toMarket(raceWinnerScore),
        podium: toMarket(podiumScore),
        pole: toMarket(poleScore),
        fastestLap: toMarket(fastestLapScore),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not build predictions.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.league.id])

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Predictions</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            {context.championship.name} · {context.season.name}
          </p>
        </div>
        <Badge tone={tone}>{tier} confidence</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <MarketCard title="Race winner" rows={markets.raceWin} />
        <MarketCard title="Podium" rows={markets.podium} />
        <MarketCard title="Pole position" rows={markets.pole} />
        <MarketCard title="Fastest lap" rows={markets.fastestLap} />
      </div>

      {permissions.canOperateRaceControl && (
        <div>
          <Button onClick={handleSave}>Save forecast for this league</Button>
          {saveMessage && <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>{saveMessage}</p>}
        </div>
      )}
    </div>
  )
}

function MarketCard({ title, rows }: { title: string; rows: MarketRow[] }) {
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
    </Card>
  )
}
