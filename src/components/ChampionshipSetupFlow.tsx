import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Field } from '@/components/Field'
import { Badge } from '@/components/Badge'
import { LoadingState } from '@/components/States'
import { classesService, regionsService } from '@/services/catalog'
import {
  createChampionshipWithSeason,
  gt7SelectedGroupPickerItems,
  listLeagueClasses,
  listLeagueRegions,
  type LeagueClass,
  type LeagueRegion,
} from '@/services/setup'
import { GAME_IDS, GAME_LABEL, allowsGameSelection, gameAvailability } from '@/config/featureRegistry'
import { seasonCreationIssues } from '@/utils/seasonValidation'
import type { GameId } from '@/types/database'

type Step = 'championship' | 'season' | 'structure' | 'review'
const STEPS: { key: Step; title: string }[] = [
  { key: 'championship', title: 'Championship' },
  { key: 'season', title: 'Season' },
  { key: 'structure', title: 'Structure' },
  { key: 'review', title: 'Review' },
]

export interface SetupResult {
  championshipId: string
  seasonId: string
}

/**
 * Guided championship → first-season setup. Mirrors iOS `VRCChampionshipSetupFlow`: one stepped flow
 * (Championship → Season → Competition structure → Review) that creates both rows transactionally through
 * `vrc_create_championship_season`, so a partial failure never leaves an orphaned championship or season.
 * Games whose integration isn't live yet are listed as "Coming soon" and cannot be chosen.
 */
