import type { LegalAcceptanceRow, LegalDocType, LegalDocumentVersionRow } from '@/types/database'

/**
 * Pure mirror of iOS `VRCLegalState` (VRCMembershipModels.swift). Given the active document versions
 * and the caller's acceptance rows it answers which documents still need consent. A revoked
 * acceptance no longer counts, so a feature gate re-appears after consent is withdrawn.
 */
export type LegalAcceptanceSummary = Pick<
  LegalAcceptanceRow,
  'id' | 'document_id' | 'doc_type' | 'version' | 'accepted_at' | 'revoked_at'
>

export interface LegalState {
  activeDocuments: LegalDocumentVersionRow[]
  acceptances: LegalAcceptanceSummary[]
}

export const EMPTY_LEGAL_STATE: LegalState = { activeDocuments: [], acceptances: [] }

/**
 * Document types that gate general application access (the app-wide blocking gate). AI and Sharing
 * are deliberately excluded even when `is_required`: they gate their own feature at feature time
 * (see `FeatureLegalGate`), never the whole app.
 */
const GENERAL_ACCESS_TYPES: ReadonlySet<LegalDocType> = new Set<LegalDocType>(['general', 'privacy'])

export const LEGAL_DOC_LABEL: Record<LegalDocType, string> = {
  general: 'Terms of Service',
  privacy: 'Privacy Policy',
  ai: 'AI Features Consent',
  sharing: 'Sharing & Community Consent',
}

/** General Terms can never be withdrawn (delete the account instead); the rest can. */
export const LEGAL_DOC_WITHDRAWABLE: Record<LegalDocType, boolean> = {
  general: false,
  privacy: true,
  ai: true,
  sharing: true,
}

function acceptedDocumentIds(state: LegalState): Set<string> {
  return new Set(state.acceptances.filter((a) => a.revoked_at == null).map((a) => a.document_id))
}

export function activeDocument(state: LegalState, type: LegalDocType): LegalDocumentVersionRow | null {
  return state.activeDocuments.find((d) => d.doc_type === type && d.is_active) ?? null
}

/** The caller's in-force acceptance of a document type's active version, if any. */
export function acceptanceFor(state: LegalState, type: LegalDocType): LegalAcceptanceSummary | null {
  const doc = activeDocument(state, type)
  if (!doc) return null
  return state.acceptances.find((a) => a.document_id === doc.id && a.revoked_at == null) ?? null
}

/** True when there is no active version, or the active version is accepted. */
export function hasAcceptedCurrentDoc(state: LegalState, type: LegalDocType): boolean {
  const doc = activeDocument(state, type)
  if (!doc) return true
  return acceptedDocumentIds(state).has(doc.id)
}

/** Required Terms/Privacy documents not yet accepted — non-empty routes the user to the blocking gate. */
export function generalAccessUnaccepted(state: LegalState): LegalDocumentVersionRow[] {
  const accepted = acceptedDocumentIds(state)
  return state.activeDocuments
    .filter((d) => GENERAL_ACCESS_TYPES.has(d.doc_type) && d.is_active && d.is_required && !accepted.has(d.id))
    .sort((a, b) => a.doc_type.localeCompare(b.doc_type))
}

export interface ConsentStatus {
  document: LegalDocumentVersionRow | null
  acceptance: LegalAcceptanceSummary | null
  isAvailable: boolean
  isAccepted: boolean
  label: string
  tone: 'success' | 'warning' | 'neutral'
}

export function consentStatus(state: LegalState, type: LegalDocType, formatDate: (iso: string) => string): ConsentStatus {
  const document = activeDocument(state, type)
  const acceptance = acceptanceFor(state, type)
  if (!document) {
    return { document, acceptance, isAvailable: false, isAccepted: false, label: 'Not available yet', tone: 'neutral' }
  }
  if (acceptance) {
    const verb = type === 'privacy' ? 'Acknowledged' : 'Accepted'
    return {
      document,
      acceptance,
      isAvailable: true,
      isAccepted: true,
      label: `${verb} · v${document.version} · ${formatDate(acceptance.accepted_at)}`,
      tone: 'success',
    }
  }
  if (document.is_required) {
    return { document, acceptance, isAvailable: true, isAccepted: false, label: 'Action needed', tone: 'warning' }
  }
  return {
    document,
    acceptance,
    isAvailable: true,
    isAccepted: false,
    label: type === 'privacy' ? 'Tap to review' : 'Not granted',
    tone: 'neutral',
  }
}
