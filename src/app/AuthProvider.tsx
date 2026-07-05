import { createContext, useEffect, useState, type ReactNode } from 'react'
import type { AuthState } from '@/services/auth'
import { onAuthStateChange, restoreSession, signOut as signOutService } from '@/services/auth'

interface AuthContextValue {
  state: AuthState
  loading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ kind: 'signedOut' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    restoreSession()
      .then(setState)
      .finally(() => setLoading(false))

    return onAuthStateChange((next) => {
      setState(next)
      setLoading(false)
    })
  }, [])

  async function refresh() {
    setState(await restoreSession())
  }

  async function signOut() {
    await signOutService()
    setState({ kind: 'signedOut' })
  }

  return (
    <AuthContext.Provider value={{ state, loading, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
