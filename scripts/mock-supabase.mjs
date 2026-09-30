// Minimal in-memory Supabase stand-in (auth + PostgREST-lite + a few RPCs) used ONLY to drive the website locally.
// It holds synthetic demo data; it never talks to the real project and contains no secrets.
import http from 'node:http'
import { randomUUID } from 'node:crypto'

const PORT = Number(process.env.MOCK_PORT ?? 54321)
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const now = () => new Date().toISOString()
let pro = process.env.MOCK_PRO === '1'

const U = { me: 'u-me', ann: 'u-ann', bob: 'u-bob' }
const L = 'l-1', C = 'c-1', S = 's-1'
const db = {}
const add = (t, rows) => ((db[t] ??= []).push(...rows))

add('profiles', [
  { id: U.me, display_name: 'Dana Driver', first_name: 'Dana', last_name: 'Driver', avatar_url: null, avatar_storage_path: null, profile_completed: true, created_at: now(), updated_at: now() },
  { id: U.ann, display_name: 'Ann Admin', first_name: 'Ann', last_name: 'Admin', avatar_url: null, avatar_storage_path: null, profile_completed: true, created_at: now(), updated_at: now() },
  { id: U.bob, display_name: 'Bob Marshal', first_name: 'Bob', last_name: 'Marshal', avatar_url: null, avatar_storage_path: null, profile_completed: true, created_at: now(), updated_at: now() },
])
add('leagues', [{ id: L, name: 'Demo League', abbreviation: 'DEMO', owner_id: U.me, setup_state: 'complete', created_at: now(), updated_at: now() }])
add('memberships', [
  { id: 'm-me', league_id: L, user_id: U.me, status: 'active' },
  { id: 'm-ann', league_id: L, user_id: U.ann, status: 'active' },
  { id: 'm-bob', league_id: L, user_id: U.bob, status: 'active' },
])
add('membership_roles', [
  { id: 'r1', membership_id: 'm-me', role: 'owner' },
  { id: 'r2', membership_id: 'm-me', role: 'driver' },
  { id: 'r3', membership_id: 'm-ann', role: 'admin' },
  { id: 'r4', membership_id: 'm-bob', role: 'marshal' },
])
const legal = (id, doc_type, is_required) => ({ id, doc_type, version: 3, effective_date: '2026-01-01', is_required, content: `${doc_type} terms (demo text).`, is_active: true, created_at: now() })
add('legal_document_versions', [legal('ld-general', 'general', true), legal('ld-privacy', 'privacy', true), legal('ld-ai', 'ai', false), legal('ld-sharing', 'sharing', false)])
add('legal_acceptances', [
  { id: 'la1', user_id: U.me, document_id: 'ld-general', doc_type: 'general', version: 3, accepted_at: now(), revoked_at: null },
  { id: 'la2', user_id: U.me, document_id: 'ld-privacy', doc_type: 'privacy', version: 3, accepted_at: now(), revoked_at: null },
])
add('championships', [{ id: C, league_id: L, name: 'Demo GT Series', series_name: 'DGS', description: null, logo_url: null, banner_url: null, status: 'active', default_scoring: null, game_id: 'gran_turismo_7', teams_enabled: false, classes_enabled: true, regions_enabled: false, predictions_enabled: true, telemetry_enabled: false, driver_telemetry_enabled: false, viewer_capture_enabled: false, practice_capture_enabled: false, ai_enabled: false, replay_enabled: false, primary_color_hex: null, secondary_color_hex: null, accent_color_hex: '#0A66FF', is_active: true, logo_storage_path: null, created_at: now(), updated_at: now() }])
add('seasons', [{ id: S, championship_id: C, league_id: L, name: '2026 Season', year: 2026, start_date: '2026-04-01', end_date: null, status: 'active', is_active: true, notes: null, scoring_config: null, drop_rounds: 0, tiebreak_config: null, teams_enabled: false, pole_bonus_enabled: true, pole_bonus_points: 1, fastest_lap_bonus_enabled: true, fastest_lap_bonus_points: 1, created_at: now(), updated_at: now() }])
add('classes', [
  { id: 'k1', league_id: L, name: 'Gr.3', abbreviation: 'G3', is_system: true, system_key: 'Gr.3', system_selected: true, color: null },
  { id: 'k2', league_id: L, name: 'Gr.4', abbreviation: 'G4', is_system: true, system_key: 'Gr.4', system_selected: true, color: null },
])
add('regions', [])
add('season_classes', [{ season_id: S, class_id: 'k1', league_id: L }, { season_id: S, class_id: 'k2', league_id: L }])
add('season_regions', [])
add('gt7_tracks', [
  { id: 't1', game_id: 'gran_turismo_7', league_id: null, name: 'Suzuka Circuit', layout: 'Grand Prix', country: 'Japan' },
  { id: 't2', game_id: 'gran_turismo_7', league_id: null, name: 'Spa-Francorchamps', layout: null, country: 'Belgium' },
  { id: 't3', game_id: 'gran_turismo_7', league_id: null, name: 'Autodromo Nazionale Monza', layout: null, country: 'Italy' },
])
const ev = (id, round, track, date, status) => ({ id, league_id: L, championship_id: C, season_id: S, round, title: track === 't1' ? 'Suzuka Circuit — Grand Prix' : track === 't2' ? 'Spa-Francorchamps' : 'Autodromo Nazionale Monza', custom_title: null, track_id: track, track_layout: track === 't1' ? 'Grand Prix' : null, event_date: date, start_time: '19:00:00', time_zone: 'UTC', class_id: 'k1', region_id: null, practice_config: null, qualifying_minutes: 15, race_distance_type: 'laps', race_value: 15, tire_rules: null, fuel_rules: null, weather_notes: null, penalty_notes: null, notes: null, status, is_published: true, is_team_event: false, created_at: now(), updated_at: now() })
add('events', [ev('e1', 1, 't1', day(-42), 'completed'), ev('e2', 2, 't2', day(-14), 'completed'), ev('e3', 3, 't3', day(5), 'scheduled')])
add('event_classes', [{ event_id: 'e1', class_id: 'k1', league_id: L }, { event_id: 'e2', class_id: 'k1', league_id: L }, { event_id: 'e3', class_id: 'k1', league_id: L }])
const names = ['Dana Driver', 'Ann Admin', 'Bob Marshal', 'Cy Carter', 'Dee Diaz', 'Eli Ellis']
add('drivers', names.map((n, i) => ({ id: `d${i}`, league_id: L, user_id: i === 0 ? U.me : i === 1 ? U.ann : null, display_name: n, first_name: n.split(' ')[0], last_name: n.split(' ')[1], driver_number: String(7 + i * 11), image_url: null, bio: i === 0 ? 'Smooth under braking.' : null, platform_id: null, racing_id: null, team_id: null, class_id: null, region_id: null, is_active: true, profile_image_path: null, requested_driver_number: i === 3 ? '42' : null, driver_number_request_status: i === 3 ? 'pending' : null, created_at: now(), updated_at: now() })))
add('season_drivers', names.map((_, i) => ({ id: `sd${i}`, season_id: S, driver_id: `d${i}`, league_id: L, team_id: null, class_id: 'k1', region_id: null, number_override: null, is_active: true, joined_round: 1, left_round: null, created_at: '2026-04-01T00:00:00Z', updated_at: now() })))
const PTS = [25, 18, 15, 12, 10, 8]
// Finishing orders: e1 → 0,1,2,3,4,5 ; e2 → 1,0,3,2,5,4
const orders = { e1: [0, 1, 2, 3, 4, 5], e2: [1, 0, 3, 2, 5, 4] }
for (const [eventId, order] of Object.entries(orders)) {
  const rsId = `rs-${eventId}-race`
  add('result_sets', [
    { id: `rs-${eventId}-qual`, event_id: eventId, league_id: L, kind: 'qualifying', state: 'finalized', revision: 1, is_published: true, official: true, published: true, locked: true, scoring_version: 1, notes: null, finalized_at: now() },
    { id: rsId, event_id: eventId, league_id: L, kind: 'race', state: 'finalized', revision: 1, is_published: true, official: true, published: true, locked: true, scoring_version: 1, notes: null, finalized_at: now() },
  ])
  order.forEach((d, i) => {
    add('race_results', [{ id: `rr-${eventId}-${d}`, result_set_id: rsId, league_id: L, driver_id: `d${d}`, finish_position: i + 1, start_position: i + 1, laps_completed: 15, total_time_ms: i === 0 ? 1_380_000 : null, gap_ms: i === 0 ? null : i * 1800, best_lap_ms: 91_000 + i * 120, fastest_lap: i === 1, earned_pole: i === 0, pole_manually_overridden: false, gap_type: i === 0 ? null : 'time', gap_value: i === 0 ? null : i * 1800, gap_laps: null, is_grid_seed: false, start_position_manually_overridden: false, status: 'fin', bonus_points: 0, penalty_points: 0, team_id: null, class_id: 'k1', region_id: null, notes: null, created_at: now(), updated_at: now() }])
    const pts = PTS[i] + (i === 0 ? 1 : 0) + (i === 1 ? 1 : 0)
    add('scoring_outputs', [{ id: `so-${eventId}-${d}`, event_id: eventId, league_id: L, season_id: S, championship_id: C, driver_id: `d${d}`, earned_points: pts, adjustment_points: 0, total_points: pts, finish_position: i + 1, status: 'fin', earned_pole: i === 0, fastest_lap: i === 1, is_team_event: false, class_id: 'k1', region_id: null, team_id: null, scoring_version: 1, created_at: now() }])
    add('driver_history', [{ id: `dh-${eventId}-${d}`, league_id: L, championship_id: C, season_id: S, event_id: eventId, driver_id: `d${d}`, result_kind: 'race', track_id: eventId === 'e1' ? 't1' : 't2', region_id: null, class_id: 'k1', team_id: null, finish_position: i + 1, start_position: i + 1, qualifying_position: i + 1, best_lap_ms: 91_000 + i * 120, earned_pole: i === 0, fastest_lap: i === 1, status: 'fin', points: pts, is_team_event: false, result_revision: 1, saved_at: now(), created_at: now() }])
  })
}
add('event_sessions', [{ id: 'es3', event_id: 'e3', league_id: L, state: 'scheduled', version: 1, override_active: false, practice_started_at: null, qualifying_started_at: null, qualifying_ended_at: null, race_started_at: null, race_ended_at: null, last_transition_at: null, last_actor: null, created_at: now(), updated_at: now() }])
add('event_session_audit', [])
add('event_session_notes', [])
add('league_announcements', [{ id: 'an1', league_id: L, author_membership_id: 'm-ann', title: 'Welcome to the season', body: 'Round 3 is at Monza — practice opens Friday.', created_at: now(), updated_at: now() }])
add('invitations', [{ id: 'inv1', league_id: L, code: 'ABC123', email: null, status: 'pending', created_by: U.me, accepted_by: null, expires_at: null, send_status: null, send_error: null, sent_at: null, last_sent_at: null, delivery_provider: null, delivery_message_id: null, created_at: now(), updated_at: now() }])
add('invitation_roles', [{ id: 'ir1', invitation_id: 'inv1', role: 'driver' }])
add('driver_rating_records', [
  { id: 'rr1', league_id: L, championship_id: C, season_id: S, driver_id: 'd0', driver_name: 'Dana Driver', rating_value: 71.2, race_craft: 74, consistency: 69, qualifying: 70, confidence: 'medium', component_summary: '', model_version: 'v', source_signature: 'a', source_data_cutoff: null, previous_rating_value: null, change_from_previous: 0, calculated_at: '2026-05-02T00:00:00Z', created_at: now() },
  { id: 'rr2', league_id: L, championship_id: C, season_id: S, driver_id: 'd0', driver_name: 'Dana Driver', rating_value: 73.9, race_craft: 76, consistency: 71, qualifying: 72, confidence: 'medium', component_summary: '', model_version: 'v', source_signature: 'b', source_data_cutoff: null, previous_rating_value: 71.2, change_from_previous: 2.7, calculated_at: '2026-06-02T00:00:00Z', created_at: now() },
])
add('penalties', [])
add('standing_awards', [])
add('subscriptions', [])
add('league_subscriptions', [])
add('prediction_runs', [{
  id: 'pr1', league_id: L, championship_id: C, season_id: S, event_id: 'e3', category: 'race', model_version: 'VRC-Odds-v3-hybrid', source_signature: 's', official_race_count: 2, generated_at: now(), created_at: now(),
  payload: { model_version: 'VRC-Odds-v3-hybrid', phase: 'pre_qualifying', championship_id: C, season_id: S, event_id: 'e3', generated_at: now(), inputs_summary: 'Demo', official_round_count: 2, remaining_round_count: 1, forecast: null,
    markets: [{ market: 'race_win', group_id: null, group_name: null, confidence: 'medium', data_quality: 0.7, basis_summary: 'demo', inputs_used: [], inputs_missing: [], entries: names.slice(0, 3).map((n, i) => ({ driver_id: `d${i}`, driver_name: n, driver_number: String(7 + i * 11), probability: [0.41, 0.33, 0.14][i], rank: i + 1, confidence: 'medium', data_quality: 0.7, reasons: ['Recent form'], key_stat: 'demo' })) }] },
}])
add('prediction_evaluations', [])
add('capture_summaries', [])
add('rw_event_driver_aggregates', [])
add('rw_qualifying_candidates', [])
add('event_driver_dns', [])
add('event_drivers', [])
add('qualifying_results', [])
add('teams', [])
add('score_adjustments', [])
add('result_audit', [])
add('standings_snapshots', [])
add('standings_snapshot_rows', [])
add('pit_wall_weekends', [{ id: 'pw1', user_id: U.me, event_id: 'e3', track_id: 't3', status: 'active', updated_at: now(), v3_context_created_at: now(), v3_active_car_programme_id: 'cp1' }])
add('pit_wall_captured_runs', [{ id: 'run1', weekend_id: 'pw1', capture_status: 'complete', started_at: now(), ended_at: now(), detected_completed_lap_count: 8, expected_lap_count: 8, tyre_compound_key: 'racing_medium', fuel_start_liters: 40, fuel_end_liters: 31.5, data_quality_status: 'valid', data_quality_flags: [], driver_debrief_status: 'complete' }])

