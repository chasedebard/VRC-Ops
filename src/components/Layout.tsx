import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useTheme } from '@/hooks/useTheme'
import { ROLE_LABEL } from '@/permissions/resolver'

interface NavItem {
  to: string
  label: string
  show: boolean
}

export function Layout() {
  const { signOut } = useAuth()
  const { leagues, selectedLeague, selectLeague, permissions } = useLeagueSession()
  const { isDark, toggle: toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  const navItems: NavItem[] = [
    { to: '/dashboard', label: 'Home', show: true },
    { to: '/championships', label: 'Championship', show: true },
    { to: '/race-weekend', label: 'Race Weekend', show: true },
    { to: '/standings', label: 'Standings', show: true },
    { to: '/predictions', label: 'Predictions', show: true },
    { to: '/drivers', label: 'Drivers', show: true },
    { to: '/tracks', label: 'Tracks', show: true },
    { to: '/admin', label: 'Administration', show: permissions.usesAdminShell },
    { to: '/account', label: 'Settings', show: true },
  ]

  return (
    <div className="min-h-screen">
      <header
        className="sticky top-0 z-20 border-b backdrop-blur"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'color-mix(in srgb, var(--color-surface) 92%, transparent)' }}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button
            className="rounded-lg border px-2.5 py-1.5 text-sm md:hidden"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <img src="/vrc-icon-512.png" alt="" className="h-7 w-7 rounded-md" />
            VRC Ops
          </span>

          {leagues.length > 0 && (
            <select
              className="ml-2 rounded-lg border bg-transparent px-2 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
              value={selectedLeague?.league.id ?? ''}
              onChange={(e) => selectLeague(e.target.value)}
            >
              {leagues.map((l) => (
                <option key={l.league.id} value={l.league.id}>
                  {l.league.name}
                </option>
              ))}
            </select>
          )}

          <nav className="ml-auto hidden items-center gap-1 md:flex">
            {navItems
              .filter((item) => item.show)
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? '' : 'opacity-70 hover:opacity-100'}`
                  }
                  style={({ isActive }) => ({
                    backgroundColor: isActive ? 'var(--color-accent)' : 'transparent',
                    color: isActive ? 'var(--color-accent-contrast)' : 'var(--color-text)',
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
          </nav>

          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {selectedLeague && (
              <span className="hidden text-xs sm:inline" style={{ color: 'var(--color-text-muted)' }}>
                {selectedLeague.roles.map((r) => ROLE_LABEL[r]).join(' · ')}
              </span>
            )}
            <button
              onClick={toggleTheme}
              className="rounded-lg border px-2.5 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
              aria-label="Toggle dark mode"
              title="Toggle dark mode"
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            <button
              onClick={() => signOut()}
              className="rounded-lg border px-3 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
            >
              Sign out
            </button>
          </div>
        </div>

        {menuOpen && (
          <nav className="flex flex-col gap-1 border-t px-4 py-2 md:hidden" style={{ borderColor: 'var(--color-border)' }}>
            {navItems
              .filter((item) => item.show)
              .map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium"
                >
                  {item.label}
                </NavLink>
              ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
