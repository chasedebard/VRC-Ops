import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getActiveLegalDocuments, acceptLegalDocument } from '@/services/legal'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { LoadingState } from '@/components/States'
import type { LegalDocumentVersionRow } from '@/types/database'

export default function LegalAcceptancePage() {
  const { refresh } = useLeagueSession()
  const [docs, setDocs] = useState<LegalDocumentVersionRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getActiveLegalDocuments().then(setDocs)
  }, [])

  const general = docs?.find((d) => d.doc_type === 'general')

  async function handleAccept() {
    if (!general) return
    setBusy(true)
    setError(null)
    try {
      await acceptLegalDocument(general.id, null)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record acceptance.')
    } finally {
      setBusy(false)
    }
  }

  if (!docs) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-lg">
        <h1 className="mb-3 text-xl font-bold">Terms &amp; conditions</h1>
        <div
          className="max-h-64 overflow-y-auto rounded-lg border p-3 text-sm"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
        >
          {general?.content ?? 'No terms document is currently published.'}
        </div>
        <p className="mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          You can also read the public <Link to="/legal#terms" className="font-semibold underline">Terms of Use</Link> and{' '}
          <Link to="/legal#privacy" className="font-semibold underline">Privacy Policy</Link>.
        </p>
        {error && <p className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <Button onClick={handleAccept} disabled={busy || !general} className="mt-4 w-full">
          {busy ? 'Saving…' : 'I agree, continue'}
        </Button>
      </Card>
    </div>
  )
}
