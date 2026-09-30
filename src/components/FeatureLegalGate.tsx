import { useState, type ReactNode } from 'react'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/States'
import { activeDocument, hasAcceptedCurrentDoc, LEGAL_DOC_LABEL } from '@/utils/legalState'
import type { LegalDocType } from '@/types/database'

/**
 * Feature-level legal gate (mirror of iOS `VRCFeatureLegalGate`). If the active required version of
 * `docType` is not accepted, the feature content is replaced with an acceptance prompt; declining leaves
 * unrelated features untouched. The backend enforces the same rule in RLS (`prediction_runs` /
 * `prediction_evaluations` SELECT require the current AI consent), so hiding this gate can't expose data.
 */
export function FeatureLegalGate({ docType, children }: { docType: LegalDocType; children: ReactNode }) {
  const { legal, acceptLegal } = useLeagueSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (hasAcceptedCurrentDoc(legal, docType)) return <>{children}</>

  const document = activeDocument(legal, docType)
  if (!document) {
    return (
      <EmptyState title={`${LEGAL_DOC_LABEL[docType]} unavailable`} description="These terms have not been published yet." />
    )
  }

  async function accept() {
    if (!document) return
    setBusy(true)
    setError(null)
    try {
      await acceptLegal(document)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your consent.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{LEGAL_DOC_LABEL[docType]} required</h2>
        <Badge tone="accent">v{document.version}</Badge>
      </div>
      <p className="mb-3 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Accept these terms to use this feature. You can withdraw consent any time under Account ▸ Legal &amp; privacy.
      </p>
      <div
        tabIndex={0}
        aria-label={`${LEGAL_DOC_LABEL[docType]} text`}
        className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border p-3 text-sm"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
      >
        {document.content}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm" style={{ color: 'var(--color-danger)' }}>
          {error}
        </p>
      )}
      <Button className="mt-3" onClick={accept} disabled={busy}>
        {busy ? 'Saving…' : 'Accept'}
      </Button>
    </Card>
  )
}
