/**
 * Supabase/PostgREST errors (relationship errors, RLS denials, constraint
 * violations) must never reach production UI verbatim — they can leak schema
 * details and aren't meaningful to end users. Log the real error for
 * developers, return a generic caller-supplied fallback for display.
 */
export function toSafeErrorMessage(err: unknown, fallback: string): string {
  console.error(err)
  return fallback
}
