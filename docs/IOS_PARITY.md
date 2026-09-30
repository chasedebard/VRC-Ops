# iOS parity — checklist, contract notes and remaining limitations

This is the source of truth for how vrc-ops.org relates to the shipped VRC Ops iOS app. It supersedes the older
`docs/XCODE_SOURCE_ANALYSIS.md` and `docs/WEB_LIMITATIONS.md` wherever they disagree (both carry a banner saying so).

**Sources of truth used** (read at the commits named in the PR): the iOS app and Supabase project in
`chasedebard/vrc-platform` (`AllFeatures.swift` feature registry, `VRCPhase13Navigation.swift` shell, the feature folders, the
`supabase/migrations` and `supabase/functions` trees) and the live project's **catalog** (table/column/function signatures and RLS
policies only — no user data was read and nothing was written).

Status legend: **Complete** · **Partial** (works, with a stated difference) · **Device-specific** (needs native hardware or an
Apple/OS capability a browser does not have — given an honest web treatment) · **Not exposed** (hidden / coming soon in the iOS
registry, so deliberately absent from the web too).

## Feature registry

`src/config/featureRegistry.ts` mirrors `AllFeatures.swift`. Hidden features never render, coming-soon ones render disabled and
labelled, premium ones follow the Pro / League Plus entitlement. The plan limits (Pro owns ≤ 5 leagues, ≤ 3 active seasons, League
Plus 15 seats) are the same constants.

## Parity checklist

### Accounts, legal and onboarding

| iOS capability | Web | Notes |
| --- | --- | --- |
| Email/password sign-in, verification, reset | Complete | Web additionally enforces TOTP MFA (see "Web-only") |
| Legal v3: Terms + Privacy gate the app; AI and Sharing consent at the moment of use; revoke where allowed | Complete | `FeatureLegalGate`; Predictions reads need current AI consent (RLS enforces it too) |
| Profile setup, account avatar | Complete | Avatar is re-encoded as a square JPEG ≤ 300 KB before upload |
| Join by code / invite link, first-league creation | Complete | Old viewer codes are gone (the backend removed them) |
| Guided league setup (GT7 groups → championship + season), pending-setup resume/cancel | Complete | |
| Multiple leagues, switch, leave, Pro owned-league limit | Complete | Limit keys off the individual Pro subscription only, like iOS |
| Account deletion | Complete | Owner chooses who receives each shared league (never auto-picked), password re-entry, type DELETE; server work runs in `process-account-deletion` |
| Settings: Account, Appearance, Context, About | Complete | Appearance = theme mode + VRC / personal / championship accent (per-mode contrast adjustment) |

### Home

| iOS capability | Web | Notes |
| --- | --- | --- |
| Next-race hero (phase from `event_sessions.state`, day-granularity countdown) | Complete | Never derived from `events.status` alone |
| Role-aware card composer (each card once, priority tiers) | Complete | Pure port, unit-tested |
| Driver section: greeting, performance + gap tile, championship battle, recent form, quick actions | Complete | Rival comes from `vrc_get_season_rivals` |
| Forecast card | Complete | Server-calculated runs, Pro / League Plus + AI consent |
| Owner/Admin: leaders, season progress, driver spotlight, needs-attention | Complete | Spotlight uses the app's FNV-1a pick so the same driver shows everywhere |
| Steward (Marshal): review queue, penalties | Complete | |
| Announcements (read everyone, post Owner/Admin) | Complete | Follows the **live** table schema (see discrepancies) |
| Points-trend chart (overall / class / region) | Complete | Class/region series are Pro |
| "My rating" | Partial | Shows the latest **stored** `driver_rating_records` snapshot, not a locally computed number |
| AI race brief | Not exposed | `aiRaceWeekend` is hidden |

### Championship management

| iOS capability | Web | Notes |
| --- | --- | --- |
| Championships: identity/colours, feature toggles, status, guarded game change, Owner-only delete | Complete | Delete goes through `process-championship-deletion` (the old RPC is no longer callable) |
| Seasons: details, dates, drop rounds, status, structure (classes/regions), review & activate | Complete | Activation respects the plan's active-season limit and explains why it is blocked |
| Race (event) create/edit/delete, status, publish | Complete | Satisfies the live triggers: generated title, track, distance, class when classes are on; GT7 region derives server-side |
| Schedule (read-only for everyone) | Complete | `/schedule` |
| Classes (incl. GT7 canonical groups), regions, tracks (incl. bulk import), teams, roster | Complete | |
| Other games (iRacing, NASCAR, Forza, F1) | Not exposed | Shown disabled "Coming soon" |

### Race weekend and results

