# Privacy Policy

The VRC Ops Privacy Policy is published at **https://vrc-ops.org/legal#privacy** (English) and **https://vrc-ops.org/legal?lang=fr#privacy** (French).

The text is stored in `src/legal/documents/privacy.en.txt` and `privacy.fr.txt`: an exact copy of what the apps show people, which is stored in Supabase (`legal_document_versions`, version 4). It is updated only with `node scripts/sync-legal-documents.mjs <vrc-platform>/docs/legal`, and `src/legal/legal.test.tsx` fails if either file differs from its recorded hash.
