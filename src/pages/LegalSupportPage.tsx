import { useEffect, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LEGAL_LINKS, SiteFooter } from '@/components/LegalLinks'
import { useTheme } from '@/hooks/useTheme'

const SUPPORT_EMAIL = 'povchaos@gmail.com'
const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
const APPLE_EULA_GUIDANCE_URL =
  'https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement'
const LAST_UPDATED = 'July 13, 2026'

const DOCUMENTS = [
  {
    id: 'eula',
    number: '01',
    title: 'EULA',
    description: 'The license for the VRC Ops app on Apple platforms.',
  },
  {
    id: 'privacy',
    number: '02',
    title: 'Privacy Policy',
    description: 'What VRC Ops collects, why it is used, and your choices.',
  },
  {
    id: 'terms',
    number: '03',
    title: 'Terms of Use',
    description: 'Rules for accounts, leagues, content, and subscriptions.',
  },
  {
    id: 'support',
    number: '04',
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
  children,
}: {
  id: string
  eyebrow: string
  title: string
  description: string
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
        <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          Last updated <time dateTime="2026-07-13">{LAST_UPDATED}</time>
        </p>
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
      ['name', 'description', 'VRC Ops EULA, Privacy Policy, Terms of Use, and Support.'],
      ['property', 'og:title', 'Legal & Support | VRC Ops'],
      ['property', 'og:description', 'VRC Ops EULA, Privacy Policy, Terms of Use, and Support.'],
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
  const { isDark, toggle: toggleTheme } = useTheme()
  useLegalPageMetadata()

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
              className="rounded-lg px-3.5 py-2 text-sm font-medium"
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
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Legal, privacy &amp; support</h1>
            <p className="mt-4 text-base leading-7 sm:text-lg" style={{ color: 'var(--color-text-muted)' }}>
              Everything you need to understand the VRC Ops app and service—plus practical help when something is not working.
            </p>
          </div>

          <nav aria-label="On this page" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DOCUMENTS.map((document) => (
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
                <span className="mt-4 block text-sm font-medium group-hover:underline">Read section ↓</span>
              </a>
            ))}
          </nav>

          <div className="mt-10 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
            <aside className="hidden lg:sticky lg:top-24 lg:block">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em]" style={{ color: 'var(--color-text-muted)' }}>
                On this page
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
                <h3>How this differs from the Terms of Use</h3>
                <p>
                  Apple’s Standard EULA governs the license to the Apple-platform app software. The VRC Ops <a href="#terms">Terms of Use</a> separately govern accounts, leagues, online services, user content, and subscriptions.
                </p>
              </DocumentSection>

              <DocumentSection
                id="privacy"
                eyebrow="Your information"
                title="Privacy Policy"
                description="How VRC Ops handles information across the Apple-platform apps, website, and backend services."
              >
                <p>
                  This Privacy Policy explains how VRC Ops (also known as Virtual Race Control or RFS Race Control) collects, uses, stores, and protects information when you use the VRC Ops iOS, iPadOS, or macOS applications, the website at vrc-ops.org, and associated backend services (together, the <strong>Service</strong>).
                </p>
                <p>If you have questions or want to exercise a privacy right, email <MailLink />.</p>

                <h3>1. Who we are</h3>
                <p>
                  VRC Ops is operated by <strong>Chase DeBard</strong>, an independent developer based in Pennsylvania, United States. In this policy, “VRC Ops,” “we,” “us,” and “our” refer to that operator.
                </p>

                <h3>2. Information we collect</h3>
                <h4>Account and authentication data</h4>
                <p>
                  When you create an account, we collect your email address and authentication information needed to sign you in. Authentication is handled by Supabase. We do not store your plaintext password. The website may store session tokens and your light or dark theme preference in browser storage so you can remain signed in and keep your display preference.
                </p>
                <h4>Profile and driver data</h4>
                <p>
                  We collect profile details you choose to provide, such as your display name. If you or a league administrator creates a driver profile, we may also store a driver’s name, team, class, region, season assignments, and an optional uploaded driver photo.
                </p>
                <h4>League, event, and results data</h4>
                <p>
                  We store data that you and your league staff enter to operate a league, including championships, seasons, tracks, events, race weekends, qualifying and race results, lap times, penalties, DNS/DNF/DSQ status, pole position, fastest lap, and standings computed from that data. This information is generally visible to members of the same league according to their assigned role and the league’s settings.
                </p>
                <h4>Telemetry capture summaries</h4>
                <p>
                  The optional Capture feature can parse telemetry from supported sources that you connect to on your local network. Raw telemetry artifacts are processed and retained locally on your device. Only minimal derived summaries, such as classified lap information, may be synced to our backend to support results and analytics. We do not upload raw telemetry captures.
                </p>
                <h4>Predictions and assisted features</h4>
                <p>
                  The Service may provide predictions or forecasts derived from league data. When a feature requires consent, the Service presents a consent prompt before it is enabled. Prediction runs or evaluations initiated by authorized league staff may be stored to provide and improve the feature.
                </p>
                <h4>Invitations and consent records</h4>
                <p>
                  When a league Owner or Admin invites someone, we process the invited email address and a securely hashed invitation token to deliver and validate the invitation. When the Service asks for consent, we record the decision and when it was given or withdrawn so we can honor that choice.
                </p>
                <h4>Subscription and purchase records</h4>
                <p>
                  Apple processes payments for VRC Ops Pro and VRC League Plus. We may receive and store limited purchase records needed to verify and provide access, such as product and transaction identifiers, purchase and expiration dates, renewal state, environment, and subscription status. We do not receive or store your full payment-card details.
                </p>
                <h4>Diagnostic and technical information</h4>
                <p>
                  We may process basic error, security, and technical records needed to operate and protect the Service. We do not use third-party advertising trackers and do not sell personal information.
                </p>

                <h3>3. How we use information</h3>
                <p>We use information to:</p>
                <ul>
                  <li>create, secure, and authenticate accounts;</li>
                  <li>operate league-management features, including rosters, events, results, standings, and invitations;</li>
                  <li>provide features you choose to use, including Capture, predictions, and subscription benefits;</li>
                  <li>maintain the security, integrity, and reliability of the Service;</li>
                  <li>respond to support and privacy requests; and</li>
                  <li>comply with legal obligations.</li>
                </ul>

                <h3>4. Legal bases for processing</h3>
                <p>Where laws such as the EU or UK GDPR apply, we rely on:</p>
                <ul>
                  <li><strong>Contract:</strong> processing needed to provide the Service you request;</li>
                  <li><strong>Consent:</strong> processing for optional features that ask for consent;</li>
                  <li><strong>Legitimate interests:</strong> security, fraud prevention, service reliability, and improvement; and</li>
                  <li><strong>Legal obligation:</strong> processing required to comply with applicable law.</li>
                </ul>
                <p>
                  You may withdraw consent for consent-based features at any time. Withdrawal does not affect processing that already occurred while consent was valid.
                </p>

                <h3>5. Service providers</h3>
                <p>We use service providers to operate VRC Ops:</p>
                <ul>
                  <li><strong>Supabase</strong> provides authentication, database hosting, file storage, and backend functions.</li>
                  <li><strong>Resend</strong> delivers transactional emails such as league invitations.</li>
                  <li><strong>Apple</strong> distributes the Apple-platform apps and processes App Store purchases and subscriptions.</li>
                </ul>
                <p>
                  These providers process information under their own terms and privacy commitments and only as needed to provide their services. We do not share personal information with third parties for their own advertising.
                </p>

                <h3>6. Sharing within a league</h3>
                <p>
                  VRC Ops is a multi-user league-management service. Information entered by you or other league members—such as driver profiles, schedules, results, and standings—is generally visible to other members of that league according to their roles and the league’s configuration. League Owners and Admins control membership and role assignments.
                </p>

                <h3>7. Security</h3>
                <p>
                  We use reasonable technical and organizational safeguards, including encrypted transport, access controls, hashed invitation tokens, and database row-level security designed to limit access by league and role. No transmission or storage method is completely secure, so we cannot guarantee absolute security.
                </p>

                <h3>8. Retention</h3>
                <p>
                  We retain personal information while your account or league membership is active and as needed to provide the Service, resolve disputes, enforce agreements, and comply with law. Raw telemetry artifacts remain on your device. Retention periods can vary based on the type of record and why it is needed.
                </p>

                <h3>9. Account deletion</h3>
                <p>The Service provides an in-app account deletion flow. When deletion is completed:</p>
                <ul>
                  <li>authentication credentials are removed;</li>
                  <li>personal identifiers associated with the account are deleted or anonymized where reasonably possible;</li>
                  <li>storage objects tied only to the account are removed;</li>
                  <li>a sole league Owner must resolve league ownership before deletion can finish; and</li>
                  <li>historical league records may be retained in anonymized form when needed to preserve completed results and other members’ standings.</li>
                </ul>
                <p>You can start deletion in account settings or email <MailLink /> for help.</p>

                <h3>10. Children’s privacy</h3>
                <p>
                  The Service is not directed to children under 13, or the higher minimum age required by local law. We do not knowingly collect personal information from children below the applicable minimum age. Contact us if you believe a child has provided personal information so we can investigate and take appropriate action.
                </p>

                <h3>11. Your rights</h3>
                <p>
                  Depending on where you live, you may have rights to access, correct, delete, or receive a copy of personal information; restrict or object to certain processing; and withdraw consent. Email <MailLink /> to make a request. We may need to verify your identity before fulfilling it. You may also have the right to complain to your local data-protection authority.
                </p>

                <h3>12. International transfers</h3>
                <p>
                  VRC Ops and its providers may process information in the United States and other countries. Where applicable law requires safeguards for an international transfer, we rely on the provider’s applicable contractual and legal transfer mechanisms.
                </p>

                <h3>13. Changes to this policy</h3>
                <p>
                  We may update this Privacy Policy as the Service changes. We will revise the “Last updated” date and may provide an in-app notice when a change is material. Your continued use after an update takes effect is subject to the updated policy.
                </p>

                <h3>14. Contact</h3>
                <p>
                  <strong>Chase DeBard</strong><br />
                  Pennsylvania, United States<br />
                  <MailLink />
                </p>
              </DocumentSection>

              <DocumentSection
                id="terms"
                eyebrow="Service agreement"
                title="Terms of Use"
                description="The terms for VRC Ops accounts, leagues, content, online services, and subscriptions."
              >
                <p>
                  These Terms of Use (<strong>Terms</strong>) govern your use of the VRC Ops iOS, iPadOS, and macOS applications, the website at vrc-ops.org, and associated services (together, the <strong>Service</strong>). VRC Ops is also known as Virtual Race Control or RFS Race Control.
                </p>
                <p>By creating an account, accessing, or using the Service, you agree to these Terms. If you do not agree, do not use the Service.</p>

                <h3>1. Operator and scope</h3>
                <p>
                  The Service is operated by <strong>Chase DeBard</strong>, an independent developer based in Pennsylvania, United States. These Terms govern accounts, league features, content, subscriptions, and online services. Apple’s Standard End User License Agreement separately governs the license to Apple-platform app software.
                </p>

                <h3>2. Eligibility and authority</h3>
                <p>
                  You must be at least 13 years old, or the higher minimum age required where you live. If you use the Service for a league, team, or other organization, you represent that you have authority to act for it and to bind it to these Terms where applicable.
                </p>

                <h3>3. Accounts and security</h3>
                <p>
                  Provide accurate account information and keep it current. You are responsible for activity under your account and for protecting your password and authentication factors. Notify us promptly at <MailLink /> if you suspect unauthorized access. Do not share authentication codes or attempt to access another person’s account.
                </p>

                <h3>4. Leagues, roles, and administration</h3>
                <p>
                  League Owners and Admins control membership, roles, settings, schedules, and league content. Marshals and other roles have the permissions assigned by the Service and league administrators. League decisions—including stewarding, penalties, schedules, eligibility, and published results—belong to the league, not VRC Ops. We may not be able to resolve disputes between league members.
                </p>

                <h3>5. Your content</h3>
                <p>
                  You retain ownership of content you submit, such as league names, driver profiles, photos, schedules, and results. You grant VRC Ops a non-exclusive, worldwide, royalty-free license to host, copy, process, display, and transmit that content only as needed to operate, secure, and improve the Service.
                </p>
                <p>
                  You represent that you have the rights and permissions needed to submit the content and to make it available to the relevant league members. Do not upload content that violates another person’s privacy, publicity, intellectual-property, or other rights.
                </p>

                <h3>6. Acceptable use</h3>
                <p>You may not:</p>
                <ul>
                  <li>use the Service for unlawful, fraudulent, abusive, threatening, or harassing activity;</li>
                  <li>interfere with the Service, probe for vulnerabilities without permission, bypass access controls, or introduce malicious code;</li>
                  <li>scrape, copy, or extract data at scale except through features or interfaces we authorize;</li>
                  <li>impersonate another person or misrepresent your role or affiliation;</li>
                  <li>manipulate results, telemetry, predictions, subscription status, or permissions through unauthorized means; or</li>
                  <li>use the Service in a way that infringes another person’s rights or materially harms other users.</li>
                </ul>

                <h3>7. Racing data and predictions</h3>
                <p>
                  VRC Ops helps leagues record and calculate racing information, but league staff remain responsible for reviewing source data and deciding what is Official. Results, standings, forecasts, telemetry summaries, and other outputs can be incomplete or incorrect due to source data, configuration, network conditions, or software errors.
                </p>
                <p>
                  Predictions are estimates for informational and entertainment purposes. They do not guarantee outcomes and must not be used for gambling, safety-critical decisions, or real-world vehicle operation. The Service is not a substitute for official sporting regulations, stewarding judgment, or track-safety systems.
                </p>

                <h3>8. Subscriptions and purchases</h3>
                <p>
                  VRC Ops may offer auto-renewable products such as <strong>VRC Ops Pro</strong> for an individual account and <strong>VRC League Plus</strong> for eligible league-wide features. Purchases are offered through Apple and are associated with the VRC Ops account and entitlement described at purchase.
                </p>
                <p>
                  Apple processes payment, renewal, cancellation, and refunds under the terms shown in the App Store. Manage or cancel a subscription through your Apple account settings. Deleting VRC Ops or your VRC Ops account does not itself cancel an Apple subscription.
                </p>
                <p>
                  Subscription access may take time to synchronize across the app, website, and backend. Access can end when a subscription expires, is refunded or revoked, or cannot be verified. Prices, trial or promotional terms, billing periods, and included features are disclosed at purchase and may change for future billing periods as permitted by Apple and applicable law.
                </p>

                <h3>9. Third-party services</h3>
                <p>
                  The Service relies on or links to third-party services, including Apple, Supabase, and Resend. Their services are governed by their own terms and privacy policies. We are not responsible for third-party services outside our control.
                </p>

                <h3>10. Privacy</h3>
                <p>Our <a href="#privacy">Privacy Policy</a> explains how we handle information. By using the Service, you acknowledge that policy.</p>

                <h3>11. VRC Ops intellectual property</h3>
                <p>
                  The Service, its software, design, branding, and documentation—excluding your content and third-party materials—are owned by the operator or licensed to us and are protected by applicable law. Except for rights expressly granted by these Terms or the applicable EULA, no rights are transferred to you.
                </p>

                <h3>12. Feedback</h3>
                <p>
                  If you voluntarily send ideas or feedback, you grant us permission to use them without restriction or compensation. This does not transfer ownership of content you submit for normal league use.
                </p>

                <h3>13. Availability and changes</h3>
                <p>
                  We may add, change, suspend, or discontinue features and may impose reasonable limits to protect the Service. We do not promise that the Service will always be available, uninterrupted, secure, or error-free. We may release updates that are required for continued use.
                </p>

                <h3>14. Suspension, termination, and deletion</h3>
                <p>
                  You may stop using the Service at any time and may request account deletion through Settings. We may restrict or terminate access when reasonably necessary to address a Terms violation, security risk, legal requirement, nonpayment, or harm to the Service or others.
                </p>
                <p>
                  Account deletion does not automatically remove every historical league record. Completed results and related records may be retained in anonymized form to preserve other members’ standings and league history. Sections that by their nature should survive termination—including intellectual property, disclaimers, liability limits, and dispute provisions—will survive.
                </p>

                <h3>15. Disclaimers</h3>
                <p>
                  To the maximum extent permitted by law, the Service is provided <strong>“as is”</strong> and <strong>“as available.”</strong> We disclaim implied warranties of merchantability, fitness for a particular purpose, quiet enjoyment, and non-infringement. Nothing in these Terms excludes warranties or consumer rights that cannot lawfully be excluded.
                </p>

                <h3>16. Limitation of liability</h3>
                <p>
                  To the maximum extent permitted by law, VRC Ops and its operator will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenue, data, goodwill, or business interruption arising from the Service.
                </p>
                <p>
                  To the maximum extent permitted by law, total liability for claims arising from the Service will not exceed the greater of (a) the amount you paid for the Service during the 12 months before the event giving rise to the claim or (b) US $50. These limits do not apply where liability cannot legally be limited.
                </p>

                <h3>17. Governing law and disputes</h3>
                <p>
                  These Terms are governed by the laws of the Commonwealth of Pennsylvania, without regard to conflict-of-law rules, except where the mandatory law of your place of residence applies. Before filing a claim, you agree to contact <MailLink /> and attempt an informal resolution. Nothing in this section prevents either party from seeking urgent relief or using a small-claims process where eligible.
                </p>

                <h3>18. Changes to these Terms</h3>
                <p>
                  We may update these Terms as the Service changes. We will revise the “Last updated” date and may provide an in-app notice when a change is material. Continued use after updated Terms take effect constitutes acceptance where permitted by law. If applicable law requires affirmative consent, we will request it.
                </p>

                <h3>19. Contact</h3>
                <p>
                  <strong>Chase DeBard</strong><br />
                  Pennsylvania, United States<br />
                  <MailLink />
                </p>
              </DocumentSection>

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
