import { supabase } from '@/supabase/client'

/**
 * Web-only MFA enforcement: TOTP via Supabase Auth's built-in MFA support
 * (no backend schema/RLS changes, so the native iOS/Android apps — which
 * don't check the Authenticator Assurance Level — are completely
 * unaffected). Enforcement itself lives in src/hooks/useMfaGate.ts, which
 * ProtectedLayout consults before rendering anything past email
 * verification.
 */

export interface EnrolledFactor {
  id: string
  friendlyName: string | null
  createdAt: string
}

export async function listTotpFactors(): Promise<EnrolledFactor[]> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return data.totp
    .filter((f) => f.status === 'verified')
    .map((f) => ({ id: f.id, friendlyName: f.friendly_name ?? null, createdAt: f.created_at }))
}

export type AssuranceLevel = string | null

export async function getAssuranceLevel(): Promise<{
  current: AssuranceLevel
  next: AssuranceLevel
}> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error) throw error
  return { current: data.currentLevel, next: data.nextLevel }
}

export interface EnrollmentChallenge {
  factorId: string
  qrCodeSvg: string
  secret: string
}

/**
 * Starts (or resumes) TOTP enrollment. Abandoned attempts — e.g. React
 * StrictMode double-invoking the enrolling effect in dev, or a user closing
 * the tab mid-setup — leave behind `unverified` factors that GoTrue then
 * rejects new enroll() calls against with `mfa_factor_name_conflict`
 * (duplicate empty friendly name). Clear any stale unverified factors first
 * so enrollment is always resumable.
 */
export async function beginEnrollment(): Promise<EnrollmentChallenge> {
  const { data: existing, error: listError } = await supabase.auth.mfa.listFactors()
  if (listError) throw listError
  const stale = existing.all.filter((f) => f.factor_type === 'totp' && f.status === 'unverified')
  await Promise.all(stale.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })))

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `authenticator-${Date.now()}`,
  })
  if (error) throw error
  return { factorId: data.id, qrCodeSvg: data.totp.qr_code, secret: data.totp.secret }
}

/** Verifies the 6-digit code for a freshly-enrolled factor, completing enrollment. */
export async function confirmEnrollment(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeError) throw challengeError
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  })
  if (error) throw error
}

/** Verifies a 6-digit code for an already-enrolled factor on a new session (step-up to aal2). */
export async function verifyChallenge(factorId: string, code: string): Promise<void> {
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
  if (challengeError) throw challengeError
  const { error } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code,
  })
  if (error) throw error
}

export async function unenrollFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}
