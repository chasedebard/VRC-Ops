/**
 * Plain-language reasons an invite link could not be accepted, from the guard tokens `vrc_accept_invitation_by_token` raises. The page used to
 * show the raw server message, which for a wrong email address read "INVITATION_EMAIL_MISMATCH".
 */
export interface InviteFailure {
  message: string
  advice: string
}

const KNOWN: Array<{ token: string; failure: InviteFailure }> = [
  {
    token: 'INVITATION_EMAIL_MISMATCH',
    failure: {
      message: 'This invite was sent to a different email address than the one you are signed in with.',
      advice: 'Sign out, then sign in or create an account with the address the invite was sent to, and open the invite link again.',
    },
  },
  {
    token: 'INVITATION_EXPIRED',
    failure: { message: 'This invite has expired.', advice: 'Ask your league admin to send you a new invite.' },
  },
  {
    token: 'INVITATION_REVOKED',
    failure: { message: 'This invite was cancelled by the league.', advice: 'Ask your league admin to send you a new invite.' },
  },
  {
    token: 'INVITATION_ALREADY_ACCEPTED',
    failure: {
      message: 'This invite has already been used.',
      advice: 'If that was you, you are already a member. Open your dashboard to find the league.',
    },
  },
  {
    token: 'INVALID_TOKEN',
    failure: {
      message: 'This invite link is not valid.',
      advice: 'Open the link from the invite email again, or ask your league admin to send a new invite.',
    },
  },
  {
    token: 'MFA_REQUIRED',
    failure: {
      message: 'Finish two-factor verification to accept this invite.',
      advice: 'Complete the verification when asked, then open the invite link again.',
    },
  },
]

export function describeInviteError(error: unknown): InviteFailure {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const found = KNOWN.find((entry) => text.includes(entry.token))
  if (found) return found.failure
  return {
    message: 'This invite could not be accepted.',
    advice: 'Open the link from the invite email again. If it still does not work, ask your league admin to send a new invite.',
  }
}
