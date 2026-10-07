import privacyEn from '@/legal/documents/privacy.en.txt?raw'
import privacyFr from '@/legal/documents/privacy.fr.txt?raw'
import termsEn from '@/legal/documents/terms.en.txt?raw'
import termsFr from '@/legal/documents/terms.fr.txt?raw'
import deterministicEn from '@/legal/documents/deterministic-features.en.txt?raw'
import deterministicFr from '@/legal/documents/deterministic-features.fr.txt?raw'
import sharingEn from '@/legal/documents/data-and-sharing.en.txt?raw'
import sharingFr from '@/legal/documents/data-and-sharing.fr.txt?raw'

export type LegalLang = 'en' | 'fr'
export type LegalDocumentId = 'privacy' | 'terms' | 'deterministic-features' | 'data-and-sharing'

/**
 * The text of each document in each language: a copy of what is stored in Supabase (`legal_document_versions`, version 4, English `content` and
 * French `content_fr`). Update them only with `node scripts/sync-legal-documents.mjs <vrc-platform>/docs/legal`.
 */
export const LEGAL_TEXTS: Record<LegalDocumentId, Record<LegalLang, string>> = {
  privacy: { en: privacyEn, fr: privacyFr },
  terms: { en: termsEn, fr: termsFr },
  'deterministic-features': { en: deterministicEn, fr: deterministicFr },
  'data-and-sharing': { en: sharingEn, fr: sharingFr },
}
