# Web Limitations

What the vrc-ops.org website deliberately does not do, and why — so nobody mistakes a gap for a
bug. See `docs/XCODE_SOURCE_ANALYSIS.md` for how each area of the native app was mapped.

## Things that cannot safely run on GitHub Pages

GitHub Pages is static hosting — there is no server to hold secrets. Three native-app
operations require a service-role key or a third-party API key and are proxied through the
**existing** Supabase Edge Functions instead of being reimplemented:

| Operation | Edge function | Secret it needs | Why the browser can't do it directly |
| --- | --- | --- | --- |
| Account deletion | `process-account-deletion` | `SUPABASE_SERVICE_ROLE_KEY` | Deletes Storage objects and the `auth.users` row — both require elevated privilege beyond RLS. |
| Championship deletion (owner) | `process-championship-deletion` | `SUPABASE_SERVICE_ROLE_KEY` | Cleans up championship-logo Storage objects outside RLS's reach. |
| League invite email delivery | `send-league-invite` | `RESEND_API_KEY` | Sending email requires a provider API key that must never reach the browser. |

The web app calls all three the same way the native app does: an authenticated request carrying
the signed-in user's bearer token; the edge function re-authorizes via that token before using
its own secrets. No secret is ever present in the web bundle or repository — only
`VITE_SUPABASE_URL` and the public anon/publishable key (see `.env.example`).

## Telemetry: parsed data only, no live capture

Raw GT7 UDP telemetry capture is Darwin/local-network-specific native app behavior and is not,
and should not be, replicated on the web — a browser has no raw UDP/local-network packet access
to a PS5. The native app's "Capture" tab (Start / Active / History / Uploads / Storage, Driver +
Admin/Marshal only) is almost entirely local-device UI around that capture: a live dashboard
(elapsed time, current/best lap, tire temps, speed, RPM) updates every second **on the recording
device only** while a capture runs. Confirmed by reading the native capture pipeline: **nothing
about an in-progress capture is ever written to Supabase** — no "is capturing" flag, no
mid-session updates. Other users only ever see a capture once the driver saves it locally and the
parsed summary uploads via `vrc_submit_capture_summary`. So there is no cross-device "live
capture" signal to build even in principle.

