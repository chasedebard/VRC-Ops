import { useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LEGAL_LINKS, SiteFooter } from '@/components/LegalLinks'
import { useTheme } from '@/hooks/useTheme'
import LegalText from '@/legal/LegalText'
import { LEGAL_TEXTS, type LegalDocumentId, type LegalLang } from '@/legal/documents'

const SUPPORT_EMAIL = 'debard.chase@outlook.com'
const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
const APPLE_EULA_GUIDANCE_URL =
  'https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement'
const LAST_UPDATED = 'July 13, 2026'

/** The four documents stored in Supabase, in the order people meet them. Their anchors keep the old ones (#privacy, #terms). */
const LEGAL_DOCUMENT_IDS: LegalDocumentId[] = ['privacy', 'terms', 'deterministic-features', 'data-and-sharing']
const SECTION_ANCHOR: Record<LegalDocumentId, string> = {
  privacy: 'privacy',
  terms: 'terms',
  'deterministic-features': 'deterministic-features',
  'data-and-sharing': 'data-and-sharing',
}

const COPY = {
  en: {
    heading: 'Legal, privacy & support',
    intro: 'Everything you need to understand the VRC Ops app and service—plus practical help when something is not working.',
    readSection: 'Read section ↓',
    onThisPage: 'On this page',
    language: 'Language',
    notice:
      'This French version was translated from the English by artificial intelligence. The French may therefore be inaccurate. Only the English version is accurate; the Terms of Service explain which version applies.',
    englishOnly: 'The EULA and Support sections are available in English only.',
    documents: {
      privacy: {
        number: '02',
        eyebrow: 'Your information',
        title: 'Privacy Policy',
        description: 'How VRC Ops collects, uses, shares, and protects personal information, for people in the United States, Canada (including Québec), and Australia.',
      },
      terms: {
        number: '03',
        eyebrow: 'Your agreement',
        title: 'Terms of Service',
        description: 'The rules for using VRC Ops: accounts, leagues, content, subscriptions, and your rights.',
      },
      'deterministic-features': {
        number: '04',
        eyebrow: 'Optional consent',
        title: 'Deterministic Features Consent',
        description: 'What the optional Predictions, Pit Wall, Race Engineer, and Capture features do, and what you agree to when you use them.',
      },
      'data-and-sharing': {
        number: '05',
        eyebrow: 'Optional consent',
        title: 'Data & Sharing Consent',
        description: 'What may be shared inside a league, what stays on your device, and what happens to shared information if you delete your account.',
      },
    },
  },
  fr: {
    heading: 'Juridique, confidentialité et assistance',
    intro: 'Tout ce qu’il faut pour comprendre l’application et le service VRC Ops, et de l’aide concrète quand quelque chose ne fonctionne pas.',
    readSection: 'Lire la section ↓',
    onThisPage: 'Sur cette page',
    language: 'Langue',
    notice:
      'Cette version française a été traduite de l’anglais à l’aide de l’intelligence artificielle. Le français peut donc comporter des inexactitudes. Seule la version anglaise est exacte; les conditions d’utilisation expliquent quelle version s’applique.',
    englishOnly: 'Le CLUF et la section Assistance sont disponibles en anglais seulement.',
    documents: {
      privacy: {
        number: '02',
        eyebrow: 'Vos renseignements',
        title: 'Politique de confidentialité',
        description: 'Comment VRC Ops recueille, utilise, communique et protège les renseignements personnels, pour les personnes aux États-Unis, au Canada (y compris au Québec) et en Australie.',
      },
      terms: {
        number: '03',
        eyebrow: 'Votre accord',
        title: 'Conditions d’utilisation',
        description: 'Les règles d’utilisation de VRC Ops : comptes, ligues, contenu, abonnements et vos droits.',
      },
      'deterministic-features': {
        number: '04',
        eyebrow: 'Consentement facultatif',
        title: 'Consentement aux fonctionnalités déterministes',
        description: 'Ce que font les fonctions facultatives de prédictions, de Pit Wall, d’Ingénieur de course et de Capture, et ce que vous acceptez en les utilisant.',
      },
      'data-and-sharing': {
        number: '05',
        eyebrow: 'Consentement facultatif',
        title: 'Consentement aux données et au partage',
        description: 'Ce qui peut être partagé au sein d’une ligue, ce qui reste sur votre appareil et ce qui arrive aux renseignements partagés si vous supprimez votre compte.',
      },
    },
  },
} as const

function chooseLanguage(search: string): LegalLang {
  const requested = new URLSearchParams(search).get('lang')
  if (requested === 'fr' || requested === 'en') return requested
  const preferred = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language ?? '') : ''
  return preferred.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

