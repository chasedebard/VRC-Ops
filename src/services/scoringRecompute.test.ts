import { describe, expect, it } from 'vitest'
import { buildRecomputeOutputs, type EventFinalizedResults } from './scoringRecompute'
import type { RaceResultRow, SeasonRow } from '@/types/database'

function season(overrides: Partial<SeasonRow> = {}): SeasonRow {
  return {
    id: 'season1',
    championship_id: 'champ1',
    league_id: 'league1',
    name: 'Season 1',
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

function raceRow(overrides: Partial<RaceResultRow> & Pick<RaceResultRow, 'driver_id'>): RaceResultRow {
  return {
    id: 'r',
    result_set_id: 'rs',
    league_id: 'league1',
    finish_position: 1,
    start_position: 1,
    laps_completed: 20,
    total_time_ms: null,
    gap_ms: null,
    best_lap_ms: null,
    fastest_lap: false,
    earned_pole: false,
    pole_manually_overridden: false,
    status: 'fin',
    bonus_points: 0,
    penalty_points: 0,
    team_id: null,
    class_id: null,
    region_id: null,
    notes: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('buildRecomputeOutputs', () => {
  it('is a pure full re-derivation: calling it twice with the same inputs never accumulates', () => {
    const s = season({ pole_bonus_enabled: true, pole_bonus_points: 2 })
    const eventResults: EventFinalizedResults[] = [
      {
        eventId: 'event1',
        raceRows: [raceRow({ driver_id: 'd1', finish_position: 1, earned_pole: true })],
      },
    ]
    const first = buildRecomputeOutputs(s, eventResults)
    const second = buildRecomputeOutputs(s, eventResults)
    expect(first).toEqual(second)
    expect(first[0].earned_points).toBe(first[0].total_points)
  })

  it('reflects the new bonus configuration, not a stale scored total', () => {
    const eventResults: EventFinalizedResults[] = [
      {
        eventId: 'event1',
        raceRows: [
          raceRow({ driver_id: 'd1', finish_position: 1, earned_pole: true, fastest_lap: true }),
        ],
      },
    ]
    const disabled = buildRecomputeOutputs(season(), eventResults)
    const enabled = buildRecomputeOutputs(
      season({
        pole_bonus_enabled: true,
        pole_bonus_points: 2,
        fastest_lap_bonus_enabled: true,
        fastest_lap_bonus_points: 3,
      }),
      eventResults,
    )
    expect(enabled[0].total_points - disabled[0].total_points).toBe(5)
  })

  it('produces one output per driver per event, zero for ineligible statuses', () => {
    const eventResults: EventFinalizedResults[] = [
      {
        eventId: 'event1',
        raceRows: [
          raceRow({ driver_id: 'd1', finish_position: 1, status: 'fin' }),
          raceRow({ driver_id: 'd2', finish_position: null, status: 'dns' }),
        ],
      },
    ]
    const outputs = buildRecomputeOutputs(season(), eventResults)
    expect(outputs).toHaveLength(2)
    expect(outputs.find((o) => o.driver_id === 'd2')?.total_points).toBe(0)
  })

  it('never re-derives pole/fastest-lap eligibility — trusts the persisted result row flags', () => {
    // A row with earned_pole=false must never earn the pole bonus even when pole bonus is on,
    // because eligibility lives on the raw, already-persisted race_results row.
    const s = season({ pole_bonus_enabled: true, pole_bonus_points: 2 })
    const eventResults: EventFinalizedResults[] = [
      { eventId: 'event1', raceRows: [raceRow({ driver_id: 'd1', finish_position: 2, earned_pole: false })] },
    ]
    const [output] = buildRecomputeOutputs(s, eventResults)
    expect(output.total_points).toBe(18)
  })
})