export function ChampionshipSetupFlow({
  leagueId,
  onCreated,
  onCancel,
}: {
  leagueId: string
  onCreated: (result: SetupResult) => void
  onCancel?: () => void
}) {
  const [step, setStep] = useState<Step>('championship')

  const [champName, setChampName] = useState('')
  const [seriesName, setSeriesName] = useState('')
  const [description, setDescription] = useState('')
  const [game, setGame] = useState<GameId>('gran_turismo_7')

  const [seasonName, setSeasonName] = useState('')
  const [yearText, setYearText] = useState(String(new Date().getFullYear()))
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [notes, setNotes] = useState('')

  const [usesClasses, setUsesClasses] = useState(false)
  const [usesRegions, setUsesRegions] = useState(false)
  const [classes, setClasses] = useState<LeagueClass[] | null>(null)
  const [regions, setRegions] = useState<LeagueRegion[] | null>(null)
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set())
  const [selectedRegionIds, setSelectedRegionIds] = useState<Set<string>>(new Set())
  const [newClassName, setNewClassName] = useState('')
  const [newRegionName, setNewRegionName] = useState('')

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadStructure() {
    try {
      const [c, r] = await Promise.all([listLeagueClasses(leagueId), listLeagueRegions(leagueId)])
      setClasses(c)
      setRegions(r.filter((x) => x.is_active))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load classes and regions.')
    }
  }

  useEffect(() => {
    void loadStructure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId])

  const classItems = useMemo(() => {
    if (!classes) return []
    return game === 'gran_turismo_7'
      ? gt7SelectedGroupPickerItems(classes)
      : classes.filter((c) => c.is_active).map((c) => ({ id: c.id, label: c.name }))
  }, [classes, game])

  const seasonIssues = seasonCreationIssues({
    name: seasonName,
    yearText,
    startDate: startDate || null,
    endDate: endDate || null,
  })

  function canAdvance(): boolean {
    switch (step) {
      case 'championship':
        return champName.trim().length > 0 && allowsGameSelection(game)
      case 'season':
        return seasonName.trim().length > 0 && seasonIssues.length === 0
      case 'structure':
        if (usesClasses && selectedClassIds.size === 0) return false
        if (usesRegions && selectedRegionIds.size === 0) return false
        return true
      default:
        return true
    }
  }

  function toggle(set: Set<string>, id: string, update: (next: Set<string>) => void) {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update(next)
  }

  async function addClass() {
    const name = newClassName.trim()
    if (!name) return
    setError(null)
    try {
      const created = await classesService.create({ league_id: leagueId, name })
      setNewClassName('')
      await loadStructure()
      setSelectedClassIds((prev) => new Set(prev).add(created.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the class.')
    }
  }

  async function addRegion() {
    const name = newRegionName.trim()
    if (!name) return
    setError(null)
    try {
      const created = await regionsService.create({ league_id: leagueId, name })
      setNewRegionName('')
      await loadStructure()
      setSelectedRegionIds((prev) => new Set(prev).add(created.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the region.')
    }
  }

  async function handleCreate() {
    setBusy(true)
    setError(null)
    try {
      const yearTrimmed = yearText.trim()
      const result = await createChampionshipWithSeason({
        leagueId,
        championshipName: champName.trim(),
        seriesName: seriesName.trim() || null,
        description: description.trim() || null,
        game,
        usesClasses,
        usesRegions,
        seasonName: seasonName.trim(),
        year: yearTrimmed ? Number(yearTrimmed) : null,
        startDate: startDate || null,
        endDate: endDate || null,
        notes: notes.trim() || null,
        classIds: usesClasses ? Array.from(selectedClassIds) : [],
        regionIds: usesRegions ? Array.from(selectedRegionIds) : [],
      })
      onCreated(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the championship.')
    } finally {
      setBusy(false)
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step)
  const nameOf = (items: { id: string; label: string }[], ids: Set<string>) => {
    const names = items.filter((i) => ids.has(i.id)).map((i) => i.label)
    return names.length ? names.join(', ') : 'None selected'
  }
  const regionItems = (regions ?? []).map((r) => ({ id: r.id, label: r.name }))

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <ol className="flex gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s.key} className="flex-1" aria-current={s.key === step ? 'step' : undefined}>
            <div
              className="mb-1 h-1 rounded-full"
              style={{ backgroundColor: i <= stepIndex ? 'var(--color-accent)' : 'var(--color-border)' }}
            />
            <span
              className="text-xs"
              style={{ color: i <= stepIndex ? 'var(--color-text)' : 'var(--color-text-muted)' }}
            >
              {s.title}
            </span>
          </li>
        ))}
      </ol>

      {step === 'championship' && (
        <Card>
          <h2 className="text-base font-semibold">Championship</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Championship-wide settings. You&apos;ll add the first season next.
          </p>
          <div className="space-y-3">
            <Field label="Name" required placeholder="e.g. RFS GT Championship" value={champName} onChange={(e) => setChampName(e.target.value)} />
            <Field label="Series name" placeholder="Optional" value={seriesName} onChange={(e) => setSeriesName(e.target.value)} />
            <Field label="Description" placeholder="Optional" value={description} onChange={(e) => setDescription(e.target.value)} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Game</span>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)' }}
                value={game}
                onChange={(e) => {
                  const next = e.target.value as GameId
                  if (allowsGameSelection(next)) setGame(next)
                }}
              >
                {GAME_IDS.map((g) => (
                  <option key={g} value={g} disabled={!allowsGameSelection(g)}>
                    {GAME_LABEL[g]}
                    {gameAvailability(g) === 'comingSoon' ? ' — Coming soon' : ''}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              A championship belongs to one game. Tracks, results, and integrations never mix across games.
            </p>
          </div>
        </Card>
      )}

      {step === 'season' && (
        <Card>
          <h2 className="text-base font-semibold">First season</h2>
          <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Every championship runs in seasons. Create the first one now.
          </p>
          <div className="space-y-3">
            <Field label="Season name" required placeholder="e.g. 2026 Season" value={seasonName} onChange={(e) => setSeasonName(e.target.value)} />
            <Field label="Year" inputMode="numeric" placeholder="2026" value={yearText} onChange={(e) => setYearText(e.target.value)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              <Field label="End date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <Field label="Notes" placeholder="Optional" value={notes} onChange={(e) => setNotes(e.target.value)} />
            {seasonIssues.map((issue) => (
              <p key={issue} role="alert" className="text-xs" style={{ color: 'var(--color-warning)' }}>
                {issue}
              </p>
            ))}
          </div>
        </Card>
      )}

      {step === 'structure' && (
        <div className="space-y-4">
          <Card>
            <h2 className="text-base font-semibold">Competition structure</h2>
            <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Does this season use regions, classes, both, or neither?
            </p>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={usesClasses} onChange={(e) => setUsesClasses(e.target.checked)} /> Use classes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={usesRegions} onChange={(e) => setUsesRegions(e.target.checked)} /> Use regions
            </label>
            <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Class and regional subseries standings are a Pro / League Plus feature. Setting classes and regions up is free.
            </p>
          </Card>

          {usesClasses && (
            <Card>
              <h3 className="text-base font-semibold">Select classes</h3>
              <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {selectedClassIds.size} selected
              </p>
              {classes === null ? (
                <LoadingState />
              ) : classItems.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  {game === 'gran_turismo_7'
                    ? 'This GT7 league has no groups yet. Choose your GT7 groups under Championship ▸ Classes after setup, then add them to the season.'
                    : 'No classes yet. Create the first one below.'}
                </p>
              ) : (
                <ul className="space-y-1">
                  {classItems.map((item) => (
                    <li key={item.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedClassIds.has(item.id)}
                          onChange={() => toggle(selectedClassIds, item.id, setSelectedClassIds)}
                        />
                        {item.label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              {game !== 'gran_turismo_7' && (
                <div className="mt-3 flex items-end gap-2">
                  <div className="flex-1">
                    <Field label="New class" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} />
                  </div>
                  <Button type="button" variant="secondary" onClick={addClass} disabled={!newClassName.trim()}>
                    Create
                  </Button>
                </div>
              )}
            </Card>
          )}

          {usesRegions && (
            <Card>
              <h3 className="text-base font-semibold">Select regions</h3>
              <p className="mb-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {selectedRegionIds.size} selected
              </p>
              {regions === null ? (
                <LoadingState />
              ) : regionItems.length === 0 ? (
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                  No regions yet. Create the first one below.
                </p>
              ) : (
                <ul className="space-y-1">
                  {regionItems.map((item) => (
                    <li key={item.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedRegionIds.has(item.id)}
                          onChange={() => toggle(selectedRegionIds, item.id, setSelectedRegionIds)}
                        />
                        {item.label}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex items-end gap-2">
                <div className="flex-1">
                  <Field label="New region" value={newRegionName} onChange={(e) => setNewRegionName(e.target.value)} />
                </div>
                <Button type="button" variant="secondary" onClick={addRegion} disabled={!newRegionName.trim()}>
                  Create
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {step === 'review' && (
        <Card>
          <h2 className="mb-3 text-base font-semibold">Review &amp; create</h2>
          <dl className="space-y-2 text-sm">
            {[
              ['Championship', champName.trim()],
              ...(seriesName.trim() ? [['Series', seriesName.trim()]] : []),
              ['Game', GAME_LABEL[game]],
              ['Season', seasonName.trim()],
              ['Year', yearText.trim() || '—'],
              ...(startDate ? [['Starts', startDate]] : []),
              ...(endDate ? [['Ends', endDate]] : []),
              ['Classes', usesClasses ? nameOf(classItems, selectedClassIds) : 'Not used'],
              ['Regions', usesRegions ? nameOf(regionItems, selectedRegionIds) : 'Not used'],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-3">
                <dt className="w-28 shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                  {label}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          {step !== 'championship' && (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep(STEPS[stepIndex - 1].key)}>
              Back
            </Button>
          )}
          {step === 'review' ? (
            <Button type="button" onClick={handleCreate} disabled={busy}>
              {busy ? 'Creating…' : 'Create championship'}
            </Button>
          ) : (
            <Button type="button" disabled={!canAdvance()} onClick={() => setStep(STEPS[stepIndex + 1].key)}>
              Next
            </Button>
          )}
        </div>
      </div>
      {!allowsGameSelection(game) && <Badge tone="warning">{GAME_LABEL[game]} is coming soon.</Badge>}
    </div>
  )
}
