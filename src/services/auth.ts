import { appBaseUrl, supabase } from '@/supabase/client'
import type { User } from '@supabase/supabase-js'

export type AuthState =
  | { kind: 'signedOut' }
  | { kind: 'awaitingVerification'; email: string }
  | { kind: 'recoveringPassword' }
  | { kind: 'authenticated'; user: User }

function isEmailValid(email: string): boolean {
  return email.trim().length > 0 && email.includes('@') && email.includes('.')
}

export async function restoreSession(): Promise<AuthState> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) return { kind: 'signedOut' }
  const user = data.session.user
  if (!user.email_confirmed_at && !user.confirmed_at) {
    return { kind: 'awaitingVerification', email: user.email ?? '' }
  }
  return { kind: 'authenticated', user }
}

export async function signIn(email: string, password: string): Promise<AuthState> {
  if (!isEmailValid(email)) throw new Error('Enter a valid email address.')
  if (!password) throw new Error('Enter your password.')

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  const user = data.user
  if (user && !user.email_confirmed_at && !user.confirmed_at) {
    return { kind: 'awaitingVerification', email }
  }
  return { kind: 'authenticated', user: user! }
}

export async function createAccount(
  email: string,
  password: string,
  confirmation: string,
): Promise<AuthState> {
  if (!isEmailValid(email)) throw new Error('Enter a valid email address.')
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')
  if (password !== confirmation) throw new Error('Passwords do not match.')

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${appBaseUrl}/auth/callback` },
  })
  if (error) throw error
  if (data.session && data.user?.email_confirmed_at) {
    return { kind: 'authenticated', user: data.user }
  }
  return { kind: 'awaitingVerification', email }
}

export async function sendPasswordRecovery(email: string): Promise<void> {
  if (!isEmailValid(email)) throw new Error('Enter a valid email address.')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appBaseUrl}/auth/callback?type=recovery`,
  })
  if (error) throw error
}

export async function updateRecoveredPassword(
  password: string,
  confirmation: string,
): Promise<AuthState> {
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')
  if (password !== confirmation) throw new Error('Passwords do not match.')
  const { data, error } = await supabase.auth.updateUser({ password })
  if (error) throw error
  return { kind: 'authenticated', user: data.user }
}

/** Handles the /auth/callback redirect target for both email verification and password recovery. */
export async function handleAuthCallback(url: string): Promise<AuthState> {
  const parsed = new URL(url)
  const type = parsed.searchParams.get('type')
  const code = parsed.searchParams.get('code')

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error
  }

  if (type === 'recovery') {
    return { kind: 'recoveringPassword' }
  }
  return restoreSession()
}

export async function signOut(): Promise<void> {
  supabase.removeAllChannels()
  await supabase.auth.signOut()
}

export function onAuthStateChange(callback: (state: AuthState) => void) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) {
      callback({ kind: 'signedOut' })
      return
    }
    const user = session.user
    if (!user.email_confirmed_at && !user.confirmed_at) {
      callback({ kind: 'awaitingVerification', email: user.email ?? '' })
      return
    }
    callback({ kind: 'authenticated', user })
  })
  return () => data.subscription.unsubscribe()
}
