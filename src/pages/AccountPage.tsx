import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Button } from '@/components/Button'
import { SubscriptionStatusCard } from '@/components/SubscriptionStatusCard'
import { ProfileCard } from '@/pages/account/ProfileCard'
import { ChangePasswordCard, TwoFactorCard } from '@/pages/account/SecurityCards'
import { ROLE_LABEL } from '@/permissions/resolver'
import { DeleteAccountCard } from '@/pages/account/DeleteAccountCard'
import { AppearanceCard } from '@/pages/account/AppearanceCard'
import { GAME_LABEL } from '@/config/featureRegistry'

function NavRow({ to, title, subtitle }: { to: string; title: string; subtitle: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-3 rounded-lg border p-3 transition hover:shadow-sm"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {subtitle}
        </span>
      </span>
      <span aria-hidden>›</span>
    </Link>
  )
}

/** Settings hub (iOS Settings ▸ Account / Appearance / Context / About). */
export default function AccountPage() {
  const { state, signOut } = useAuth()
  const { selectedLeague, leagues } = useLeagueSession()
  const location = useLocation()

  // Deep link from Legal & privacy ▸ Delete account.
  useEffect(() => {
    if (location.hash === '#delete-account') {
      document.getElementById('delete-account')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [location.hash])

  if (state.kind !== 'authenticated') return null

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <ProfileCard />

      <Card>
        <CardHeader>
          <CardTitle>Leagues</CardTitle>
        </CardHeader>
        <ul className="mb-3 space-y-1 text-sm">
          {leagues.map((l) => (
            <li key={l.league.id} className="flex items-center justify-between">
              <span>
                {l.league.name}
                {selectedLeague?.league.id === l.league.id && (
                  <span className="ml-2 text-xs" style={{ color: 'var(--color-accent)' }}>
                    Active
                  </span>
                )}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>{l.roles.map((r) => ROLE_LABEL[r]).join(', ')}</span>
            </li>
          ))}
        </ul>
        <NavRow to="/account/leagues" title="Switch, join or leave leagues" subtitle="Your leagues, active league, join or leave" />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
        </CardHeader>
        <SubscriptionStatusCard />
        <div className="mt-3">
          <NavRow to="/account/subscription" title="Subscription details" subtitle="Status, billing, and premium benefits" />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Global Rating</CardTitle>
        </CardHeader>
        <NavRow to="/account/global-rating" title="Global Rating" subtitle="Private cross-league rating participation" />
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Legal &amp; privacy</CardTitle>
        </CardHeader>
        <NavRow to="/account/legal" title="Legal & privacy" subtitle="Terms, privacy policy, consent, and account deletion" />
      </Card>

      <TwoFactorCard />
      <ChangePasswordCard />

      <AppearanceCard />

      <Card>
        <CardHeader>
          <CardTitle>Context</CardTitle>
        </CardHeader>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-3"><dt style={{ color: 'var(--color-text-muted)' }}>League</dt><dd className="font-medium">{selectedLeague?.league.name ?? 'None'}</dd></div>
          <div className="flex justify-between gap-3"><dt style={{ color: 'var(--color-text-muted)' }}>Role</dt><dd className="font-medium">{selectedLeague?.roles.map((r) => ROLE_LABEL[r]).join(' · ') ?? 'None'}</dd></div>
          <div className="flex justify-between gap-3"><dt style={{ color: 'var(--color-text-muted)' }}>Game</dt><dd className="font-medium">{GAME_LABEL.gran_turismo_7}</dd></div>
        </dl>
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          The active league scopes every page. Switch leagues from the header or under Leagues above.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          VRC Ops — league management and race control for sim racing. The website talks to the same Supabase backend as the
          iPhone, iPad and Mac apps; native-only features (live GT7 telemetry capture, photo results import) stay in the apps.
        </p>
        <p className="mt-2 text-sm">
          <Link to="/legal" className="font-semibold underline" style={{ color: 'var(--color-accent)' }}>
            Terms, privacy &amp; support
          </Link>
        </p>
        <Button variant="secondary" className="mt-3" onClick={() => signOut()}>
          Sign out
        </Button>
      </Card>

      <DeleteAccountCard />
    </div>
  )
}
