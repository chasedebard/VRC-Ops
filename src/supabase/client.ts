import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.',
  )
}

// Row/Insert/Update types for every table live in src/types/database.ts and are
// applied per-query via `.returns<T[]>()` (see src/services/*) rather than as a
// single generated `Database` generic — these types were hand-derived from the
// Supabase migration SQL, not `supabase gen types`, see docs/XCODE_SOURCE_ANALYSIS.md.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export const appBaseUrl = import.meta.env.VITE_APP_BASE_URL || window.location.origin
