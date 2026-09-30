import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getChampionships } from '@/services/championships'
import { ChampionshipSetupFlow } from '@/components/ChampionshipSetupFlow'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import { GAME_LABEL } from '@/config/featureRegistry'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { ChampionshipRow } from '@/types/database'

const STATUS_TONE: Record<string, 'neutral' | 'success' | 'warning'> = {
  draft: 'neutral',
  active: 'success',
  paused: 'warning',
  completed: 'neutral',
  archived: 'neutral',
}

export default function ChampionshipsPage() {
  const { selectedLeague, permissions } = useLeagueSession()
  const navigate = useNavigate()
  const [championships, setChampionships] = useState<ChampionshipRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    if (!selectedLeague) return
    setError(null)
    try {
      setChampionships(await getChampionships(selectedLeague.league.id))
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not load championships.'))
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.league.id])

  if (!selectedLeague) return <EmptyState title="No league selected" />
  if (error) return <ErrorState message={error} onRetry={load} />
  if (championships === null) return <LoadingState />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Championships</h1>
        {permissions.canManageSetup && !showCreate && (
          <Button onClick={() => setShowCreate(true)}>New championship</Button>
        )}
      </div>

      {showCreate && (
        <ChampionshipSetupFlow
          leagueId={selectedLeague.league.id}
          onCancel={() => setShowCreate(false)}
          onCreated={({ seasonId }) => {
            setShowCreate(false)
            navigate(`/seasons/${seasonId}`)
          }}
        />
      )}

      {championships.length === 0 ? (
        <EmptyState
          title="No championships yet"
          description={
            permissions.canManageSetup
              ? 'Create a championship to start structuring seasons and races.'
              : 'An Owner or Admin creates championships for this league. Published results appear here once they exist.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {championships.map((c) => (
            <Link key={c.id} to={`/championships/${c.id}`}>
              <Card className="h-full transition hover:shadow-md">
                <CardHeader>
                  <CardTitle>{c.name}</CardTitle>
                  <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                </CardHeader>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {c.series_name || GAME_LABEL[c.game_id]}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
