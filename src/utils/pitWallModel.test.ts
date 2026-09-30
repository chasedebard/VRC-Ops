import { describe, expect, it } from 'vitest'
import {
  formatSetupValue,
  humanizeKey,
  parseEngineeringState,
  parseProgrammes,
  parseSetupBoard,
  pitWallErrorMessage,
  statusLabel,
  PROGRAMME_STATUS_LABEL,
} from './pitWallModel'

describe('pit wall read model', () => {
  it('parses programmes and drops rows without an id', () => {
    const parsed = parseProgrammes({
      active_car_programme_id: 'p1',
      programmes: [
        { id: 'p1', car_name: 'Porsche 911 RSR', competing_class_name: 'GT3', lifecycle_status: 'active', is_active: true, has_baseline: true, session_count: 3, active_session: { kind: 'race', display_name: 'Race' } },
        { car_name: 'orphan' },
      ],
    })
    expect(parsed.activeProgrammeId).toBe('p1')
    expect(parsed.programmes).toHaveLength(1)
    expect(parsed.programmes[0]).toMatchObject({ carName: 'Porsche 911 RSR', hasBaseline: true, sessionCount: 3, activeSession: { kind: 'race', displayName: 'Race' } })
  })

  it('degrades to empty state on an unexpected shape instead of inventing values', () => {
    expect(parseProgrammes(null).programmes).toEqual([])
    expect(parseProgrammes('nope').activeProgrammeId).toBeNull()
    const board = parseSetupBoard(undefined)
    expect(board).toEqual({ baseline: null, current: null, activePackage: null })
    const eng = parseEngineeringState({ engineering_call: { status: 'x' } })
    expect(eng.call).toBeNull()
    expect(eng.questions).toEqual([])
  })

  it('keeps numeric setup values as the server strings and never turns a missing reading into 0', () => {
    const board = parseSetupBoard({
      baseline_snapshot: {
        id: 's1',
        snapshot_type: 'baseline',
        lifecycle_status: 'confirmed',
        revision: 2,
        values: [
          { parameter_key: 'front_anti_roll_bar', numeric_value: '4', unit: 'level', availability_status: 'available' },
          { parameter_key: 'rear_downforce', numeric_value: null, availability_status: 'unavailable' },
        ],
      },
    })
    const values = board.baseline?.values ?? []
    expect(values[0]).toMatchObject({ parameterKey: 'front_anti_roll_bar', value: '4', unit: 'level' })
    expect(values[1].value).toBeNull()
    expect(formatSetupValue(values[0].value, values[0].unit)).toBe('4 level')
    expect(formatSetupValue(values[1].value, values[1].unit)).toBe('Not available')
  })

  it('parses an engineering call with evidence and open questions', () => {
    const eng = parseEngineeringState({
      pace: { engineering_pace: 'race_pace', source: 'driver_confirmed' },
      engineering_call: {
        id: 'c1',
        status: 'issued',
        next_action_type: 'test_package',
        confidence: 'medium',
        changes: [{ parameter_key: 'rear_ride_height', current_value: '80', target_value: '82', parameter_reason: 'rotation' }],
        supporting_evidence: [{ source_label: 'Run 3', provenance: 'game_capture', comparability_state: 'comparable' }],
        contradicting_evidence: [],
      },
      unresolved_questions: [{ id: 'q1', question: 'Does entry understeer persist on softs?', required_evidence: 'Soft-tyre run' }],
    })
    expect(eng.pace?.value).toBe('race_pace')
    expect(eng.call?.changes[0]).toMatchObject({ parameterKey: 'rear_ride_height', currentValue: '80', targetValue: '82' })
    expect(eng.call?.supportingEvidence[0].label).toBe('Run 3')
    expect(eng.questions).toHaveLength(1)
  })

  it('humanizes keys and falls back to verbatim status vocabulary', () => {
    expect(humanizeKey('front_anti_roll_bar')).toBe('Front Anti Roll Bar')
    expect(humanizeKey('frontCamber')).toBe('Front Camber')
    expect(statusLabel(PROGRAMME_STATUS_LABEL, 'needs_baseline')).toBe('Needs baseline')
    expect(statusLabel(PROGRAMME_STATUS_LABEL, 'some_new_status')).toBe('Some New Status')
  })

  it('translates Pit Wall RPC error codes to friendly copy', () => {
    expect(pitWallErrorMessage({ message: 'PIT_WALL_PRO_REQUIRED' })).toMatch(/Pro and League Plus/)
    expect(pitWallErrorMessage({ message: 'V3_WEEKEND_NOT_FOUND_OR_NOT_OWNED' })).toMatch(/No Pit Wall weekend/)
    expect(pitWallErrorMessage(new Error('boom'))).toMatch(/Could not load Pit Wall/)
  })
})
