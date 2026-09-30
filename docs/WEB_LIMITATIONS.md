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

## Features that are device-specific or not exposed

The full, current checklist — including what is complete — lives in [`docs/IOS_PARITY.md`](IOS_PARITY.md). In short, the website does
**not** provide:

- **Native-only capture and import** — live GT7 telemetry / practice capture, photo import of results, Pit Wall garage arrival,
  run capture and engineering-call evaluation. Pit Wall on the web is a read-only view of the state those flows already saved.
- **Apple purchases** — the site shows entitlement status and links to the App Store; it never sells or processes a subscription.
- **Hidden / coming-soon iOS features** — Race Replay, AI Race Weekend / Stint Review, Cloud Publishing, Finale, Stories, Driver
  Comparison, and games other than GT7. They are absent (or shown disabled "Coming soon") exactly as the iOS feature registry says.
- **Client-side odds or ratings** — predictions are read from server-calculated runs (`VRC-Odds-v3-hybrid`); the performance
  rating shown is the latest stored snapshot, not a number the browser computes.
- **Free-form photo cropping** — driver photos are centre-cropped and compressed before upload.
- **Share cards / image export** and trophy artwork — iOS bundle assets and legacy views.

## Driver avatars: web-derived colors, not class colors

The native app tints a driver's initials-fallback circle using their assigned class's color. The `classes` table has no `color`
column the web reads, so `src/components/DriverAvatar.tsx` derives a stable color per driver from a hash of their id.

## Standings: computed from `scoring_outputs`, like the native app

Both platforms compute standings from the season's `scoring_outputs` when a screen loads (drop rounds, tie-breaks, Out / Clinched /
Champion, series outcomes). The server writes `scoring_outputs` when results are saved (`vrc_save_results`), and Owner/Admin
reconcile `standing_awards` with `vrc_sync_series_awards`. Known scoring differences between platforms are listed in
`docs/IOS_PARITY.md`.

## Universal Links / associated domains

`public/.well-known/apple-app-site-association` is now added (2026-09-15), naming the native
app's Team ID + Bundle ID (`2U4X4CV994.info.rfs.VRC`), scoped to `/invite/*` only — the same
narrow scope the native app's own `Config/Base.xcconfig` (`RFS_UNIVERSAL_LINK_HOST =
vrc-ops.org`) and `RFSRaceControl.entitlements` (`applinks:$(RFS_UNIVERSAL_LINK_HOST)`) declare on
the Xcode side. Once a native build carrying that entitlement is installed/updated on a device,
tapping `https://vrc-ops.org/invite/<token>` should open the native app directly instead of this
website — this page (`InviteAcceptancePage.tsx`) remains the correct, fully-functional fallback
for anyone without the app, or before that association has propagated to a given device.

**Caveat, not yet verified**: GitHub Pages cannot set a custom `Content-Type` response header.
Apple's documented requirement is `application/json`; an extensionless file served by GitHub
Pages may instead come back as `text/plain`. Various publicly-documented GitHub-Pages-hosted AASA
setups report this working in practice (Apple's on-device fetcher is commonly described as
tolerant of this specific case), but this has not been confirmed for this domain — verify with
`curl -I https://vrc-ops.org/.well-known/apple-app-site-association` after deploy, and ideally
Apple's own AASA validation (e.g. via a real device's Associated Domains diagnostics) before
relying on it for anything user-facing.

The Xcode-side config was updated in the `vrc-platform` repo separately, along with a fix to
`send-league-invite` so invite emails default to `https://vrc-ops.org/invite/<token>` instead of
the bare `vrc://` scheme — this website's `/invite/:token` page is that link's real destination.

## Two-factor authentication

The website requires TOTP MFA for every sign-in and the backend agrees: every table carries a **restrictive `aal2` RLS policy**, so a
session that has not completed MFA can read nothing. The client gate (`src/hooks/useMfaGate.ts` + `src/app/ProtectedLayout.tsx`)
checks the Authenticator Assurance Level after email verification and before anything else renders, so a user sees the enrollment or
challenge screen instead of empty pages. Sensitive actions (Global Rating participation, the permanent driver ⇄ account link, the
champion Apple offer) additionally ask for a **fresh** authenticator code immediately beforehand; the server re-verifies it.

## Schema types are hand-written, not generated

`src/types/database.ts` is hand-maintained (no `supabase gen types` run in CI). It was last reconciled against the live project's
catalog and the `vrc-platform` migrations on 2026-09-30 (see the header note in that file and `docs/IOS_PARITY.md`). Regenerate and
diff when the schema changes.
