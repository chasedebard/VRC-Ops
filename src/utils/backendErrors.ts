import {
  ACTIVE_SEASON_LIMIT_MESSAGE,
  OWNED_LEAGUE_LIMIT_MESSAGE,
  featureDefinition,
} from '@/config/featureRegistry'

/**
 * Friendly messages for the error tokens the VRC backend raises (Postgres `raise exception 'TOKEN'` and Edge
 * Function `{ "error": "TOKEN" }` bodies). Mirrors the token tables in iOS' VRCMembershipError, VRCResultsError,
 * VRCManagementError and VRCPredictionJobError so a failure reads the same on both platforms. Anything not mapped
 * is reported with one neutral message — raw PostgREST/transport detail is never shown to the user.
 */
const TOKENS: [string, string][] = [
  // Membership / invitations
  ['NOT_AUTHENTICATED', 'You need to be signed in.'],
  ['NOT_AUTHORIZED', 'You do not have permission to do that.'],
  ['LEAGUE_NAME_REQUIRED', 'Enter a league name.'],
  ['ROLES_REQUIRED', 'Select at least one role.'],
  ['INVITATION_NOT_FOUND', 'That invitation code was not found.'],
  ['INVITATION_REVOKED', 'That invitation has been revoked.'],
  ['INVITATION_EXPIRED', 'That invitation has expired.'],
  ['INVITATION_ALREADY_ACCEPTED', 'That invitation has already been used.'],
  ['INVITATION_EMAIL_MISMATCH', 'That invitation was sent to a different email address.'],
  ['ONLY_OWNER_CAN_GRANT_OWNER', 'Only an Owner can grant the Owner role.'],
  ['ONLY_OWNER_CAN_REMOVE_OWNER', 'Only an Owner can remove an Owner.'],
  ['LEAGUE_MUST_RETAIN_OWNER', 'A league must always keep at least one Owner.'],
  ['INVALID_TOKEN', 'That invite link is not valid.'],
  ['INVALID_ROLE', 'That role is not valid.'],
  ['INVALID_EMAIL', 'Enter a valid email address.'],
  ['INVITATION_NOT_EMAILED', 'That invitation was not sent by email.'],
  ['INVITATION_NOT_REISSUABLE', 'That invitation can no longer be resent.'],
  ['MFA_REQUIRED', 'Complete two-factor verification, then try again.'],
  ['PROVIDER_FAILURE', 'The invite email could not be sent. Please try again.'],
  ['RESEND_DOMAIN_NOT_VERIFIED', 'The invite email sender is not verified yet. Please try again later.'],
  ['PRO_LEAGUE_LIMIT_REACHED', OWNED_LEAGUE_LIMIT_MESSAGE],
  ['PRO_REQUIRED_MULTIPLE_LEAGUES', featureDefinition('multipleLeagues').message],
  ['LEAGUE_NOT_PENDING_SETUP', "This league's setup is already complete."],
  ['LEAGUE_PLUS_AT_CAPACITY', 'This league has used every League Plus seat. Free up a seat before adding another member.'],

  // Subscriptions / premium gates
  ['PRO_REQUIRED_MULTIPLE_ACTIVE_SEASONS', featureDefinition('multipleActiveSeasons').message],
  ['ACTIVE_SEASON_LIMIT_REACHED', ACTIVE_SEASON_LIMIT_MESSAGE],
  ['PRO_REQUIRED_PREDICTIONS', featureDefinition('predictions').message],
  ['PRO_REQUIRED', 'This feature requires VRC Ops Pro or a league with League Plus.'],
  ['AI_TERMS_REQUIRED', 'Accept the AI Features Consent to use predictions.'],

  // Results / lifecycle
  ['RESULT_VERSION_CONFLICT', 'The result changed on another device. The latest version has been loaded.'],
  ['ACTION_REQUIRES_MANAGER', 'Only an Owner or Admin can do that.'],
  ['REGION_REQUIRED', 'Set the event’s region before entering results.'],
  ['CLASS_REQUIRED', 'Add at least one class to the event before entering results.'],
  ['ROW_CLASS_REQUIRED', 'Assign a class to every result row before saving.'],
  ['INVALID_CLASS_FOR_EVENT', 'A result row uses a class that isn’t part of this event.'],
  ['NOT_LOCKED', 'This result isn’t locked.'],
  ['FINALIZE_REQUIRES_APPROVED', 'Approve (and lock) the result before finalizing.'],
  ['FINALIZE_REQUIRES_RACE_SET', 'Approve (and lock) the result before finalizing.'],
  ['REOPEN_REQUIRES_LOCKED_OR_FINAL', 'Only a locked or finalized result can be reopened.'],
  ['REOPEN_REASON_REQUIRED', 'Reopening a result requires a reason.'],
  ['RESULT_NOT_EDITABLE', 'Unlock this result before editing.'],
  ['INVALID_RESULT_TRANSITION', 'That is not a valid step from the current result state.'],
  ['UNKNOWN_RESULT_ACTION', 'That is not a valid step from the current result state.'],
  [
    'RACE_TIME_OR_GAP_REQUIRED',
    'Enter a total race time for each class winner, and a gap to the leader — a time behind or laps down — for every other classified finisher.',
  ],
  ['INVALID_LAP_GAP', 'Laps down must be a whole number of 1 or more.'],
  ['INVALID_TIME_GAP', 'Enter a valid time behind the leader.'],
  ['RACE_GAP_TYPE_VALUE_REQUIRED', 'A gap needs both a type and a value. Re-enter the gap for this driver.'],
  ['INVALID_RACE_GAP_TYPE', 'Unrecognized gap type. Re-enter the gap for this driver.'],
  [
    'RACE_RESULTS_MISSING_QUALIFYING_DRIVER',
    'Every driver from finalized qualifying must appear in the race result — add them (e.g. as DNS) before saving.',
  ],
  ['INVALID_WINNER_COUNT_FOR_CLASS', 'Each class needs exactly one classified P1 winner.'],
  ['GRID_SEED_CANNOT_BE_FINALIZED', 'Finish entering results for the auto-filled grid rows before saving.'],
  ['RACE_RESULTS_REQUIRED', 'Add at least one result row before saving.'],
  ['FINISH_POSITION_REQUIRED', 'Set a finish position for every classified or finished driver.'],
  ['UNCLASSIFIED_POSITION_FORBIDDEN', "DNS, DSQ, and Not Classified drivers can't have a finish position."],
  ['DUPLICATE_FINISH_POSITION', "Two drivers in the same class can't share a finish position."],
  ['DRIVER_REQUIRED', 'Every result row needs a driver assigned.'],
  ['WINNER_GAP_FORBIDDEN', "The class winner can't have a gap — enter their total race time instead."],
  ['NON_WINNER_TOTAL_RACE_TIME_FORBIDDEN', 'Only the class winner uses total race time — enter a gap for this driver instead.'],
  ['WINNER_MUST_BE_CLASSIFIED', 'The P1 finisher must be Finished or Classified, not DNS/DNF/DSQ.'],
  ['TEAM_NOT_IN_EVENT_SEASON', "That team isn't part of this event's season — pick a different team."],
  ['EVENT_NOT_FOUND', "This event couldn't be found. Refresh and try again."],

  // Management
  ['ROUND_CONFLICT', 'Another event already uses that round number in this season.'],
  ['SEASON_NEEDS_AT_LEAST_ONE_EVENT', 'Add at least one event before activating the season.'],
  ['SEASON_YEAR_REQUIRED', 'Set the season year before activating.'],
  ['CHAMPIONSHIP_NOT_FOUND', 'That championship no longer exists.'],
  ['DRIVER_NOT_FOUND', 'That driver profile no longer exists.'],
  ['ACCOUNT_NOT_IN_LEAGUE', 'That account is not a member of this league.'],
  ['ACCOUNT_ALREADY_ASSIGNED', 'That account is already linked to another driver profile in this league.'],
  ['uq_drivers_account_per_league', 'That account is already linked to another driver profile in this league.'],
  ['SELF_EDIT_FORBIDDEN_FIELD', 'Only an Owner or Admin can change those fields.'],
  ['DRIVER_HAS_LOCKED_RESULTS_ARCHIVE_INSTEAD', 'This driver has locked results, so archive them instead of deleting.'],
  ['CHAMPIONSHIP_NAME_REQUIRED', 'Enter a championship name.'],
  ['SEASON_NAME_REQUIRED', 'Enter a season name.'],
  ['CLASS_SELECTION_REQUIRED', 'Select at least one class, or turn classes off.'],
  ['REGION_SELECTION_REQUIRED', 'Select at least one region, or turn regions off.'],
  ['CLASS_NOT_IN_LEAGUE', 'A selected class or region does not belong to this league.'],
  ['REGION_NOT_IN_LEAGUE', 'A selected class or region does not belong to this league.'],
  ['INVALID_DATE_RANGE', 'The season start date must be on or before the end date.'],
  ['GT7_GROUP_SELECTION_REQUIRED', 'Select at least one GT7 group.'],
  ['GT7_GROUP_SELECTION_TOO_LARGE', 'A GT7 league can use at most all six groups.'],

  // Champion award (apple-champion-offer)
  [
    'APPLE_OFFER_NOT_CONFIGURED',
    "The App Store offer isn't available yet. Your Premium membership is active for the quarter — try the redemption again later.",
  ],

  // Global MMR participation
  ['mfa_required', 'Confirm a fresh two-factor code to change your Global Rating participation.'],
  ['account_mfa_required', 'Turn on two-factor authentication for your account before changing Global Rating participation.'],
  ['rate_limited', 'Too many changes just now. Wait a minute, then try again.'],
]