| iOS capability | Web | Notes |
| --- | --- | --- |
| Race Weekend hub (current race, reconciled status, rounds) | Complete | |
| Event page: Practice → Qualifying → Race timeline, session controls, qualifying gating, cancel/postpone, authorized override with reason, audit, notes | Complete | Server (`vrc_session_transition`) decides what is legal |
| Race Prep: pace leaderboard, capture history, DNS | Complete | |
| Qualifying entry, race entry (gap/time, laps down, multi-class, pole sync, DNS, penalties/adjustments), Save → Official, lock/unlock, audit log | Complete | Unified `vrc_save_results` contract |
| Results hub (latest official podium, per-round status) and MMR impact | Complete | |
| Import results from a photo | Device-specific | Needs the phone camera + on-device OCR; the web says so on the entry screens |
| Live GT7 telemetry capture / practice capture | Device-specific | A browser cannot receive GT7 UDP telemetry |

### Standings

| iOS capability | Web | Notes |
| --- | --- | --- |
| Standings computed from `scoring_outputs`; drop rounds; tie-breaks | Complete | Port of the iOS evaluator |
| Overall / class / region / team tabs | Complete | Class and region are Pro |
| Out / Clinched / Champion statuses, series outcome card, trophy marker | Complete | |
| Award sync (`vrc_sync_series_awards`), rivals marker, movement | Complete | |

### Predictions

| iOS capability | Web | Notes |
| --- | --- | --- |
| Race and championship forecasts (model `VRC-Odds-v3-hybrid`), movement, top story, spotlight, accuracy vs results | Complete | The browser only **reads** `prediction_runs`; it never computes odds (the old client-side engine was removed) |
| Owner/Admin recompute request | Complete | `vrc_request_prediction_job` |

### Drivers

| iOS capability | Web | Notes |
| --- | --- | --- |
| Directory (season participants, league directory, add/remove, create, number requests) | Complete | |
| Profile: season card, recent form, Pro Season/Career analytics (trend, career, placements, milestones, records, progression, class/track history, race log) | Complete | Pure ports; advanced data is not even fetched without Pro |
| Trophy Case (8 trophy types, gemstone tiers, titles from standings + `standing_awards`) | Complete | Artwork is an iOS asset; the web shows tier, gemstones and progress as accessible text |
| Redacted Global Rating badge; rival marker | Complete | Shadow phase shows nothing |
| My Driver self-service (guarded fields, number request, Sharing Terms for photos) | Complete | The photo is centre-cropped; no crop sliders |
| Owner/Admin driver management, account assignment, permanent Global Rating link (fresh MFA), archive | Complete | |
| Rating history | Partial | Displays stored snapshots; telemetry-informed rating, per-class score and qualifying-pace panel are not recomputed |
| Driver comparison | Not exposed | `driverComparison` is hidden |

### Pit Wall (V3)

| iOS capability | Web | Notes |
| --- | --- | --- |
| Overview (programme, engineering call, setup status, queue), Setup (baseline/current/open package), History (captured runs) | Partial | **Read-only** view of the canonical server state, behind Pro / League Plus |
| Weekend/programme creation, garage arrival, run capture, engineering-call evaluation, package proposals, Report | Device-specific | Driven by native telemetry and setup screens; nothing is estimated or computed on the web |

### Global Rating, subscriptions, League Plus

| iOS capability | Web | Notes |
| --- | --- | --- |
| Global Rating (participation with fresh MFA, private rating/ledger, Shadow vs Public) | Complete | |
| Quarterly champion reward + Apple offer code | Complete | Code revealed only via the real Edge Function after fresh MFA |
| Subscription status and benefits | Partial | Status/entitlement only — purchase and restore are Apple in-app purchase (device-specific); the site links to the App Store |
| League Plus seats (Owner) | Complete | |

### Administration

| iOS capability | Web | Notes |
| --- | --- | --- |
| Members, roles (Owner grant gated), remove, driver-account assignment | Complete | |
| Invitations (email / code, expiry, resend, revoke) | Complete | |
| Announcements manager | Complete | |
| League Plus, championship setup shortcuts | Complete | |

### Web-only

- **TOTP MFA at sign-in** — aligned with the backend: every table carries a restrictive `aal2` policy, so a session without MFA reads nothing.
- Skip link, `aria-current` navigation, accessible mobile menu, code-split routes.

## Backend contract notes

