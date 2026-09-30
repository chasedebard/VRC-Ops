import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { applyAppearance, loadAppearance, saveAppearance, type AppearanceSettings, type ResolvedAccent } from '@/utils/theme'

/**
 * Shared appearance state (theme mode + accent source). One module-level store, so the header toggle, Settings ▸ Appearance and the public
 * legal page always agree; it persists to localStorage and re-applies the document classes / CSS variables on every change.
 */
let settings: AppearanceSettings = loadAppearance()
let championshipAccent: string | null = null
let lastResolved: ResolvedAccent = { hex: null, foreground: null, fellBack: false, adjusted: false }
const listeners = new Set<() => void>()

function emit() {
  lastResolved = applyAppearance(settings, championshipAccent)
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Applies the persisted appearance before first paint of the React tree (called from main.tsx). */
export function initAppearance(): void {
  settings = loadAppearance()
  lastResolved = applyAppearance(settings, championshipAccent)
}

export function setAppearance(next: AppearanceSettings): void {
  settings = next
  saveAppearance(next)
  emit()
}

export function setChampionshipAccent(hex: string | null): void {
  if (hex === championshipAccent) return
  championshipAccent = hex
  emit()
}

export function useAppearance() {
  const current = useSyncExternalStore(subscribe, () => settings)
  const accent = useSyncExternalStore(subscribe, () => lastResolved)
  const update = useCallback((patch: Partial<AppearanceSettings>) => setAppearance({ ...settings, ...patch }), [])

  // Follow the operating system while the mode is "system".
  useEffect(() => {
    if (current.mode !== 'system' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => emit()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [current.mode])

  return { settings: current, accent, update }
}
