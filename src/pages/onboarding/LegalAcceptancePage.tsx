import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { LEGAL_DOC_LABEL } from '@/utils/legalState'
import type { LegalDocumentVersionRow } from '@/types/database'

/**
 * Blocks normal access until every currently-required general-access document (Terms of Service and
 * Privacy Policy) is accepted — mirrors iOS `VRCLegalGateView`. A newly published required version
 * triggers re-acceptance because its id is not in the accepted set. AI and Sharing consent are NOT
 * requested here; they are asked for only when those features are used (see `FeatureLegalGate`).
 */
export default function LegalAcceptancePage() {
  const { signOut } = useAuth()
  const { pendingLegalDocuments, acceptLegal, refresh } = useLeagueSession()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleAccept(doc: LegalDocumentVersionRow) {
    setBusyId(doc.id)
    setError(null)
    try {
      await acceptLegal(doc)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record acceptance.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg space-y-4">
        <div>
          <h1 className="text-xl font-bold">Before you continue</h1>
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Review and accept the following before continuing.
          </p>
        </div>

        {pendingLegalDocuments.length === 0 ? (
          <Card>
            <p className="text-sm font-medium">Terms unavailable</p>
            <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
              The required documents could not be loaded. Try again.
            </p>
            <Button variant="secondary" onClick={() => void refresh()}>
              Try again
            </Button>
          </Card>
        ) : (
          pendingLegalDocuments.map((doc) => (
            <Card key={doc.id}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{LEGAL_DOC_LABEL[doc.doc_type]}</h2>
                <Badge tone="accent">v{doc.version}</Badge>
              </div>
              <div
                tabIndex={0}
                aria-label={`${LEGAL_DOC_LABEL[doc.doc_type]} text`}
                className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border p-3 text-sm"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                {doc.content}
              </div>
              <Button onClick={() => handleAccept(doc)} disabled={busyId !== null} className="mt-3 w-full">
                {busyId === doc.id ? 'Saving…' : doc.doc_type === 'privacy' ? 'I acknowledge' : 'I agree'}
              </Button>
            </Card>
          ))
        )}

        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          AI and Sharing consent are requested only when you use those features. You can also read the public{' '}
          <Link to="/legal#terms" className="font-semibold underline">
            Terms of Use
          </Link>{' '}
          and{' '}
          <Link to="/legal#privacy" className="font-semibold underline">
            Privacy Policy
          </Link>
          .
        </p>
        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
            {error}
          </p>
        )}
        <Button variant="secondary" onClick={() => signOut()} className="w-full">
          Sign out
        </Button>
      </div>
    </div>
  )
}