const DOCUMENTS = [
  {
    id: 'eula',
    number: '01',
    title: 'EULA',
    description: 'The license for the VRC Ops app on Apple platforms.',
  },
  {
    id: 'support',
    number: '06',
    title: 'Support',
    description: 'Setup help, troubleshooting, and contact information.',
  },
] as const

function MailLink({ children = SUPPORT_EMAIL }: { children?: ReactNode }) {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`}>
      {children}
    </a>
  )
}

function DocumentSection({
  id,
  eyebrow,
  title,
  description,
  showLastUpdated = true,
  children,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
  /** The four stored documents carry their own "Last updated" line. */
  showLastUpdated?: boolean
  children: ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-28 rounded-2xl border p-5 shadow-sm sm:p-8"
      style={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)' }}
    >
      <div className="mb-7 border-b pb-6" style={{ borderColor: 'var(--color-border)' }}>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: 'var(--color-accent)' }}>
          {eyebrow}
        </p>
        <h2 id={`${id}-title`} className="text-2xl font-bold tracking-tight sm:text-3xl">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: 'var(--color-text-muted)' }}>
          {description}
        </p>
        {showLastUpdated && (
          <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Last updated <time dateTime="2026-07-13">{LAST_UPDATED}</time>
          </p>
        )}
      </div>
      <div className="legal-copy">{children}</div>
    </section>
  )
}

function useLegalPageMetadata() {
  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Legal & Support | VRC Ops'

    const metadata = [
      ['name', 'description', 'VRC Ops EULA, Privacy Policy, Terms of Service, consents, and Support.'],
      ['property', 'og:title', 'Legal & Support | VRC Ops'],
      ['property', 'og:description', 'VRC Ops EULA, Privacy Policy, Terms of Service, consents, and Support.'],
      ['property', 'og:url', 'https://vrc-ops.org/legal'],
      ['property', 'og:image', 'https://vrc-ops.org/legal-og.png'],
      ['name', 'twitter:card', 'summary_large_image'],
    ] as const

    const snapshots = metadata.map(([attribute, key, content]) => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
      const created = !element
      if (!element) {
        element = document.createElement('meta')
        element.setAttribute(attribute, key)
        document.head.appendChild(element)
      }
      const previousContent = element.getAttribute('content')
      element.setAttribute('content', content)
      return { element, created, previousContent }
    })

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    const canonicalCreated = !canonical
    const previousCanonical = canonical?.getAttribute('href') ?? null
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }
    canonical.href = 'https://vrc-ops.org/legal'

    return () => {
      document.title = previousTitle
      snapshots.forEach(({ element, created, previousContent }) => {
        if (created) {
          element.remove()
        } else if (previousContent === null) {
          element.removeAttribute('content')
        } else {
          element.setAttribute('content', previousContent)
        }
      })
      if (canonicalCreated) {
        canonical.remove()
      } else if (previousCanonical === null) {
        canonical.removeAttribute('href')
      } else {
        canonical.href = previousCanonical
      }
    }
  }, [])
}

export default function LegalSupportPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isDark, toggle: toggleTheme } = useTheme()
  const lang = chooseLanguage(location.search)
  const copy = COPY[lang]
  const cards = [
    DOCUMENTS[0],
    ...LEGAL_DOCUMENT_IDS.map((id) => ({
      id: SECTION_ANCHOR[id],
      number: copy.documents[id].number,
      title: copy.documents[id].title,
      description: copy.documents[id].description,
    })),
    DOCUMENTS[1],
  ]
  useLegalPageMetadata()

  const chooseLang = (next: LegalLang) => {
    const params = new URLSearchParams(location.search)
    params.set('lang', next)
    navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: location.hash }, { replace: true })
  }

  useEffect(() => {
    if (!location.hash) return
    const id = decodeURIComponent(location.hash.slice(1))
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [location.hash])

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#legal-content"
        className="fixed left-3 top-3 z-50 -translate-y-24 rounded-lg px-3 py-2 text-sm font-semibold focus:translate-y-0"
        style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
      >
        Skip to content
      </a>

      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'color-mix(in srgb, var(--color-surface) 92%, transparent)',
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2">
            <img src="/vrc-icon-512.png" alt="" className="h-9 w-9 rounded-lg" />
            <span className="truncate font-semibold">VRC Ops</span>
          </Link>
          <span className="hidden text-sm sm:inline" style={{ color: 'var(--color-text-muted)' }}>
            Legal &amp; Support
          </span>
          <div className="ml-auto flex items-center gap-2">
            <div role="group" aria-label={copy.language} className="flex overflow-hidden rounded-lg border text-sm" style={{ borderColor: 'var(--color-border)' }}>
              {(['en', 'fr'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => chooseLang(code)}
                  aria-pressed={lang === code}
                  lang={code}
                  aria-label={code === 'en' ? 'English' : 'Français'}
                  className="px-2.5 py-1.5 font-medium"
                  style={
                    lang === code
                      ? { backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }
                      : undefined
                  }
                >
                  <span aria-hidden="true" className="sm:hidden">{code.toUpperCase()}</span>
                  <span className="hidden sm:inline">{code === 'en' ? 'English' : 'Français'}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg border px-2.5 py-1.5 text-sm"
              style={{ borderColor: 'var(--color-border)' }}
              aria-label={isDark ? 'Use light theme' : 'Use dark theme'}
              title={isDark ? 'Use light theme' : 'Use dark theme'}
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            <Link
              to="/"
              className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium sm:px-3.5"
              style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
            >
              Open VRC Ops
            </Link>
          </div>
        </div>
      </header>

      <main id="legal-content" className="flex-1" tabIndex={-1}>
        <div className="mx-auto max-w-7xl px-4 py-10 sm:py-14">
          <div className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: 'var(--color-accent)' }}>
              The fine print, made readable
            </p>
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{copy.heading}</h1>
            <p className="mt-4 text-base leading-7 sm:text-lg" style={{ color: 'var(--color-text-muted)' }}>
              {copy.intro}
            </p>
            {lang === 'fr' && (
              <p
                role="note"
                lang="fr"
                className="mt-5 rounded-xl border p-4 text-sm leading-6"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-raised)' }}
              >
                {copy.notice} {copy.englishOnly}
              </p>
            )}
          </div>

          <nav aria-label="On this page" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((document) => (
              <a
                key={document.id}
                href={`#${document.id}`}
                className="group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2"
                style={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)' }}
              >
                <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                  {document.number}
                </span>
                <span className="mt-3 block font-semibold">{document.title}</span>
                <span className="mt-1 block text-sm leading-5" style={{ color: 'var(--color-text-muted)' }}>
                  {document.description}
                </span>
                <span className="mt-4 block text-sm font-medium group-hover:underline">{copy.readSection}</span>
              </a>
            ))}
          </nav>

          <div className="mt-10 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
            <aside className="hidden lg:sticky lg:top-24 lg:block">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: 'var(--color-text-muted)' }}>
                {copy.onThisPage}
              </p>
              <nav aria-label="Document sections" className="space-y-1">
                {LEGAL_LINKS.map((item) => (
                  <a
                    key={item.to}
                    href={item.to.slice('/legal'.length)}
                    className="block rounded-lg px-3 py-2 text-sm font-medium hover:underline"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
              <div className="mt-6 rounded-xl border p-4 text-sm" style={{ borderColor: 'var(--color-border)' }}>
                <p className="font-semibold">Need a person?</p>
                <p className="mt-1 leading-5" style={{ color: 'var(--color-text-muted)' }}>
                  Email <MailLink /> for best-effort support.
                </p>
              </div>
            </aside>

            <article className="min-w-0 space-y-8">
              <DocumentSection
                id="eula"
                eyebrow="App license"
                title="End User License Agreement"
                description="Apple’s standard agreement governs the license to VRC Ops on iPhone, iPad, and Mac."
              >
                <p>
                  VRC Ops does not currently provide a custom end user license agreement for its iOS, iPadOS, or macOS applications. The license to those applications is governed by Apple’s <strong>Standard Licensed Application End User License Agreement</strong>.
                </p>
                <p>
                  Apple states that its Standard EULA applies automatically when an app provider does not supply a custom EULA. The Standard EULA covers the software license, permitted use, termination, external services, warranty disclaimers, liability, export compliance, and related app-license terms.
                </p>
                <div className="not-prose mt-6 flex flex-wrap gap-3">
                  <a
                    href={APPLE_EULA_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold"
                    style={{ backgroundColor: 'var(--color-accent)', color: 'var(--color-accent-contrast)' }}
                  >
                    Read Apple’s Standard EULA ↗
                  </a>
                  <a
                    href={APPLE_EULA_GUIDANCE_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-lg border px-4 py-2.5 text-sm font-semibold"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    Apple’s EULA guidance ↗
                  </a>
                </div>
                <h3>How this differs from the Terms of Service</h3>
                <p>
                  Apple’s Standard EULA governs the license to the Apple-platform app software. The VRC Ops <a href="#terms">Terms of Service</a> separately govern accounts, leagues, online services, user content, and subscriptions.
                </p>
              </DocumentSection>

              {LEGAL_DOCUMENT_IDS.map((id) => (
                <DocumentSection
                  key={id}
                  id={SECTION_ANCHOR[id]}
                  eyebrow={COPY[lang].documents[id].eyebrow}
                  title={COPY[lang].documents[id].title}
                  description={COPY[lang].documents[id].description}
                  showLastUpdated={false}
                >
                  <LegalText text={LEGAL_TEXTS[id][lang]} lang={lang} />
                </DocumentSection>
              ))}

              <DocumentSection
                id="support"
                eyebrow="Help center"
                title="VRC Ops Support"
                description="Practical guidance for common setup, league, account, and subscription issues."
              >
                <p>
                  VRC Ops is maintained by an independent developer without a dedicated support team or guaranteed response time. For account, app, website, or purchase help, email <MailLink />. Support is provided on a best-effort basis.
                </p>

                <h3>Before contacting support</h3>
                <p>
                  Include the platform you are using (iPhone, iPad, Mac, or web), what you expected to happen, what happened instead, and any error message you saw. Do not send your password, one-time authentication codes, full payment details, or other secrets.
                </p>
                <p>
                  For roster changes, role changes, disputed results, schedules, or other league decisions, contact your league Owner or Admin first. VRC Ops support cannot decide or override a league’s sporting or administrative decisions.
                </p>

                <h3>Getting started</h3>
                <ol>
                  <li><strong>Create or join a league.</strong> If someone invited you, open the invitation email and follow its link.</li>
                  <li><strong>Verify your email.</strong> Check spam or junk folders if the verification message does not arrive within a few minutes.</li>
                  <li><strong>Complete your profile.</strong> Add a display name. Drivers should ask a league Admin to connect their account to the correct driver profile.</li>
                  <li><strong>Check your role.</strong> Available actions depend on whether you are an Owner, Admin, Marshal, Driver, or Viewer.</li>
                </ol>

                <h3>Common workflows</h3>
                <h4>Setting up a season</h4>
                <ul>
                  <li>Create a championship before adding seasons beneath it.</li>
                  <li>Set the championship’s game early because it determines the track catalog.</li>
                  <li>Decide whether the championship will use class, region, or team standings before entering results.</li>
                </ul>
                <h4>Running a race weekend</h4>
                <ul>
                  <li>Enter and mark qualifying results Official before entering race results when the event uses qualifying.</li>
                  <li>Use DNS, DNF, DSQ, and other result statuses instead of omitting a driver.</li>
                  <li>Review fastest lap, penalties, and grid adjustments before marking results Official.</li>
                </ul>
                <h4>Standings and predictions</h4>
                <ul>
                  <li>Standings update from Official results.</li>
                  <li>Class, region, and team views appear only when enabled for the championship.</li>
                  <li>Predictions depend on the completeness and accuracy of the league’s historical data and are estimates, not guaranteed outcomes.</li>
                </ul>
                <h4>Capture telemetry</h4>
                <ul>
                  <li>Your device and supported console or telemetry source generally need to be on the same local network.</li>
                  <li>Raw telemetry remains on your device; only minimal derived summaries may sync to VRC Ops.</li>
                </ul>

                <h3>Troubleshooting</h3>
                <h4>I did not receive a verification or password-reset email</h4>
                <p>
                  Check spam or junk, confirm you used the intended email address, and request a new message from the app or website. Only the newest link may remain valid.
                </p>
                <h4>My league invitation does not work</h4>
                <p>
                  Invitation links are tied to the invited email address and may expire or become invalid after use. Sign in with the invited address or ask the league Owner or Admin to send a new invitation.
                </p>
                <h4>My results or standings are missing</h4>
                <p>
                  Confirm the relevant result set is marked Official and that you are viewing the intended championship and season. Ask a league Marshal, Admin, or Owner to review the source results.
                </p>
                <h4>A feature or tab is missing</h4>
                <p>
                  Some features depend on championship settings, your league role, or an active VRC Ops Pro or VRC League Plus entitlement. Ask a league Admin to confirm your role and configuration.
                </p>
                <h4>My subscription is not showing on the website</h4>
                <p>
                  Confirm you are signed into the same VRC Ops account used in the Apple-platform app, then use the subscription refresh option in Settings. Apple manages billing and cancellation. If the entitlement still does not appear, email support with the product name and approximate purchase date, but do not send full payment details.
                </p>

                <h3>Account deletion and privacy requests</h3>
                <p>
                  You can start account deletion from Settings in the app or website. If you are the sole Owner of a league, you must first transfer ownership or otherwise resolve the league. For help with deletion or a privacy request, email <MailLink />.
                </p>

                <h3>Contact</h3>
                <p>
                  Email: <MailLink />
                </p>
                <p>
                  This address is also the contact for security and privacy reports. Please provide enough detail to reproduce a technical issue while avoiding passwords, authentication codes, or other secrets.
                </p>
              </DocumentSection>
            </article>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  )
}
