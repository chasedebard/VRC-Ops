# Xcode Source Analysis

This document records what was reviewed in the RFS Race Control (VRC) Xcode app at
`/Users/chasedebard/RFSRaceControl` (read-only reference — never modified) to build the
vrc-ops.org website, and how each area maps onto the web implementation in this repository.

The app was reviewed as three parallel passes: (1) screens, navigation, roles, auth, and
invite flows; (2) the full Supabase schema, RLS policies, RPCs, and edge functions; (3) race
weekend/results/standings/predictions business logic. A prior planning document,
`V2_APP_AUDIT.md`, describes an older SwiftData/CloudKit version of the app — **it was treated
as historical background only**; this analysis reflects the current Supabase-backed
implementation (migrations dated through 2026-07-03).

## App architecture reviewed

- Entry point: `RFSRaceControl/RFSRaceControl/Sources/VRCApp.swift`
- Root navigation/gate: `RFSRaceControl/RFSRaceControl/VRC/App/RootView.swift` — routes through
  loading → sign-in/up → email verification → league gate (profile completion → legal
  acceptance → league selection) → main shell.
- Deep link routing: `VRC/App/VRCAuthDeepLinkRouter.swift` — supports both `vrc://` custom
  scheme and HTTPS Universal Links for auth callbacks and invite acceptance.
- Main shell: `VRCPhase13Shell` — 10 role-aware categories: Home, Championship, Race Weekend,
  Results, Standings, Capture, Predictions, Drivers, Administration, Settings.

**Web mapping:** `src/app/ProtectedLayout.tsx` reproduces the same gate sequence (auth state →
profile → legal → league selection → shell). `src/components/Layout.tsx` reproduces the shell
categories as top nav items, filtered by `usesAdminShell` for Administration.

## Screen map → web routes

| Native area | Native file(s) | Web route(s) |
| --- | --- | --- |
| Auth (sign in/up, recovery) | `VRC/Features/Auth/VRCAuthViews.swift` | `/login`, `/signup`, `/reset-password`, `/reset-password/update`, `/auth/callback` |
| League gate (profile/legal/league) | `VRC/Features/Membership/VRCLeagueGateView.swift` | Rendered inline by `ProtectedLayout` before any other route |
| Invite acceptance | `VRC/Features/Membership/VRCInviteAcceptanceView.swift` | `/invite/:token`, `/join` |
| Member/role management, invites | `VRC/Features/Membership/VRCMemberManagementViews.swift` | `/admin` |
| Profile/account settings, deletion | `VRCProfileSettingsView.swift`, `VRCDeleteAccountView.swift` | `/account` |
| Championship/season CRUD | `VRC/Features/Management/VRCChampionshipViews.swift`, `VRCChampionshipSetupFlow.swift` | `/championships`, `/championships/:id`, `/seasons/:id` |
| Event/round setup | `VRC/Features/Management/VRCEventSetupFlow.swift` | Event creation embedded in `/seasons/:id` |
| Driver roster & assignment | `VRC/Features/Management/VRCDriverAssignmentView.swift` | `/drivers`, driver roster section of `/seasons/:id` |
| Bulk track import | `VRC/Features/Management/BulkAddTracks/VRCTrackBulkImportView.swift` | `/tracks` (CSV import) |
| Class/region/team CRUD | `VRC/Features/Management/VRCManagementCatalogViews.swift` | `/classes`, `/regions` |
| Race weekend hub | `VRC/Features/Admin/RaceWeekend/RaceWeekendHubView.swift` | `/race-weekend` |
| Race prep / practice pace | `VRC/Features/RacePrep/RacePrepView.swift` | `/race-prep/:eventId` |
| Qualifying / race result entry | `VRC/Features/Results/VRCResultEntryView.swift` | `/qualifying/:eventId`, `/results/:eventId` |
| Race control (session state) | `VRC/Features/RaceControl/VRCRaceControlView.swift` | Embedded in `/race-weekend/:eventId` |
| Results audit log | `VRC/Features/Management/VRCResultsAuditLogView.swift` | Not yet surfaced in a dedicated web screen (see Web Limitations) |
| Standings | `VRC/Features/Results/VRCStandingsViews.swift` | `/standings` |
| Predictions/forecasts | `VRC/Core/Services/Predictions/VRCPredictionEngineV2.swift` | `/predictions` |
| Driver profile | `DriverProfileView.swift`, `DriverProfileViewModel.swift` | `/drivers/:id` |

## Permission model

