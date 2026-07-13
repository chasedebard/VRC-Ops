import { Link } from 'react-router-dom'

export const LEGAL_LINKS = [
  { to: '/legal#eula', label: 'EULA' },
  { to: '/legal#privacy', label: 'Privacy' },
  { to: '/legal#terms', label: 'Terms' },
  { to: '/legal#support', label: 'Support' },
] as const

interface LegalLinksProps {
  className?: string
}

export function LegalLinks({ className = '' }: LegalLinksProps) {
  return (
    <nav
      aria-label="Legal and support"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ${className}`}
      style={{ color: 'var(--color-text-muted)' }}
    >
      {LEGAL_LINKS.map((item) => (
        <Link key={item.to} to={item.to} className="rounded underline-offset-4 hover:underline focus-visible:outline-2">
          {item.label}
        </Link>
      ))}
    </nav>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t" style={{ borderColor: 'var(--color-border)' }}>
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          © {new Date().getFullYear()} VRC Ops
        </p>
        <LegalLinks />
      </div>
    </footer>
  )
}