export const GENERIC_BACKEND_ERROR = 'Something went wrong. Please try again.'

/** Flattens whatever a supabase-js call threw (PostgrestError, FunctionsHttpError, Error, string) to searchable text. */
function errorText(error: unknown): string {
  if (error == null) return ''
  if (typeof error === 'string') return error
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    const parts = ['message', 'details', 'hint', 'code', 'error', 'error_description']
      .map((key) => record[key])
      .filter((value): value is string => typeof value === 'string')
    if (parts.length > 0) return parts.join(' ')
  }
  return error instanceof Error ? error.message : String(error)
}

/** True when the failure looks like a dropped connection rather than a server-side rejection. */
export function isNetworkError(error: unknown): boolean {
  const text = errorText(error).toLowerCase()
  return text.includes('failed to fetch') || text.includes('networkerror') || text.includes('network request failed') || text.includes('load failed')
}

export function backendErrorMessage(error: unknown, fallback: string = GENERIC_BACKEND_ERROR): string {
  const text = errorText(error)
  for (const [token, message] of TOKENS) {
    if (text.includes(token)) return message
  }
  if (isNetworkError(error)) return 'You appear to be offline. Check your connection and try again.'
  return fallback
}

/**
 * Edge Functions report failures as an HTTP body `{"error": "CODE"}`. `functions.invoke` surfaces that as a
 * FunctionsHttpError whose `context` is the raw Response — decode it first, then fall back to the token search.
 */
export async function functionErrorMessage(error: unknown, fallback: string = GENERIC_BACKEND_ERROR): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: string }
      if (body?.error) return backendErrorMessage(body.error, fallback)
    } catch {
      // not JSON — fall through
    }
    if (context.status === 401) return backendErrorMessage('MFA_REQUIRED', fallback)
  }
  return backendErrorMessage(error, fallback)
}