Role enum (`vrc_role` in Postgres, `VRCRole` in Swift): `owner`, `admin`, `marshal`, `driver`,
`viewer`. A membership holds a *set* of roles, not a single role. `VRCPermissionResolver.swift`
derives capability flags from that set:

- `canManageMembers` / `canSendInvitations` / `canManageRoles` / `canAdministerLegal` → owner + admin
- `canGrantOwnerRole` → owner only
- `canOperateRaceControl` / `canSubmitResults` → owner + admin + marshal
- `canApproveResults` → owner + admin
- `canViewPublished` → any member
- `usesAdminShell` → owner or admin

**Web mapping:** `src/permissions/resolver.ts` (`resolvePermissions`) reproduces this exact
mapping; `src/permissions/Guard.tsx` (`RequirePermission`) gates UI the same way
`VRCPermissionResolver` gates SwiftUI views. As in the native app, this is **UI-hiding only** —
every mutation is re-checked server-side by RLS + `SECURITY DEFINER` RPCs.

## Data model reviewed (Supabase migrations)

Every league-scoped table carries a `league_id` FK; multi-tenant isolation is enforced by RLS,
not application code. Tables reviewed in full: `profiles`, `leagues`, `memberships` /
`membership_roles`, `invitations` / `invitation_roles`, `viewer_codes`,
`legal_document_versions` / `legal_acceptances`, `championships`, `seasons`, `classes`,
`regions`, `teams`, `drivers`, `season_drivers`, `driver_game_identities`, the five per-game
track catalogs (`gt7_tracks`, `iracing_tracks`, `nascar_tracks`, `forza_horizon_tracks`,
`formula_1_tracks`), `events`, `event_drivers`, `event_classes`, `event_sessions` /
`event_session_audit` / `event_session_notes`, `result_sets`, `qualifying_results`,
`race_results`, `penalties`, `score_adjustments`, `scoring_outputs`, `standings_snapshots` /
`standings_snapshot_rows`, `result_audit`, `driver_history`, `capture_summaries`,
`rw_event_driver_aggregates`, `rw_qualifying_candidates`, `prediction_runs`,
`prediction_evaluations`.

**Web mapping:** `src/types/database.ts` hand-derives a TypeScript `Row` interface per table
directly from the migration SQL (column names/types/enums), since there was no live database
connection available to run `supabase gen types typescript`. **This is an assumption worth
re-validating**: regenerate from the CLI against the real project once someone has Supabase CLI
access, and diff against `src/types/database.ts`.

### Mutating operations are RPC-only

The web app never issues raw `insert`/`update` against sensitive tables where the native app
uses an RPC — it calls the same `SECURITY DEFINER` functions with the anon key + user JWT:
`vrc_create_league`, `vrc_create_invitation`, `vrc_accept_invitation` /
`vrc_accept_invitation_by_token`, `vrc_revoke_invitation`, `vrc_create_viewer_code` /
`vrc_accept_viewer_code` / `vrc_revoke_viewer_code`, `vrc_add_role` / `vrc_remove_role` /
`vrc_remove_member`, `vrc_transfer_league_ownership`, `vrc_accept_legal` / `vrc_revoke_legal` /
`vrc_has_accepted_current`, `vrc_activate_season`, `vrc_set_championship_game`,
`vrc_delete_championship_with_seasons`, `vrc_session_transition`, `vrc_result_transition`,
`vrc_save_results`, `vrc_unlock_results`, `vrc_sync_race_pole_from_qualifying`,
`vrc_save_prediction_run` / `vrc_save_prediction_evaluation`,
`vrc_account_deletion_blocking_leagues`. See `src/services/*` for the 1:1 wrappers.

### Edge functions (server-only, cannot run from a public client)

- `process-account-deletion` — needs `SUPABASE_SERVICE_ROLE_KEY` to purge Storage objects and
  delete the `auth.users` row.
- `process-championship-deletion` — same service-role requirement, for championship-owned
  Storage cleanup.
- `send-league-invite` — needs `RESEND_API_KEY` to deliver invite emails.

The web app calls all three exactly like the native app does: an authenticated `fetch` (via
`supabase.functions.invoke`) carrying the user's bearer token; the function itself holds the
secrets and re-authorizes via that token. See `src/services/account.ts` and
`src/services/invitations.ts`.

## Business logic ported to TypeScript

