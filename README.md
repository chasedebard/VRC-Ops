# VRC — Virtual Race Control

**League management and race control for sim racing, done properly.**

VRC (also known as RFS Race Control) is an iOS, iPadOS, and macOS app for running sim‑racing leagues and championships end to end — from setting up a season, to running qualifying and race sessions, to publishing standings and results your drivers can actually trust.

This repository is the **documentation and operations hub** for the app. It does not contain application source code — see [PRIVACY_POLICY.md](PRIVACY_POLICY.md) and [SUPPORT.md](SUPPORT.md) for the other documents kept here.

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

- iOS
- iPadOS
- macOS

## Backend

VRC is backed by Supabase: Postgres with row-level security, authentication, file storage (for driver photos and similar assets), and edge functions/scheduled jobs for things like league invite email delivery.

## More documentation

- [Privacy Policy](PRIVACY_POLICY.md) — what data VRC collects, how it's used, and your rights.
- [Support](SUPPORT.md) — getting started, tips for common workflows, and troubleshooting.
