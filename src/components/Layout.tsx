import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { useTheme } from '@/hooks/useTheme'
import { ROLE_LABEL } from '@/permissions/resolver'
import { SiteFooter } from '@/components/LegalLinks'
import { ChampionAwardHost } from '@/components/ChampionAwardHost'
import { useEntitlement } from '@/hooks/useEntitlement'
import { isItemActive, mainNavigation, subNavigation } from '@/components/navigation'

export function Layout() {
  const { signOut } = useAuth()
  const { leagues, selectedLeague, selectLeague, permissions } = useLeagueSession()
  const { isDark, toggle: toggleTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)

  const { hasAccess } = useEntitlement()
  const { pathname } = useLocation()
  const navItems = mainNavigation(permissions)
  const activeItem = navItems.find((item) => isItemActive(item, pathname)) ?? null
  const subItems = activeItem ? subNavigation(activeItem.key, permissions) : []

  // Close the mobile menu whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:px-3 focus:py-2"
        style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
      >
        Skip to content
      </a>
      <header
        className="sticky top-0 z-20 border-b backdrop-blur"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'color-mix(in srgb, var(--color-surface) 92%, transparent)' }}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <button
            className="rounded-lg border px-2.5 py-1.5 text-sm lg:hidden"
            style={{ borderColor: 'var(--color-border)' }}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
          >
            ☰
          </button>
          <img src="/vrc-icon-512.png" alt="VRC Ops" className="h-9 w-9 rounded-lg" />

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

          <nav aria-label="Main" className="ml-auto hidden items-center gap-0.5 lg:flex">
            {navItems.map((item) => {
              const active = isItemActive(item, pathname)
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-medium ${active ? '' : 'opacity-70 hover:opacity-100'}`}
                  style={{
                    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? 'var(--color-accent-contrast)' : 'var(--color-text)',
                  }}
                >
                  {item.label}
                  {item.premium && !hasAccess && <span className="rounded bg-[var(--color-warning)] px-1 text-[10px] font-bold text-black">PRO</span>}
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-0">
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
          <nav id="mobile-navigation" aria-label="Main" className="flex flex-col gap-1 border-t px-4 py-2 lg:hidden" style={{ borderColor: 'var(--color-border)' }}>
            {navItems.map((item) => {
              const active = isItemActive(item, pathname)
              return (
                <Link
                  key={item.key}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium"
                  style={{
                    backgroundColor: active ? 'var(--color-accent)' : 'transparent',
                    color: active ? 'var(--color-accent-contrast)' : 'var(--color-text)',
                  }}
                >
                  {item.label}
                  {item.premium && !hasAccess && <span className="rounded bg-[var(--color-warning)] px-1 text-[10px] font-bold text-black">PRO</span>}
                </Link>
              )
            })}
          </nav>
        )}

        {subItems.length > 1 && (
          <nav aria-label={`${activeItem?.label} sections`} className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 pb-2">
            {subItems.map((sub) => (
              <NavLink
                key={sub.to}
                to={sub.to}
                end
                className="whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium"
                style={({ isActive }) => ({
                  borderColor: isActive ? 'var(--color-accent)' : 'var(--color-border)',
                  backgroundColor: isActive ? 'var(--color-accent)' : 'transparent',
                  color: isActive ? 'var(--color-accent-contrast)' : 'var(--color-text)',
                })}
              >
                {sub.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>
      <ChampionAwardHost />
      <SiteFooter />
    </div>
  )
}
