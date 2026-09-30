import { supabase } from '@/supabase/client'
import type { LegalDocType, LegalDocumentVersionRow } from '@/types/database'
import type { LegalAcceptanceSummary, LegalState } from '@/utils/legalState'

export async function getActiveLegalDocuments(): Promise<LegalDocumentVersionRow[]> {
  const { data, error } = await supabase
    .from('legal_document_versions')
    .select('*')
    .eq('is_active', true)
    .order('doc_type')
    .returns<LegalDocumentVersionRow[]>()
  if (error) throw error
  return data ?? []
}

/** The caller's acceptance rows (including revoked ones, which no longer count). */
export async function getOwnLegalAcceptances(userId: string): Promise<LegalAcceptanceSummary[]> {
  const { data, error } = await supabase
    .from('legal_acceptances')
    .select('id, document_id, doc_type, version, accepted_at, revoked_at')
    .eq('user_id', userId)
    .returns<LegalAcceptanceSummary[]>()
  if (error) throw error
  return data ?? []
}

/** Active document versions + the caller's acceptances — the same pair iOS' `VRCLegalState` is built from. */
export async function loadLegalState(userId: string): Promise<LegalState> {
  const [activeDocuments, acceptances] = await Promise.all([
    getActiveLegalDocuments(),
    getOwnLegalAcceptances(userId),
  ])
  return { activeDocuments, acceptances }
}

/** Server-side check used by RLS (`vrc_has_accepted_current`) — prefer `loadLegalState` for UI decisions. */
export async function hasAcceptedCurrent(docType: LegalDocType): Promise<boolean> {
  const { data, error } = await supabase.rpc('vrc_has_accepted_current', { p_doc_type: docType })
  if (error) throw error
  return Boolean(data)
}

export async function acceptLegalDocument(
  documentId: string,
  leagueId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('vrc_accept_legal', {
    p_document: documentId,
    p_league: leagueId,
    p_platform: 'web',
    p_app_version: null,
  })
  if (error) throw error
}

/** Withdraws consent for a withdrawable document type (Privacy, AI, Sharing). General Terms cannot be revoked. */
export async function revokeLegalDocument(docType: LegalDocType): Promise<void> {
  const { error } = await supabase.rpc('vrc_revoke_legal', { p_doc_type: docType })
  if (error) throw error
}