- **Results**: `vrc_save_results` (unified official save), `vrc_unlock_results`, `vrc_set_event_dns`, `vrc_sync_race_grid_from_qualifying`; the event needs a region and ≥ 1 row in `event_classes` (the function does **not** fall back to `events.class_id`, and no trigger mirrors it). The web therefore writes `event_classes` whenever it creates or edits a race with a class. A championship with classes switched off has no class to attach, so neither platform can save results for it — keep classes on for any league that enters results.
- **Standings**: computed client-side from `scoring_outputs`; `vrc_sync_series_awards` (Owner/Admin) reconciles `standing_awards`.
- **Predictions**: `prediction_runs` / `prediction_evaluations` (RLS needs current AI consent); `predictions-worker` writes them.
- **MMR**: `vrc_get_my_global_rating`, `vrc_get_my_mmr_participation`, `vrc_update_my_mmr_participation` (fresh MFA), `vrc_get_league_driver_mmr_display`, `vrc_get_result_mmr_impact`, champion award RPCs + `apple-champion-offer`.
- **Drivers**: `vrc_league_member_accounts`, `vrc_assign_driver_account`, `vrc_link_league_driver_to_account` (fresh MFA, permanent), `vrc_league_driver_link_status`, `vrc_archive_driver`; self-edit is guarded by `vrc_guard_driver_self_update`.
- **Events**: `private.validate_event_integrity` requires `track_id`, `race_value > 0`, `class_id` when classes are enabled; `title` is `NOT NULL`; `vrc_derive_event_region` fills GT7 regions.
- **Announcements**: `(id, league_id, author_membership_id, title, body, created_at, updated_at)`; insert requires the caller's own active membership.
- **Pit Wall V3**: `vrc_pit_wall_v3_weekend_car_programmes`, `…_setup_board_state`, `…_engineering_call_state`; tables are owner-scoped (`pit_wall_owns_weekend`).
- **Deletion**: `process-account-deletion`, `process-championship-deletion` (Owner), `send-league-invite` — server-side credentials only; no secret is in the bundle.

Stale contracts found while checking against the live catalog and fixed: event inserts omitted the `NOT NULL` title/track/distance;
`vrc_delete_championship_with_seasons` is no longer executable by signed-in users.

## Known cross-platform differences (not silently reconciled)

1. **Season bonus points** — iOS `main` always awards +1 pole / +1 fastest lap and ignores `seasons.pole_bonus_*` / `fastest_lap_bonus_*`; Android and the web honour the season settings. The web keeps the season values.
2. **Classified results** — iOS awards position points only for `fin`; the database, Android and the web also count `classified`.
3. **Announcements** — iOS still selects `pinned`, `championship_id`, `season_id` and `author_user_id`, which the live table no longer has; the web follows the live schema.
4. **Pit Wall entitlement** — the iOS registry gates Pit Wall on Pro / League Plus, but most V3 RPCs are authenticated-only (and `…_engineering_call_state` still checks `vrc_user_is_pro()`); the web gates on the entitlement like iOS and maps the server error.
5. **Driver rating** — iOS computes and stores snapshots on result saves; web result saves do not write `driver_rating_records`, so a league that only ever saves from the web accumulates no new snapshots.

## Remaining limitations (and why)

| Limitation | Reason it can't be done on the web yet |
| --- | --- |
| Live GT7 telemetry capture, practice capture, garage arrival, run capture, engineering-call evaluation | No UDP/local-network access in browsers; the capture pipeline is native |
| Photo import of qualifying / race results | Needs the device camera/photo library and on-device OCR |
| Buying or restoring a subscription | Apple in-app purchase is iOS/macOS-only |
| Pit Wall write flows and Report | Depend on native capture; web is a faithful read-only view |
| Recomputing the driver "performance rating", per-class rating score and qualifying-pace panel | iOS derives them client-side from practice telemetry and a calculator that is not a backend contract; the web shows stored snapshots |
| Writing rating snapshots after web result saves | Requires the same client-side calculator (see above) |
| Trophy artwork, share cards / image export, onboarding guide | iOS bundle assets / legacy views not reachable from the current shell |
| Adjustable photo crop | The web centre-crops and compresses; free-form cropping is a UI follow-up |
| Race Replay, AI Race Weekend / Stint Review, Cloud Publishing, Finale, Stories, Driver Comparison, other games | Hidden or coming soon in the iOS registry — intentionally not exposed |
| Verified end-to-end run against the live project with real accounts | No credentials may be entered for automated sign-in; see the PR's verification section |

## Verification

See the pull request description for exact results. In short: `npm run typecheck`, `npm run lint`, `npm test` (unit + component
tests) and `npm run build` are clean; user flows were exercised in a browser against a local mock of the Supabase REST/auth/RPC surface
(synthetic data, no network access to the real project), and GitHub Pages deep-link routing was checked with a static `404.html`
fallback emulator.
