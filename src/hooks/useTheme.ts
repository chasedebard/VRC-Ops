import { useEffect, useState } from 'react'

const STORAGE_KEY = 'vrc-theme'

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function useTheme() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = () => {
      document.documentElement.classList.toggle('dark', systemPrefersDark())
      setIsDark(systemPrefersDark())
    }
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  function toggle() {
    const next = !isDark
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
    setIsDark(next)
  }

  return { isDark, toggle }
}
