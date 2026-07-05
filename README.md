# VRC — Virtual Race Control

**League management and race control for sim racing, done properly.**

VRC (also known as RFS Race Control) is an iOS, iPadOS, and macOS app for running sim‑racing leagues and championships end to end — from setting up a season, to running qualifying and race sessions, to publishing standings and results your drivers can actually trust.

This repository is both the **documentation hub** for the product and the source for the **[vrc-ops.org](https://vrc-ops.org)** companion website, a GitHub Pages web app that talks to the same Supabase backend as the native apps.

## Who it's for

VRC is built for sim racing league organizers, race directors, and stewards who need a real administration tool rather than a spreadsheet — along with the drivers and viewers who follow along. It's designed to scale from a small weekly Friday-night league to a multi-class, multi-season championship with dozens of drivers.

## Core features

- **Leagues, championships & seasons** — create a league, structure it into championships and seasons, and invite staff and drivers by email.
- **Roles & permissions** — Owner, Admin, Marshal, Driver, and Viewer roles control who can configure a series versus who can only follow it.
- **Driver roster & profiles** — manage a driver roster with profiles, driver photos, team/class/region assignments, and season-by-season history.
- **Track library & bulk import** — a shared, per-game track catalog with support for bulk-importing tracks from a file instead of adding them one at a time.
- **Events & race weekends** — schedule events and race weekends tied to a season and a track.
- **Qualifying & race results** — enter qualifying results (best lap, gaps, grid adjustments, penalties) and race results (finishing order, gaps, status such as DNS/DNF/DSQ, pole position, and fastest lap), with pole position auto-filled from qualifying.
- **Standings** — automatically computed championship standings, including breakdowns by class, region, and team where a championship enables them.
- **Predictions & forecasts** — a deterministic odds/prediction engine that surfaces race and championship forecasts based on the data already in the series.
- **Telemetry Capture** — optionally parse local telemetry summaries (for example, from Gran Turismo 7 on PS5) to enrich results with lap and pace data.
- **Live session state** — race control tooling to manage session status through an event, with an audit trail of transitions.

## Supported platforms

- iOS, iPadOS, macOS (native app — source lives in a separate, private repository)
- Web (this repository, [vrc-ops.org](https://vrc-ops.org)) — a companion read/write dashboard covering the same league operations, built for desktop, tablet, and mobile browsers

## Backend

VRC is backed by Supabase: Postgres with row-level security, authentication, file storage (for driver photos and similar assets), and edge functions/scheduled jobs for things like league invite email delivery. The website talks to the exact same Supabase project via the public anon key — every mutation is authorized server-side by RLS policies and `SECURITY DEFINER` RPCs, so the browser never needs elevated privileges.

## Website: local setup

```bash
npm install
cp .env.example .env   # fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev
```

Available scripts:

| Script             | Purpose                                   |
| ------------------ | ------------------------------------------ |
| `npm run dev`       | Local dev server (Vite)                    |
| `npm run build`     | Type-check and build a production bundle   |
| `npm run preview`   | Serve the production build locally         |
| `npm run typecheck` | `tsc` project-wide, no emit                |
| `npm run lint`      | ESLint over the whole project              |

### Environment variables

Only the **anon/publishable** Supabase key belongs in this app (see `.env.example`) — it's safe for a public client because Row Level Security enforces every permission check server-side. Never add a `service-role` key here; the few operations that require one (account deletion, championship deletion, invite email delivery) are proxied through existing Supabase Edge Functions instead. See [docs/WEB_LIMITATIONS.md](docs/WEB_LIMITATIONS.md).

| Variable                  | Purpose                                                        |
| -------------------------- | --------------------------------------------------------------- |
| `VITE_SUPABASE_URL`        | Supabase project URL                                            |
| `VITE_SUPABASE_ANON_KEY`   | Supabase anon/publishable key                                   |
| `VITE_APP_BASE_URL`        | This deployment's base URL, used to build invite/reset links    |

## Website: deployment

Deployed to GitHub Pages at the custom domain **vrc-ops.org**. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the full GitHub Pages + DNS + GitHub Desktop workflow.

## More documentation

- [Privacy Policy](PRIVACY_POLICY.md) — what data VRC collects, how it's used, and your rights.
- [Support](SUPPORT.md) — getting started, tips for common workflows, and troubleshooting.
- [docs/XCODE_SOURCE_ANALYSIS.md](docs/XCODE_SOURCE_ANALYSIS.md) — how the native app's screens, roles, data model, and business logic were mapped onto this website.
- [docs/WEB_LIMITATIONS.md](docs/WEB_LIMITATIONS.md) — what can't (or doesn't yet) run on GitHub Pages, and why.
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — GitHub Pages + custom domain deployment steps.
- [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md) — manual QA checklist by role.