What the website does read (Race Prep, `src/services/racePrep.ts`):
- `rw_event_driver_aggregates` — the pooled pace leaderboard, refreshed in near-real-time via a
  realtime subscription on `capture_summaries` (this *is* the closest real equivalent to "live"
  data — a leaderboard that updates within moments of a driver's capture uploading).
- `capture_summaries` directly — a "Capture history" list (phase, lap breakdown, confidence,
  validation state, upload time) mirroring the native app's "History" tab, gated to
  Driver/Admin/Marshal/Owner like the native Capture category (Viewers don't see it).

It never uploads telemetry of any kind, and there's no "Start capture" control — that's
inherently local-device-only.

## Features explicitly out of scope for v1

These exist in the native app but are outside the product brief for the website and are not
implemented:

- **AI Race Night** — story/podium-image generation, admin review/validation workflow.
- **Race replay** — lap-by-lap animated playback and replay authoring.
- **Share cards / image export** — 1080×1080 result/standings/story share images.
- **Raw telemetry capture** — GT7 UDP packet capture itself (only parsed summaries are read).
- **Scenario / what-if calculator** — the native `ScenarioCalculatorService` (project standings
  impact if a specific driver finishes a hypothetical race with a chosen position/status/pole/
  fastest-lap) is fully derivable from Supabase data but not yet built on the web. The
  championship-forecast math it would reuse (`buildChampionshipForecast` in
  `src/utils/predictions.ts`) is already ported, so this is mostly a UI/inputs exercise.
- **Driver head-to-head compare** — `DriverHeadToHeadService`'s direct/all-time/grouped stat
  comparison (record, average-finish delta, reliability, etc.) doesn't have a web screen yet.
  Not derivability-blocked, just not built in this pass.
- **Driver photo cropping** — upload works, but the native app's crop/framing controls
  (`imageCropX/Y/Scale`) aren't replicated; the web upload always stores the image as-is.

## Driver avatars: web-derived colors, not class colors

The native app tints a driver's initials-fallback circle using their assigned class's color.
The `classes` table in this schema has no `color` column (only `teams` does), so
`src/components/DriverAvatar.tsx` instead derives a stable color per driver from a hash of their
id. Visually similar (a colored initials circle), but a given driver's color won't match their
class-mate's the way it does natively. If a `classes.color` column is added later, swap the hash
in `colorForDriver()` for a lookup.

## Predictions: simplified factor inputs

The web prediction engine (`src/utils/predictions.ts`) ports the native app's next-race scoring
formulas and confidence-decay curve, and separately ports `VRCForecastEngine`'s championship/
class/region clinch-magic-number-elimination math exactly (`buildChampionshipForecast`) — see
`docs/XCODE_SOURCE_ANALYSIS.md`. Two next-race factor inputs are deliberately simplified relative
to `VRCPredictionEngineV2`:

- **Class strength** is currently a flat placeholder (`0.5`) rather than computed from
  class-relative field strength — the native engine's class-strength derivation depends on data
  shapes (class-scoped standings history) that would need a follow-up pass to port faithfully.
- **Track history / pace** does not incorporate the native app's replay-derived lap insights
  (`PredictionLapInsights`), since race replay itself is out of scope. It uses
  `driver_history.best_lap_ms` and pole/fastest-lap counts as a proxy for pace instead.

Both are documented placeholders, not silent inaccuracies — if the native app's class-strength
and replay-derived pace models are ported later, only `buildFactorInputs` in
`src/utils/predictions.ts` needs to change; the scoring/confidence math already matches.

## Standings: client-computed, like the native app

Neither the native app nor the website recomputes standings server-side — both compute points,
tiebreaks, and clinch/elimination client-side and persist the result via `vrc_save_results`
(see `src/utils/scoring.ts`). This means a web-side race result save recomputes the *entire*
season's cumulative standings from every event's `scoring_outputs`, exactly mirroring what the
native app sends into the same RPC. If two people (native + web) tried to save results for the
same event concurrently, the RPC's revision check (`p_expected_revision`) would reject the
stale write — the same optimistic-concurrency behavior the native app relies on.

## Universal Links / associated domains

The native app's `Config/Production.xcconfig` documents a plan to switch from the `vrc://`
custom scheme to HTTPS Universal Links once a production domain is live, requiring a hosted
`/.well-known/apple-app-site-association` file naming the app's Team ID + Bundle ID. That file
would be a fully static asset in this repo's `public/` directory, but **was not added in this
pass** because it requires the Apple Team ID and Bundle ID, which weren't available from the
read-only web-build context. Follow-up: once those identifiers are confirmed, add
`public/.well-known/apple-app-site-association` and update `Config/Production.xcconfig`
(**in the Xcode repo, by whoever owns that repo** — this website repo must not modify it) to
point `VRC_AUTH_REDIRECT_URL` at the HTTPS host.

## Two-factor authentication is web-only, enforced client-side

The website requires TOTP MFA for every sign-in — the native app does not, and this is
intentional (the user explicitly asked for extra security on the web version specifically).
Enforcement lives entirely in `src/hooks/useMfaGate.ts` + `src/app/ProtectedLayout.tsx`, checking
Supabase Auth's Authenticator Assurance Level (`getAuthenticatorAssuranceLevel()`) after email
verification and before anything else in the app renders. No backend schema or RLS policy was
touched: MFA factors are account-level in Supabase Auth, but nothing in this repo requires `aal2`
at the database layer, so native sign-ins remain password-only and are completely unaffected.

If backend-level enforcement (RLS policies requiring `aal2` for writes) is wanted later, that
would need migrations in the RFSRaceControl Supabase project and corresponding MFA
enrollment/challenge UI in the native app — out of scope here by design.

## Schema types are hand-written, not generated

`src/types/database.ts` was hand-derived from the migration SQL because no Supabase CLI/project
access was available during this build to run `supabase gen types typescript`. It should be
treated as a snapshot as of the migrations reviewed (through
`20260703155125_league_invite_email_delivery.sql`) — regenerate and diff when possible.
