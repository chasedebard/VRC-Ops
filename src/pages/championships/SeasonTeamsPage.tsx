import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { getSeason } from '@/services/championships'
import { getSeasonRoster, updateSeasonDriver } from '@/services/drivers'
import {
  archiveSeasonTeam,
  createSeasonTeam,
  getSeasonTeams,
  subscribeToSeasonTeams,
  updateSeasonTeam,
} from '@/services/seasonTeams'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { Field } from '@/components/Field'
import { DriverAvatar } from '@/components/DriverAvatar'
import { EmptyState, ErrorState, LoadingState } from '@/components/States'
import type { DriverRow, SeasonDriverRow, SeasonRow, TeamRow } from '@/types/database'

export default function SeasonTeamsPage() {
  const { id } = useParams<{ id: string }>()
  const { selectedLeague, permissions } = useLeagueSession()
  const [season, setSeason] = useState<SeasonRow | null>(null)
  const [teams, setTeams] = useState<TeamRow[] | null>(null)
  const [roster, setRoster] = useState<(SeasonDriverRow & { drivers: DriverRow })[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState('')

  async function load() {
    if (!id) return
    setError(null)
    try {
      const s = await getSeason(id)
      setSeason(s)
      const [t, r] = await Promise.all([getSeasonTeams(id), getSeasonRoster(id)])
      setTeams(t)
      setRoster(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load teams.')
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (!id) return
    return subscribeToSeasonTeams(id, () => load())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault()
    if (!season || !selectedLeague || !name.trim()) return
    setBusy(true)
    setError(null)
    try {
      await createSeasonTeam({
        league_id: selectedLeague.league.id,
        season_id: season.id,
        championship_id: season.championship_id,
        name: name.trim(),
        color: color.trim() || null,
      })
      setName('')
      setColor('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create team.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRenameTeam(team: TeamRow, nextName: string) {
    if (!nextName.trim() || nextName === team.name) return
    setBusy(true)
    setError(null)
    try {
      await updateSeasonTeam(team.id, { name: nextName.trim() })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename team.')
    } finally {
      setBusy(false)
    }
  }

  async function handleArchiveTeam(team: TeamRow) {
    if (!confirm(`Archive ${team.name}? Drivers on this team will need to be reassigned.`)) return
    setBusy(true)
    setError(null)
    try {
      await archiveSeasonTeam(team.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive team.')
    } finally {
      setBusy(false)
    }
  }

  async function handleAssignDriver(seasonDriverId: string, teamId: string) {
    setBusy(true)
    setError(null)
    try {
      // Reassigning a team only moves which team total a driver's already-computed points count
      // toward — it never touches the driver's own scoring_outputs/driver_history.
      await updateSeasonDriver(seasonDriverId, { team_id: teamId || null })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update team assignment.')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <ErrorState message={error} onRetry={load} />
  if (season === null || teams === null) return <LoadingState />

  const canManage = permissions.canManageMembers

  if (!season.teams_enabled) {
    return (
      <EmptyState
        title="Teams aren't enabled for this season"
        description="Enable teams in Season Settings first."
        action={
          <Link to={`/seasons/${season.id}`} className="text-sm underline" style={{ color: 'var(--color-accent)' }}>
            Go to season settings
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Teams</h1>
        <Link to={`/seasons/${season.id}`} className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
          {season.name} {season.year ? `(${season.year})` : ''}
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Season teams</CardTitle>
        </CardHeader>

        {canManage && (
          <form onSubmit={handleCreateTeam} className="mb-4 grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
            <Field label="Color (optional)" placeholder="#3366FF" value={color} onChange={(e) => setColor(e.target.value)} />
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Creating…' : 'Add team'}
            </Button>
          </form>
        )}

        {teams.length === 0 ? (
          <EmptyState
            title="No teams configured for this season."
            description={canManage ? 'Add a team above to get started.' : undefined}
          />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {teams.map((team) => (
              <li key={team.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: team.color ?? 'var(--color-border)' }}
                  />
                  {canManage ? (
                    <input
                      defaultValue={team.name}
                      onBlur={(e) => handleRenameTeam(team, e.target.value)}
                      className="rounded-md border px-2 py-1 text-sm font-medium"
                      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                    />
                  ) : (
                    <span className="font-medium">{team.name}</span>
                  )}
                </div>
                {canManage && (
                  <Button variant="secondary" onClick={() => handleArchiveTeam(team)} disabled={busy}>
                    Archive
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Driver assignments</CardTitle>
        </CardHeader>
        {roster.length === 0 ? (
          <EmptyState title="No drivers on this season's roster yet" />
        ) : (
          <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
            {roster.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <DriverAvatar driver={entry.drivers} size="sm" />
                  {entry.drivers.display_name}
                </span>
                {canManage ? (
                  <select
                    value={entry.team_id ?? ''}
                    disabled={busy}
                    onChange={(e) => handleAssignDriver(entry.id, e.target.value)}
                    className="rounded-lg border px-2 py-1 text-sm"
                    style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                  >
                    <option value="">Unassigned</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    {teams.find((t) => t.id === entry.team_id)?.name ?? 'Unassigned'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
