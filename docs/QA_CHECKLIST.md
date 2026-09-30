# QA Checklist

Manual QA checklist for vrc-ops.org, organized by role and area. Check items off against a real
(non-production-critical) test league where possible.

## Authentication

- [ ] Sign up with a new email creates an account and shows "check your email".
- [ ] Sign in with an unverified account shows the "verify your email" gate, not the dashboard.
- [ ] Clicking the verification email link opens `https://vrc-ops.org/auth/callback` (never
      localhost), establishes a session, and reaches the dashboard or the correct onboarding gate.
- [ ] A verification link sent after starting from `/invite/:token` returns to that invite after
      confirmation and accepts it once the session is established.
- [ ] Sign in with correct credentials reaches the dashboard (or onboarding gate, if new).
- [ ] Sign in with wrong password shows an inline error, not a crash.
- [ ] "Forgot password" sends a reset email; the reset link reaches `/reset-password/update` and
      a new password actually works on the next sign-in.
- [ ] Sign out clears the session and redirects to `/login`.

## Two-factor authentication (web-only requirement)

- [ ] A verified sign-in with no enrolled authenticator is forced into the "Set up two-factor
      authentication" screen before reaching anything else — not skippable via URL navigation.
- [ ] The QR code renders as an actual scannable image (not literal text/broken image).
- [ ] Entering a valid 6-digit code from the authenticator app completes enrollment and proceeds
      to the dashboard/onboarding gate.
- [ ] Signing out and back in with an enrolled account shows "Enter your authenticator code"
      (challenge), not the enrollment screen again.
- [ ] An invalid/expired code shows an inline error and does not proceed.
- [ ] Account settings lists enrolled authenticator device(s) with a "Remove" option and an "Add
      another device" flow; removing the only device forces re-enrollment on the next sign-in.
- [ ] A session that has not completed MFA sees the enrollment/challenge screen, never empty pages
      (the backend also rejects it with a restrictive `aal2` RLS policy).
- [ ] Global Rating participation, the permanent driver ⇄ account link and the champion Apple offer each ask for a
      fresh authenticator code immediately before the action.
- [ ] Refreshing any authenticated route preserves the session (no forced re-login).
- [ ] Visiting a protected route while signed out redirects to `/login`, not a blank page.

## Onboarding / league gate

- [ ] New account without a display name is shown the profile-completion screen before anything else.
- [ ] New account without legal acceptance is shown the terms screen before league selection.
- [ ] A brand-new user with zero leagues sees "Create league" / "Join with code", not an empty dashboard.
- [ ] Creating a league makes the caller Owner and lands them in the dashboard.
- [ ] Joining with an invite code grants exactly the roles that were assigned (there are no separate viewer codes any more).
- [ ] An account that has not accepted the current Terms + Privacy sees the legal gate before anything else; AI / Sharing consent is asked only when a feature needs it.
- [ ] An Owner whose league is still in guided setup resumes it (GT7 groups → championship → season) or cancels it.

## Invite flow

- [ ] `/invite/:token` while signed out shows a sign-in/sign-up prompt, not an error.
- [ ] Signing in from that prompt automatically completes the invite acceptance afterward.
- [ ] `/invite/:token` with an expired/invalid token shows a clear error and a link to `/join`.
- [ ] `/join` lets an already-onboarded member join an *additional* league without disrupting their current one.
- [ ] Admin can generate a code-only invite and see the code displayed.
- [ ] Admin can send an email invite and see a send-status confirmation.
- [ ] Admin can resend and revoke a pending invitation.

## Admin/Owner

- [ ] Create a championship through the guided flow; edit identity/colours and feature toggles; status badge reflects `draft/active/paused/...`.
- [ ] Hidden registry features (AI, replay is "Coming soon") never appear as available toggles; other games are disabled.
- [ ] Create a season, then "Set active" — confirm the previously active season is deactivated.
- [ ] Delete a championship (Owner only) and confirm it disappears from the list; an Admin sees no delete control.
- [ ] Add a driver, toggle inactive/active, confirm inactive drivers disappear from the
      qualifying/results driver picker but remain visible (marked inactive) in `/drivers`.
