import { useNavigate } from 'react-router-dom'
import LeagueSelectPage from '@/pages/onboarding/LeagueSelectPage'

/** Standalone /join route for an already-onboarded member joining an additional league. */
export default function JoinPage() {
  const navigate = useNavigate()
  return <LeagueSelectPage defaultTab="join" onDone={() => navigate('/dashboard')} />
}
