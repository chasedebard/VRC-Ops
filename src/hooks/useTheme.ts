import { useAppearance } from '@/hooks/useAppearance'

/** Light/dark toggle (header and public legal page). The full appearance controls live in Settings ▸ Appearance. */
export function useTheme() {
  const { settings, update } = useAppearance()
  const systemDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
  const isDark = settings.mode === 'dark' || (settings.mode === 'system' && systemDark)
  return { isDark, toggle: () => update({ mode: isDark ? 'light' : 'dark' }) }
}
