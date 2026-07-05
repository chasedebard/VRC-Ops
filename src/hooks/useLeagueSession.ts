import { useContext } from 'react'
import { LeagueSessionContext } from '@/app/LeagueSessionProvider'

export function useLeagueSession() {
  const ctx = useContext(LeagueSessionContext)
  if (!ctx) throw new Error('useLeagueSession must be used within LeagueSessionProvider')
  return ctx
}
