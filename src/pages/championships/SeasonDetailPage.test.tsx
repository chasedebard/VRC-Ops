import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BonusPointsControl } from './SeasonDetailPage'
import { bonusFormFromSeason } from './seasonBonusForm'
import type { SeasonRow } from '@/types/database'

function season(overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    id: 's1',
    championship_id: 'c1',
    league_id: 'l1',
    name: 'Season',
    year: 2026,
    start_date: null,
    end_date: null,
    status: 'active',
    is_active: true,
    notes: null,
    scoring_config: null,
    drop_rounds: 0,
    tiebreak_config: null,
    teams_enabled: false,
    pole_bonus_enabled: false,
    pole_bonus_points: 1,
    fastest_lap_bonus_enabled: false,
    fastest_lap_bonus_points: 1,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('bonusFormFromSeason', () => {
  it('carries the season\'s saved enabled flags and point values', () => {
    const form = bonusFormFromSeason(
      season({ pole_bonus_enabled: true, pole_bonus_points: 2, fastest_lap_bonus_enabled: true, fastest_lap_bonus_points: 3 }),
    )
    expect(form).toEqual({
      poleBonusEnabled: true,
      poleBonusPoints: 2,
      fastestLapBonusEnabled: true,
      fastestLapBonusPoints: 3,
    })
  })

  it('defaults to 1 when there is no valid saved point value (e.g. 0 from an old cache)', () => {
    const form = bonusFormFromSeason(season({ pole_bonus_points: 0 as unknown as number }))
    expect(form.poleBonusPoints).toBe(1)
  })
})

describe('BonusPointsControl', () => {
  it('hides the point selector while disabled', () => {
    render(
      <BonusPointsControl label="Pole bonus" enabled={false} points={1} disabled={false} onToggle={vi.fn()} onPointsChange={vi.fn()} />,
    )
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
  })

  it('shows the 1/2/3 selector while enabled, with the current value marked selected', () => {
    render(
      <BonusPointsControl label="Pole bonus" enabled points={2} disabled={false} onToggle={vi.fn()} onPointsChange={vi.fn()} />,
    )
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(3)
    expect(screen.getByRole('radio', { name: '+2' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: '+1' })).toHaveAttribute('aria-checked', 'false')
  })

  it('calls onToggle when the checkbox is clicked', async () => {
    const onToggle = vi.fn()
    render(
      <BonusPointsControl label="Pole bonus" enabled={false} points={1} disabled={false} onToggle={onToggle} onPointsChange={vi.fn()} />,
    )
    await userEvent.click(screen.getByRole('checkbox'))
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  it('calls onPointsChange with the clicked value', async () => {
    const onPointsChange = vi.fn()
    render(
      <BonusPointsControl label="Pole bonus" enabled points={1} disabled={false} onToggle={vi.fn()} onPointsChange={onPointsChange} />,
    )
    await userEvent.click(screen.getByRole('radio', { name: '+3' }))
    expect(onPointsChange).toHaveBeenCalledWith(3)
  })

  it('disables every control while busy (prevents double-submit races)', () => {
    render(
      <BonusPointsControl label="Pole bonus" enabled points={1} disabled onToggle={vi.fn()} onPointsChange={vi.fn()} />,
    )
    expect(screen.getByRole('checkbox')).toBeDisabled()
    for (const radio of screen.getAllByRole('radio')) expect(radio).toBeDisabled()
  })
})
