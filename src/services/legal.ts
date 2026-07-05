import { supabase } from '@/supabase/client'
import type { LegalDocumentVersionRow, LegalDocType } from '@/types/database'

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
