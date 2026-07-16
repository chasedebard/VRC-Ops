import { useQuery } from '@tanstack/react-query'
import { registerTile } from '../registry'
import { dashboardKeys } from '../queryKeys'
import { useDashboardBaseData } from '@/hooks/useDashboardBaseData'
import { getLatestStandings, getPreviousStandingsRows } from '@/services/standings'
import { teamsService } from '@/services/catalog'
import { StandingsMovementIndicator } from '@/components/StandingsMovementIndicator'
import { LoadingState, EmptyState } from '@/components/States'
import { toSafeErrorMessage } from '@/utils/errors'
import { BuildingIcon } from '../icons'
import type { TileComponentProps } from '../types'

export function TeamStandingsTile(_props: TileComponentProps) {
  const { leagueId, active, loading } = useDashboardBaseData()
  const seasonId = active?.season.id ?? null
  const query = useQuery({
    queryKey: dashboardKeys.latestStandings(seasonId ?? 'none', 'team', null),
    queryFn: () => getLatestStandings(seasonId!, 'team'),
    enabled: Boolean(seasonId),
  })
  const previousQuery = useQuery({
    queryKey: dashboardKeys.previousStandings(seasonId ?? 'none', 'team', null),
    queryFn: () => getPreviousStandingsRows(seasonId!, 'team'),
    enabled: Boolean(seasonId),
  })
  const teamsQuery = useQuery({ queryKey: dashboardKeys.teams(leagueId), queryFn: () => teamsService.list(leagueId) })

  if (loading || query.isLoading) return <LoadingState />
  if (!active) return <EmptyState title="No active season" />
  if (query.error) {
    return <EmptyState title="Could not load team standings" description={toSafeErrorMessage(query.error, 'Try again later.')} />
  }
  const rows = query.data?.rows ?? []
  if (rows.length === 0) return <EmptyState title="No team standings yet" description="Enable teams for this championship to see them here." />

  const previousPositionByTeam = new Map(
    (previousQuery.data ?? []).filter((r) => r.team_id).map((r) => [r.team_id as string, r.position]),
  )

  return (
    <table className="w-full text-left text-sm">
      <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {rows.map((row) => {
          const team = row.team_id ? teamsQuery.data?.find((t) => t.id === row.team_id) : undefined
          const movement = row.team_id ? (previousPositionByTeam.get(row.team_id) ?? row.position) - row.position : 0
          return (
            <tr key={row.id}>
              <td className="py-1.5 pr-2 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                {row.position}
              </td>
              <td className="py-1.5 pr-2 font-medium">
                <span className="inline-flex items-center gap-2">
                  {team?.name ?? 'Team'}
                  <StandingsMovementIndicator movement={movement} />
                </span>
              </td>
              <td className="py-1.5 text-right font-mono">{row.points}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

registerTile({
  type: 'team_standings',
  displayName: 'Constructor / Team Standings',
  description: 'Team position, points, and movement.',
  icon: BuildingIcon,
  category: 'standings',
  supportedSizes: ['medium', 'wide'],
  defaultSize: 'medium',
  minSize: 'medium',
  maxSize: 'wide',
  allowMultipleInstances: false,
  requiresPro: false,
  defaultSettings: {},
  Component: TeamStandingsTile,
})
