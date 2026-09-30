import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLeagueSession } from '@/hooks/useLeagueSession'
import {
  LEGAL_DOC_LABEL,
  LEGAL_DOC_WITHDRAWABLE,
  consentStatus,
} from '@/utils/legalState'
import { Card, CardHeader, CardTitle } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { formatDate } from '@/utils/format'
import { backendErrorMessage } from '@/utils/backendErrors'
import type { LegalDocType } from '@/types/database'

const DESCRIPTIONS: Record<LegalDocType, string> = {
  general: 'The terms that govern your use of VRC Ops.',
  privacy: 'How VRC collects, uses and protects your data.',
  ai: 'Needed for AI-assisted features such as Predictions.',
  sharing: 'Needed for community and sharing features.',
}

/**
 * Account ▸ Legal & privacy (iOS `VRCLegalPrivacyView`): review the documents that govern VRC, grant or withdraw the
 * optional consents (AI, Sharing, Privacy acknowledgement), and reach account deletion. General Terms can never be
 * withdrawn — delete the account instead. States come from the versioned legal model, never a cached boolean.
 */
export default function LegalPrivacyPage() {
  const { legal } = useLeagueSession()
  const [openType, setOpenType] = useState<LegalDocType | null>(null)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <Link to="/account" className="text-sm underline" style={{ color: 'var(--color-text-muted)' }}>
          ← Account
        </Link>
        <h1 className="text-2xl font-bold">Legal &amp; privacy</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Legal documents</CardTitle>
        </CardHeader>
        <p className="mb-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Review the terms and policies that govern your use of VRC.
        </p>
        <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {(['general', 'privacy'] as LegalDocType[]).map((type) => (
            <DocRow key={type} type={type} open={openType === type} onToggle={() => setOpenType(openType === type ? null : type)} />
          ))}
        </ul>
        <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          The public versions are also at <Link to="/legal" className="underline">vrc-ops.org/legal</Link>.
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consent</CardTitle>
        </CardHeader>
        <p className="mb-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Grant or withdraw consent for optional features at any time.
        </p>
        <ul className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
          {(['ai', 'sharing'] as LegalDocType[]).map((type) => (
            <DocRow key={type} type={type} open={openType === type} onToggle={() => setOpenType(openType === type ? null : type)} />
          ))}
        </ul>
        {!legal.activeDocuments.length && (
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Legal documents couldn&apos;t be loaded. Refresh the page to try again.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <p className="mb-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Permanently remove your account and personal data. This can&apos;t be undone.
        </p>
        <Link to="/account#delete-account" className="text-sm font-semibold underline" style={{ color: 'var(--color-danger)' }}>
          Delete account
        </Link>
      </Card>
    </div>
  )
}

function DocRow({ type, open, onToggle }: { type: LegalDocType; open: boolean; onToggle: () => void }) {
  const { legal, acceptLegal, revokeLegal } = useLeagueSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const status = consentStatus(legal, type, formatDate)

  async function accept() {
    if (!status.document) return
    setBusy(true)
    setError(null)
    try {
      await acceptLegal(status.document)
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not record your choice.'))
    } finally {
      setBusy(false)
    }
  }

  async function withdraw() {
    setBusy(true)
    setError(null)
    try {
      await revokeLegal(type)
      setConfirmWithdraw(false)
    } catch (err) {
      setError(backendErrorMessage(err, 'Could not withdraw consent.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="py-2">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>
          <span className="block text-sm font-medium">{LEGAL_DOC_LABEL[type]}</span>
          <span className="block text-xs" style={{ color: status.tone === 'success' ? 'var(--color-success)' : status.tone === 'warning' ? 'var(--color-warning)' : 'var(--color-text-muted)' }}>
            {status.label}
          </span>
        </span>
        <span aria-hidden>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {!status.document ? (
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              This document is not available yet.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {DESCRIPTIONS[type]}
                </p>
                {status.isAccepted ? (
                  <Badge tone="success">{type === 'privacy' ? 'Acknowledged' : 'Accepted'}</Badge>
                ) : status.document.is_required ? (
                  <Badge tone="warning">Action needed</Badge>
                ) : (
                  <Badge tone="neutral">Optional</Badge>
                )}
              </div>
              <div
                tabIndex={0}
                aria-label={`${LEGAL_DOC_LABEL[type]} text`}
                className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg border p-3 text-sm"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
              >
                {status.document.content}
              </div>
              {error && (
                <p role="alert" className="text-sm" style={{ color: 'var(--color-danger)' }}>
                  {error}
                </p>
              )}
              {status.isAccepted ? (
                LEGAL_DOC_WITHDRAWABLE[type] &&
                (confirmWithdraw ? (
                  <div className="space-y-2">
                    <p className="text-sm">
                      You can grant this consent again at any time. Features that require it will be unavailable until you do.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="danger" onClick={withdraw} disabled={busy}>
                        {busy ? 'Working…' : 'Withdraw consent'}
                      </Button>
                      <Button variant="secondary" onClick={() => setConfirmWithdraw(false)} disabled={busy}>
                        Keep consent
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="danger" onClick={() => setConfirmWithdraw(true)}>
                    Withdraw consent
                  </Button>
                ))
              ) : (
                <Button onClick={accept} disabled={busy}>
                  {busy ? 'Saving…' : type === 'privacy' ? 'Acknowledge' : 'Accept'}
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}
