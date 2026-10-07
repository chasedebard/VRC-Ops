#!/usr/bin/env node
// Copies the legal documents that are stored in Supabase (`legal_document_versions`) into src/legal/documents.
//
//   node scripts/sync-legal-documents.mjs <path to vrc-platform/docs/legal>
//
// The source files there carry a leading <!-- ... --> comment recording where each came from; the stored text is everything after it. Nothing
// else is changed, so the website shows exactly the words the apps ask people to accept. A manifest of SHA-256 hashes is written beside the files
// and checked by src/legal/documents.test.ts, so an accidental edit to a document fails the build.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const source = process.argv[2]
if (!source) {
  console.error('usage: node scripts/sync-legal-documents.mjs <path to vrc-platform/docs/legal>')
  process.exit(2)
}

// website id -> file name in vrc-platform/docs/legal
const DOCUMENTS = {
  privacy: 'privacy-policy',
  terms: 'terms-of-service',
  'deterministic-features': 'ai-feature-terms',
  'data-and-sharing': 'data-and-sharing-terms',
}

const out = resolve(new URL('../src/legal/documents', import.meta.url).pathname)
mkdirSync(out, { recursive: true })
const manifest = {}
for (const [id, file] of Object.entries(DOCUMENTS)) {
  for (const [lang, suffix] of [['en', ''], ['fr', '.fr']]) {
    const raw = readFileSync(join(source, `${file}${suffix}.md`), 'utf8')
    const body = raw.replace(/^\s*<!--[\s\S]*?-->\s*/, '').replace(/^\n+/, '').replace(/\s+$/, '') + '\n'
    const name = `${id}.${lang}.txt`
    writeFileSync(join(out, name), body)
    manifest[name] = createHash('sha256').update(body).digest('hex')
  }
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log(`wrote ${Object.keys(manifest).length} documents and manifest.json to ${out}`)
