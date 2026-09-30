import { Link, useNavigate } from 'react-router-dom'
import LeagueSelectPage from '@/pages/onboarding/LeagueSelectPage'

/** Standalone /join route for an already-onboarded member joining or creating an additional league. */
export default function JoinPage() {
  const navigate = useNavigate()
  return (
    <div>
      <Link to="/account/leagues" className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
        ← Leagues
      </Link>
      <LeagueSelectPage onDone={() => navigate('/dashboard')} />
    </div>
  )
}
