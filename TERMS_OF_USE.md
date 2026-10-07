# Terms of Service

The VRC Ops Terms of Service are published at **https://vrc-ops.org/legal#terms** (English) and **https://vrc-ops.org/legal?lang=fr#terms** (French).

The text is stored in `src/legal/documents/terms.en.txt` and `terms.fr.txt`: an exact copy of what the apps show people, which is stored in Supabase (`legal_document_versions`, version 4). It is updated only with `node scripts/sync-legal-documents.mjs <vrc-platform>/docs/legal`, and `src/legal/legal.test.tsx` fails if either file differs from its recorded hash.

The two optional-feature consents (Deterministic Features Consent, Data & Sharing Consent) are published in the same place, at `#deterministic-features` and `#data-and-sharing`.