- **Standings scoring** (`src/utils/scoring.ts`) — ports the points table (`[25,18,15,12,10,8,
  6,4,2,1]` + 1pt pole bonus + 1pt fastest-lap bonus), the exact tiebreak order (points → wins →
  2nds → 3rds → poles → fastest laps → name), and the clinch/elimination math from
  `StandingsEngine.swift` / `VRCScoringEngine.swift`. This only runs when *saving* new race
  results (`pages/raceWeekend/ResultsPage.tsx`) — reading standings only ever reads the
  persisted `standings_snapshot_rows`, matching how the native app works.
- **Predictions** (`src/utils/predictions.ts`) — ports the race-winner/podium/pole/fastest-lap
  scoring formulas and the sample-size confidence decay curve from
  `VRCPredictionEngineV2.swift`. Fully client-computable from data any league member can already
  read, so it runs for any signed-in member; only *persisting* a run via
  `vrc_save_prediction_run` is staff-gated, matching the native app's `canOperateRaceControl`
  check.
- **Race prep pace sort** (`src/services/racePrep.ts`) — ports
  `RacePrepLeaderboard.paceOrder()`'s exact ordering: valid-average rows first, fastest average
  lap ascending, then fastest representative lap ascending, then laps completed descending, then
  name ascending.
- **Upcoming event resolver** (`src/services/events.ts`, `resolveUpcomingEvent`) — ports
  `RacePrepUpcomingEventResolver.select()`: earliest event dated today-or-later, falling back to
  the most recent incomplete event once the calendar is finished.

## Home dashboard: native reference, deliberately exceeded on web

The native "Home" tab (`VRCAdminHomeView.swift` for Owner/Admin, `ViewerDashboardView.swift` for
Viewers — Drivers/Marshals fall back to whichever of those two they have context for) is
intentionally lean: championship header, an upcoming-race card, a last-race card, a driver
spotlight, and a championship-prediction-evolution line chart backed by the
`championship_prediction_snapshots` table. `src/pages/DashboardPage.tsx` uses that as a starting
point but goes further, since a browser has far more room than a phone screen:

- A league-at-a-glance stat row (active drivers, races scheduled/completed, season progress %)
  that the native Home doesn't surface as a stat block at all (the underlying counts exist in
  `AdminHomeDashboardData`, just aren't shown together).
- A setup checklist (Owner/Admin only) flagging a season with no events, an empty roster, an
  empty track catalog, or classes/regions enabled but not yet created.
- Standings snapshot (top 5, with movement indicators) and forecast highlights (race-winner/pole
  favorites, championship narrative) inline on the dashboard rather than requiring navigation.
- A **multi-driver** points-progression chart (`MultiSeriesTrendChart`) built from
  `scoring_outputs.total_points`, grouped by event round and cumulatively summed per driver.
  This avoids replaying the latest standings total across old snapshots or driver-history rows
  after later corrections, while still sidestepping the native's
  `championship_prediction_snapshots` table (which may not even be populated for every league).

## Telemetry boundary

Per the native app's `RW-MINIMAL-002/003` design (see `Documentation/backend-safeguards.md`),
raw per-lap telemetry, sector traces, and driver input are never uploaded — only aggregated
`capture_summaries` (laps completed, average/fastest representative lap, variance,
classification confidence). The website only *reads* `rw_event_driver_aggregates`
(`src/services/racePrep.ts`) — it never performs telemetry capture or upload, matching the
brief's requirement that raw capture stays local-device/native-app behavior.

## Status/active-inactive fields

Confirmed in the migrations that **only** `drivers.is_active`, `season_drivers.is_active`, and
season/championship `status` (with seasons' `is_active` convenience flag) are
visibility-relevant in the sense the product brief describes. Event/result-set lifecycle enums
(`draft/scheduled/live/completed/...`, `draft/submitted/.../finalized`) are **operational
state for race control and result approval, not a general-purpose visibility filter** — the web
app only surfaces those on race-control/result-lifecycle screens (`RaceWeekendEventPage`,
`QualifyingPage`, `ResultsPage`), not on generic list screens.

## Assumptions and gaps

- Hand-written types (`src/types/database.ts`) are derived from migration SQL read at a point in
  time (through `20260703155125_league_invite_email_delivery.sql`) — they will drift if the
  schema changes after this analysis. Regenerate via the Supabase CLI when possible.
- Class-strength and track-history prediction factors are simplified relative to the native
  engine's full replay-derived lap insights (see `docs/WEB_LIMITATIONS.md`).
- AI Race Night, story generation, share cards, race replay, and raw GT7 telemetry capture are
  explicitly out of scope for the website per the product brief and are not implemented.