- [ ] Add a track manually; bulk-import a small CSV and confirm the row count matches.
- [ ] Add/toggle a class and a region.
- [ ] Add/remove a member role; confirm role changes take effect without a page reload (or after one refresh).
- [ ] Remove a member; confirm they disappear from the member list.
- [ ] Attempt account deletion while owning a league with other members — confirm it's blocked
      with a clear "transfer ownership" prompt, and that transferring then unblocks deletion.

## Driver

- [ ] Driver role does **not** see the Administration nav item.
- [ ] Driver can view Race Weekend, Race Prep, Qualifying, Results, Standings, Predictions, and their own profile.
- [ ] Driver cannot submit qualifying/race results (form fields disabled or hidden).

## Viewer

- [ ] Viewer sees only read-only views across Championship, Race Weekend, Standings, Predictions, Drivers.
- [ ] Viewer never sees any create/edit/delete controls anywhere in the app.

## Marshal

- [ ] Marshal sees Race Weekend/qualifying/results entry controls (canSubmitResults) but not
      Administration or championship/season/driver/track/class/region management screens.
- [ ] Marshal can transition race control state (start qualifying → end qualifying → ready → start race → end race).

## Race weekend / results / standings

- [ ] Race Weekend hub highlights the correct current/upcoming event (today-or-later; falls back
      to the latest incomplete event once the calendar is finished).
- [ ] Race Prep leaderboard sorts by fastest average lap, then fastest lap, then laps completed,
      matching the native app's ordering; drivers without practice data sort to the bottom.
- [ ] Race Prep's "Capture history" section is visible to Driver/Admin/Marshal/Owner but hidden
      for Viewers, and lists each individual uploaded capture (not just the pooled leaderboard)
      with phase, lap breakdown, confidence, and validation status.
- [ ] Entering qualifying times and saving assigns pole to P1 automatically.
- [ ] Manually marking a different driver's pole in Results overrides the qualifying auto-pole.
- [ ] Saving race results updates `/standings` immediately (overall, then class/region/team tabs
      if the championship enables them).
- [ ] Clinched/eliminated badges appear correctly once the math supports them.
- [ ] Results audit log (Owner/Admin only, linked from the Results screen) lists every
      submit/approve/lock/reopen for that event's result sets.
- [ ] Standings rows show an up/down movement arrow (or "Even") reflecting the change since the
      previous saved snapshot, per driver.
- [ ] Driver avatars appear next to names in Drivers, Standings, Race Prep, Qualifying, and
      Results rows — a photo if one's set, otherwise consistent initials on a colored circle.

## Predictions

- [ ] Predictions page shows the server-calculated race markets (pole, fastest lap, podium, winner) for the current race once a run exists.
- [ ] Confidence badge is "low" early in a season and rises as more races complete.
- [ ] Forecasts are read from the server (no odds are computed in the browser); an Owner/Admin "Request recompute" queues a
      fresh run and the page updates.
- [ ] Without Pro / League Plus the page shows the subscribe-in-the-app state; without current AI consent it shows the
      consent prompt and reads nothing.
- [ ] Championship forecast section shows a narrative, magic number, and clinched/eliminated
      badges once at least 2 official races are complete; Overall/Class/Regional tabs each show
      the correct scoped standings and narrative.
