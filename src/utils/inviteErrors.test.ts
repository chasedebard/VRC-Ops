import { describe, expect, it } from 'vitest'
import { describeInviteError } from '@/utils/inviteErrors'

describe('describeInviteError', () => {
  it.each([
    ['INVITATION_EMAIL_MISMATCH', 'different email address'],
    ['INVITATION_EXPIRED', 'expired'],
    ['INVITATION_REVOKED', 'cancelled'],
    ['INVITATION_ALREADY_ACCEPTED', 'already been used'],
    ['INVALID_TOKEN', 'not valid'],
    ['MFA_REQUIRED', 'two-factor'],
  ])('explains %s without showing the raw code', (token, phrase) => {
    const failure = describeInviteError(new Error(`rpc failed: ${token}`))
    expect(failure.message).toContain(phrase)
    expect(failure.message).not.toContain(token)
    expect(failure.advice.length).toBeGreaterThan(10)
  })

  it('falls back to a general message for anything else, whatever was thrown', () => {
    for (const thrown of [new Error('network down'), 'oops', null, undefined, { code: 42 }]) {
      expect(describeInviteError(thrown).message).toBe('This invite could not be accepted.')
    }
  })

  it('reads a plain string error too', () => {
    expect(describeInviteError('INVITATION_EXPIRED').message).toContain('expired')
  })
})