// ---- auth ---------------------------------------------------------------------------------------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function jwt(aal = 'aal2') {
  const t = Math.floor(Date.now() / 1000)
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: U.me, aud: 'authenticated', role: 'authenticated', aal, amr: [{ method: 'totp', timestamp: t }], session_id: 'sess', email: 'dev@example.test', exp: t + 86400, iat: t })}.sig`
}
const user = () => ({ id: U.me, aud: 'authenticated', role: 'authenticated', email: 'dev@example.test', email_confirmed_at: now(), app_metadata: { provider: 'email' }, user_metadata: {}, created_at: now(), factors: [{ id: 'f1', factor_type: 'totp', status: 'verified', friendly_name: 'authenticator', created_at: now(), updated_at: now() }] })
const session = () => ({ access_token: jwt(), token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, refresh_token: 'refresh', user: user() })

// ---- rest helpers -------------------------------------------------------------------------------
const tableAlias = { per_game: 1 }
function coerce(v) { if (v === 'null') return null; if (v === 'true') return true; if (v === 'false') return false; return v }
function match(row, col, expr) {
  const dot = expr.indexOf('.')
  const op = expr.slice(0, dot), raw = expr.slice(dot + 1)
  const val = row[col]
  switch (op) {
    case 'eq': return String(val) === raw
    case 'neq': return String(val) !== raw
    case 'in': return raw.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, '')).includes(String(val))
    case 'is': return val === coerce(raw) || (raw === 'null' && val == null)
    case 'not': { const inner = raw; const d2 = inner.indexOf('.'); return !match(row, col, `${inner.slice(0, d2)}.${inner.slice(d2 + 1)}`) }
    case 'gte': return val >= raw
    case 'lte': return val <= raw
    case 'gt': return val > raw
    case 'lt': return val < raw
    default: return true
  }
}
function embed(table, rows, select) {
  const parts = []
  let depth = 0, cur = ''
  for (const ch of select) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = '' } else cur += ch }
  parts.push(cur)
  const embeds = parts.map((p) => p.trim()).filter((p) => p.includes('('))
  if (embeds.length === 0) return rows
  return rows.map((row) => {
    const out = { ...row }
    for (const e of embeds) {
      const m = /^(?:(\w+):)?(\w+)(?:!\w+)?\(/.exec(e)
      if (!m) continue
      const alias = m[1] ?? m[2], target = m[2]
      if (target === 'membership_roles') out[alias] = (db.membership_roles ?? []).filter((r) => r.membership_id === row.id)
      else if (target === 'invitation_roles') out[alias] = (db.invitation_roles ?? []).filter((r) => r.invitation_id === row.id)
      else if (target === 'profiles') out[alias] = (db.profiles ?? []).find((p) => p.id === row.user_id) ?? null
      else if (target === 'leagues') out[alias] = (db.leagues ?? []).find((l) => l.id === row.league_id) ?? null
      else if (target === 'drivers') out[alias] = (db.drivers ?? []).find((d) => d.id === row.driver_id) ?? null
    }
    return out
  })
}
function query(table, url, method, body, accept) {
  const tbl = db[table]
  if (!tbl) return { status: 404, body: { message: `no table ${table}` } }
  const params = url.searchParams
  let rows = tbl.filter((row) => {
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue
      if (k === 'or') {
        const inner = v.replace(/^\(|\)$/g, '').split(',')
        if (!inner.some((c) => { const [col, ...rest] = c.split('.'); return match(row, col, rest.join('.')) })) return false
        continue
      }
      if (!match(row, k, v)) return false
    }
    return true
  })
  if (method === 'POST') {
    const items = Array.isArray(body) ? body : [body]
    const created = items.map((i) => ({ id: randomUUID(), created_at: now(), updated_at: now(), ...i }))
    tbl.push(...created)
    return { status: 201, body: accept.includes('object') ? created[0] : created }
  }
  if (method === 'PATCH') {
    rows.forEach((r) => Object.assign(r, body, { updated_at: now() }))
    return { status: 200, body: accept.includes('object') ? rows[0] ?? null : rows }
  }
  if (method === 'DELETE') {
    for (const r of rows) tbl.splice(tbl.indexOf(r), 1)
    return { status: 204, body: null }
  }
  const order = params.get('order')
  if (order) {
    const [col, dir] = order.split(',')[0].split('.')
    rows = [...rows].sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * (dir === 'desc' ? -1 : 1))
  }
  const limit = params.get('limit')
  if (limit) rows = rows.slice(0, Number(limit))
  rows = embed(table, rows, params.get('select') ?? '*')
  if (accept.includes('object')) return rows.length === 1 ? { status: 200, body: rows[0] } : { status: rows.length === 0 ? 406 : 406, body: rows.length === 0 ? null : { message: 'multiple rows' } }
  return { status: 200, body: rows }
}

const rpcs = {
  vrc_user_is_pro: () => pro,
  vrc_has_premium_access: () => pro,
  vrc_has_accepted_current: (a) => (db.legal_acceptances.some((x) => x.doc_type === a.p_doc_type && !x.revoked_at)),
  vrc_accept_legal: (a) => { const d = db.legal_document_versions.find((x) => x.id === a.p_document); db.legal_acceptances.push({ id: randomUUID(), user_id: U.me, document_id: d.id, doc_type: d.doc_type, version: d.version, accepted_at: now(), revoked_at: null }); return null },
  vrc_revoke_legal: (a) => { db.legal_acceptances.filter((x) => x.doc_type === a.p_doc_type).forEach((x) => (x.revoked_at = now())); return null },
  vrc_get_my_champion_award: () => ({ ok: true, state: 'none' }),
  vrc_get_my_mmr_participation: () => ({ ok: true, participation_status: 'opted_in', feature_visibility_status: 'shadow' }),
  vrc_get_league_driver_mmr_display: () => ({ ok: true, state: 'coming_soon', drivers: [] }),
  vrc_get_my_global_rating: () => ({ ok: true, state: 'coming_soon' }),
  vrc_get_season_rivals: () => ({ ok: true, rivals: [{ driver_id: 'd0', rival_driver_id: 'd1', rival_display_name: 'Ann Admin', strength: 0.8, shared_races: 2, subject_ahead: 1, record_text: 'Finished ahead in 1 of 2 shared races', rival_since_round: 1, previous_rival_driver_id: null, is_new: false }] }),
  vrc_league_member_accounts: () => [
    { membership_id: 'm-me', user_id: U.me, email: 'dev@example.test', display_name: 'Dana Driver', roles: ['owner', 'driver'], assigned_driver_id: 'd0', assigned_driver_name: 'Dana Driver' },
    { membership_id: 'm-ann', user_id: U.ann, email: 'ann@example.test', display_name: 'Ann Admin', roles: ['admin'], assigned_driver_id: 'd1', assigned_driver_name: 'Ann Admin' },
    { membership_id: 'm-bob', user_id: U.bob, email: 'bob@example.test', display_name: 'Bob Marshal', roles: ['marshal'], assigned_driver_id: null, assigned_driver_name: null },
  ],
  vrc_league_driver_link_status: () => [],
  vrc_assign_driver_account: (a) => { const d = db.drivers.find((x) => x.id === a.p_driver); d.user_id = a.p_user; return d },
  vrc_create_invitation: () => ({ invitation_id: randomUUID(), code: 'XYZ789' }),
  vrc_revoke_invitation: (a) => { const i = db.invitations.find((x) => x.id === a.p_invitation); if (i) i.status = 'revoked'; return null },
  vrc_add_role: (a) => { db.membership_roles.push({ id: randomUUID(), membership_id: a.p_membership, role: a.p_role }); return null },
  vrc_remove_role: (a) => { db.membership_roles = db.membership_roles.filter((r) => !(r.membership_id === a.p_membership && r.role === a.p_role)); return null },
  vrc_remove_member: () => null,
  vrc_session_transition: (a) => { const s = db.event_sessions.find((x) => x.event_id === a.p_event); db.event_session_audit.push({ id: randomUUID(), event_id: a.p_event, league_id: L, actor: U.me, previous_state: s.state, new_state: a.p_target, reason: a.p_reason, was_override: a.p_override, created_at: now() }); s.state = a.p_target; s.version += 1; s.updated_at = now(); return s },
  vrc_activate_season: () => null,
  vrc_get_season_awards: () => [],
  vrc_pit_wall_v3_weekend_car_programmes: () => ({ weekend_id: 'pw1', active_car_programme_id: 'cp1', programmes: [{ id: 'cp1', weekend_id: 'pw1', car_name: 'Porsche 911 RSR (991)', car_gt_class: 'Gr.3', competing_class_name: 'Gr.3', class_source: 'event', lifecycle_status: 'active', is_active: true, has_baseline: true, has_confirmed_current: true, session_count: 3, active_session: null, has_open_manual_package: false, has_locked_race_package: false, run_card_count: 2, report_count: 0 }] }),
  vrc_pit_wall_v3_setup_board_state: () => ({ baseline_snapshot: { id: 'sn1', snapshot_type: 'baseline', lifecycle_status: 'confirmed', revision: 1, observed_at: now(), source: 'driver_confirmed', values: [{ parameter_key: 'front_anti_roll_bar', numeric_value: '4', unit: 'level', availability_status: 'available' }, { parameter_key: 'rear_ride_height', numeric_value: '80', unit: 'mm', availability_status: 'available' }] }, working_snapshot: null, current_snapshot: null, parameter_constraints: [], active_manual_package: null }),
  vrc_pit_wall_v3_engineering_call_state: () => ({ pace: { engineering_pace: 'race_pace', source: 'driver_confirmed', revision: 1, updated_at: now() }, engineering_call: null, active_package: null, unresolved_questions: [{ id: 'q1', question: 'Does entry understeer persist on softs?', required_evidence: 'A soft-tyre run', next_action_type: 'test_run', status: 'open', revision: 1 }] }),
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Expose-Headers': '*', ...extra })
  res.end(body === null || body === undefined ? '' : JSON.stringify(body))
}

http
  .createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, null)
    const url = new URL(req.url, `http://localhost:${PORT}`)
    let raw = ''
    for await (const chunk of req) raw += chunk
    const body = raw ? JSON.parse(raw) : null
    const accept = req.headers.accept ?? ''
    const p = url.pathname
    try {
      if (p === '/__mock/pro') { pro = url.searchParams.get('on') === '1'; return send(res, 200, { pro }) }
      if (p === '/__mock/db') return send(res, 200, db)
      if (p === '/auth/v1/token') return send(res, 200, session())
      if (p === '/auth/v1/user') return send(res, 200, user())
      if (p === '/auth/v1/logout') return send(res, 204, null)
      if (p.startsWith('/auth/v1/factors')) return send(res, 200, { id: 'f1' })
      if (p.startsWith('/rest/v1/rpc/')) {
        const name = p.replace('/rest/v1/rpc/', '')
        const fn = rpcs[name]
        console.log('rpc', name)
        return send(res, 200, fn ? fn(body ?? {}) : null)
      }
      if (p.startsWith('/rest/v1/')) {
        const table = p.replace('/rest/v1/', '')
        const out = query(table, url, req.method, body, accept)
        if (out.status >= 400) console.log('rest', req.method, table, out.status, url.search.slice(0, 120))
        return send(res, out.status, out.body)
      }
      if (p.startsWith('/functions/v1/')) return send(res, 200, { success: true, invitationId: randomUUID(), sendStatus: 'sent' })
      if (p.startsWith('/storage/v1/')) return send(res, 404, { message: 'not found' })
      send(res, 404, { message: 'unhandled ' + p })
    } catch (err) {
      console.error(err)
      send(res, 500, { message: String(err) })
    }
  })
  .listen(PORT, () => console.log(`mock supabase on :${PORT}`))