- [ ] Driver profile shows a points-trend chart (once 2+ races) with a form label ("Win streak
      pressure", "Podium form", "Improving finishes", "Recent dip", or "Stable form").

## Driver profile

- [ ] Same canonical profile appears whether reached from Drivers list, Standings, or Race Prep.
- [ ] Career stats (starts/wins/podiums/poles/fastest laps/avg finish) match the sum of the race
      history table shown below them.
- [ ] Inactive driver's profile still shows full career history.

## Responsiveness & accessibility

- [ ] Layout works at mobile (375px), tablet (768px), and desktop (1280px+) widths.
- [ ] Mobile nav (hamburger) opens/closes and links work.
- [ ] Text contrast is readable in both light and dark mode (toggle via the header button).
- [ ] No debug/developer-only labels are visible anywhere in the UI.
- [ ] Empty states appear (not blank screens) for: no leagues, no championships, no seasons, no
      events, no drivers, no practice data, no standings, no predictions.

## Supabase / RLS

- [ ] A Viewer's browser session cannot successfully call any manager-only RPC (e.g.
      `vrc_add_role`) even if attempted directly — should fail server-side, not just be hidden client-side.
- [ ] A user cannot see another league's data by guessing an ID in the URL (RLS should return
      zero rows, not an error leaking existence).

## GitHub Pages deployment

- [ ] `https://www.vrc-ops.org/...` redirects to the matching non-www `https://vrc-ops.org/...`
      route.

- [ ] `npm run build` succeeds locally with the real Supabase env vars.
- [ ] The Actions workflow run succeeds on push to `main`.
- [ ] https://vrc-ops.org serves the app after DNS propagates, over HTTPS.
- [ ] A hard refresh on a deep route (e.g. `/standings`) does not 404 (verifies `404.html` SPA fallback).

## iOS parity additions

### Home
- [ ] The next-race hero shows "Practice / Qualifying / Race is live" only from the session state, and a whole-day countdown (no hours).
- [ ] A linked driver sees the driver section (performance, championship battle, recent form, quick actions) and no generic Quick Actions card.
- [ ] Owner/Admin see leaders, season progress, driver spotlight and needs-attention; a Marshal sees the review queue and penalties.
- [ ] A viewer sees neither Race Weekend, Pit Wall nor Administration in the navigation, and `/admin` shows "Restricted".

### Race weekend
- [ ] Owner/Admin/Marshal can Open Practice → Start Qualifying; Start Race is blocked until qualifying is Official (Owner/Admin can use an authorized override with a reason).
- [ ] Cancel / Postpone ask for confirmation; every transition appears in the Session audit.
- [ ] Race Prep lets staff mark a driver DNS; DNS drivers sort last and are recorded as DNS when results are finalized.
- [ ] Qualifying and Results mention that photo import is an iPhone/iPad feature.

### Drivers
- [ ] A free account sees the season card, recent form and the Pro upsell; a Pro account also sees Season/Career analytics and the full race log.
- [ ] Trophy Case shows tiers, gemstones and progress; a title is counted once even if it is both computed and awarded.
- [ ] A linked driver can edit only self-service fields in My Driver; photo changes require the Sharing Terms.
- [ ] Owner/Admin can approve or decline a number request, assign a league account, and create the permanent Global Rating link only after a fresh authenticator code.

### Administration and setup
- [ ] Members: adding/removing roles and removing a member each confirm first; only an Owner can grant the Owner role.
- [ ] Invitations: create by email or code (with optional expiry), copy a code, resend, revoke.
- [ ] Announcements: post, edit, delete; every member sees them on Home.
- [ ] New race: requires a track, distance and (when classes are on) a class; the race name is generated from the track; a duplicate round is rejected.
- [ ] Activating a second season is blocked with an explanation on the free tier and above the plan limit.

### Settings
- [ ] Appearance: theme mode and accent source persist; a low-contrast accent is adjusted (not rejected) and the page stays readable in both themes.
- [ ] Delete account: an Owner with shared leagues must choose a new owner per league; the password and the word DELETE are both required.

### Pit Wall
- [ ] With Pro / League Plus, Pit Wall shows the current weekend's programme, engineering call, setup and captured runs read-only; without a started weekend it says to start one in the app.
- [ ] Without Pro / League Plus it shows the subscribe-in-the-app state.
