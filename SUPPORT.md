# Support

## No formal support system — yet

VRC (Virtual Race Control / RFS Race Control) is currently **run without a dedicated support team, ticketing system, or guaranteed response time.** There's no help desk to file a ticket with and no SLA. This document is here to help you get unstuck yourself, and to point you toward the right person when self-service isn't enough.

If you're looking for a live community or official contact channel, that's currently a placeholder — see [Getting further help](#getting-further-help) below.

## Getting started

1. **Create or join a league.** A league is the top-level container for a sim-racing series. If someone invited you, look for an invitation email and follow the link to accept it.
2. **Verify your email.** New accounts need to verify the email address used to sign up before you can fully access league data. If you don't see the verification email within a few minutes, check spam/junk folders.
3. **Complete your profile.** Add a display name and, if you're a driver, ask your league Admin to link you to a driver profile so your results and standings show up correctly under your account.
4. **Check your role.** What you can do in a league (Owner, Admin, Marshal, Driver, Viewer) depends on the role assigned to you by the league's Owner/Admin. If a feature seems missing, it may simply be gated to a different role.

## Tips & tricks for common workflows

### Setting up a season
- Create your championship first, then add one or more seasons underneath it.
- A championship's **game** (e.g. which sim it's run on) drives which track catalog you'll see when scheduling events — set it early, since changing it later is a guarded action.
- Decide up front whether you'll use class, region, and/or team standings — turning these on affects which tabs and breakdowns appear throughout the app.

### Adding tracks
- Tracks are shared per game in a track library, so you may not need to add anything — check the catalog first.
- If you need to add many tracks at once, use **bulk import** (JSON/Markdown/text file) instead of adding them one at a time. Review the parsed list before confirming — bulk-imported tracks are inserted directly, so double-check names and layouts before you submit.

### Running a race weekend
- Enter **qualifying results first.** Race weekends generally expect an "Official" qualifying set before race entry opens up, and **pole position for the race auto-fills from qualifying P1** — so getting qualifying right saves you a manual correction later.
- When entering race results, use the proper status codes (DNS, DNF, DSQ, etc.) rather than leaving a driver off the sheet entirely — this keeps standings math and driver history accurate.
- Fastest lap and grid/penalty adjustments are supported per result — fill these in if your league scores or displays them.

### Standings, predictions & viewing
- Standings are computed automatically from your Official results — they won't reflect a result set until it's marked Official.
- Class, region, and team standings only appear if your championship has those breakdowns enabled.
- Predictions/forecasts are computed from the data already in your league (past results, current standings) — the more complete your qualifying/race history, the more meaningful the forecast.
- If an AI-assisted prediction feature is involved, you may need to accept an in-app consent prompt before it becomes available.

### Using Capture (telemetry)
- Capture parses local telemetry summaries (for example, from Gran Turismo 7 on a PS5 on your local network) to help fill in lap/pace data.
- You'll typically need to point the App at your console's IP address on the same local network.
- Only a minimal summary is used to enrich results — raw telemetry stays on your device.

## Troubleshooting

**I didn't get my email verification link.**
Check spam/junk. Make sure you're checking the inbox for the exact address you signed up with. If it still hasn't arrived after a while, try requesting it again from the sign-in screen.

**My league invite isn't working.**
Invite links are tied to the email address they were sent to and expire after a period of time. If a link has expired or was already used, ask the league Owner/Admin to send a new invitation.

**My results/standings aren't showing up.**
Results generally need to be marked **Official** before they flow into standings and public views. If you just entered a result and don't see it reflected yet, check its status with your league's Marshal/Admin.

**A tab or feature I expect isn't there.**
Some sections (like class/region/team standings, or certain championship-level features) only appear when the relevant championship setting is enabled, and some actions are limited to certain roles (Owner/Admin/Marshal). If you believe you should have access, ask your league Owner/Admin to check your role and the championship's feature settings.

**I need something changed in my league (roster, roles, results, etc.).**
That's league-specific data controlled by your league's own staff, not by the app maintainers. See below.

## League-specific issues: contact your league admin

Most day-to-day questions — roster changes, role changes, disputed results, schedule changes — are decisions made by **your league's own Owner or Admin**, not by the people who build the App. Reach out to whoever runs your league directly; they have the tools to fix rosters, results, invitations, and permissions themselves.

## Getting further help

There is currently no official support inbox, ticketing system, or community server for the App. A placeholder is listed below — treat it as **not yet active** until your league or the app maintainer tells you otherwise:

- **Placeholder contact/community:** `SUPPORT_CONTACT_PLACEHOLDER` (e.g. a future support email or Discord server — to be filled in once one exists)

If you're a league Owner/Admin evaluating this project, consider standing up your own community channel (Discord, forum, etc.) for your drivers in the meantime.
