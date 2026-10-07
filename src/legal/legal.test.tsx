import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LEGAL_TEXTS, type LegalDocumentId, type LegalLang } from '@/legal/documents'
import LegalText from '@/legal/LegalText'
import { parseLegalText, splitInline } from '@/legal/parseLegalText'

const IDS: LegalDocumentId[] = ['privacy', 'terms', 'deterministic-features', 'data-and-sharing']
const LANGS: LegalLang[] = ['en', 'fr']
const DIR = join(__dirname, 'documents')

describe('the legal documents on this site are the ones stored in Supabase', () => {
  const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as Record<string, string>

  it.each(IDS.flatMap((id) => LANGS.map((lang) => [id, lang] as const)))('%s (%s) matches its recorded hash', (id, lang) => {
    const bytes = readFileSync(join(DIR, `${id}.${lang}.txt`))
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest[`${id}.${lang}.txt`])
    expect(LEGAL_TEXTS[id][lang]).toBe(bytes.toString('utf8'))
  })

  it('has exactly the eight documents and nothing else listed', () => {
    expect(Object.keys(manifest).sort()).toEqual(IDS.flatMap((id) => LANGS.map((lang) => `${id}.${lang}.txt`)).sort())
  })

  it.each(IDS)('%s has the same structure in English and French', (id) => {
    const en = parseLegalText(LEGAL_TEXTS[id].en)
    const fr = parseLegalText(LEGAL_TEXTS[id].fr)
    expect(fr.blocks.map((b) => b.kind)).toEqual(en.blocks.map((b) => b.kind))
    expect(fr.blocks.filter((b) => b.kind === 'h3').length).toBeGreaterThan(10)
  })

  it.each(IDS.flatMap((id) => LANGS.map((lang) => [id, lang] as const)))('%s (%s) carries no draft marker and is dated October 7, 2026', (id, lang) => {
    const text = LEGAL_TEXTS[id][lang]
    expect(text).not.toMatch(/\[(BUSINESS FACT|DECISION|VERIFY|PUBLICATION DATE)/)
    expect(text).not.toContain('<!--')
    expect(parseLegalText(text).updated).toMatch(lang === 'en' ? /October 7, 2026/ : /7 octobre 2026/)
  })

  it('names the same contact as the apps do, and not the old address', () => {
    for (const id of IDS) {
      for (const lang of LANGS) {
        expect(LEGAL_TEXTS[id][lang]).not.toContain('povchaos@gmail.com')
      }
    }
    expect(LEGAL_TEXTS.privacy.en).toContain('debard.chase@outlook.com')
  })
})

describe('parseLegalText', () => {
  it('recognises numbered headings, sub-headings and unnumbered headings, and keeps every other line as a paragraph', () => {
    const parsed = parseLegalText('Title\nLast updated: X\nIntro line.\n\nHow to read this policy\n\nBody.\n\n1. First\n\n1.1 Sub\nText of the sub-section.\nSecond line.\n')
    expect(parsed.title).toBe('Title')
    expect(parsed.updated).toBe('Last updated: X')
    expect(parsed.blocks).toEqual([
      { kind: 'p', text: 'Intro line.' },
      { kind: 'h3', text: 'How to read this policy' },
      { kind: 'p', text: 'Body.' },
      { kind: 'h3', text: '1. First' },
      { kind: 'h4', text: '1.1 Sub' },
      { kind: 'p', text: 'Text of the sub-section.' },
      { kind: 'p', text: 'Second line.' },
    ])
  })

  it.each(IDS.flatMap((id) => LANGS.map((lang) => [id, lang] as const)))('%s (%s) loses no line when shown', (id, lang) => {
    const text = LEGAL_TEXTS[id][lang]
    const lines = text.split('\n').filter((l) => l.trim() !== '')
    const parsed = parseLegalText(text)
    // title is the section title on the page; every other line is shown in order
    expect([parsed.title, parsed.updated, ...parsed.blocks.map((b) => b.text)]).toEqual(lines)
  })

  it('only the one intended unnumbered heading exists per privacy document', () => {
    const headings = (id: LegalDocumentId, lang: LegalLang) =>
      parseLegalText(LEGAL_TEXTS[id][lang]).blocks.filter((b) => b.kind === 'h3' && !/^\d+\./.test(b.text)).map((b) => b.text)
    expect(headings('privacy', 'en')).toEqual(['How to read this policy'])
    expect(headings('privacy', 'fr')).toEqual(['Comment lire cette politique'])
    for (const id of ['terms', 'deterministic-features', 'data-and-sharing'] as const) {
      expect(headings(id, 'en')).toEqual([])
      expect(headings(id, 'fr')).toEqual([])
    }
  })
})

describe('splitInline', () => {
  it('links web and email addresses without eating trailing punctuation', () => {
    expect(splitInline('Write to a@b.org, or see https://vrc-ops.org/legal.')).toEqual([
      { kind: 'text', text: 'Write to ' },
      { kind: 'email', text: 'a@b.org' },
      { kind: 'text', text: ', or see ' },
      { kind: 'url', text: 'https://vrc-ops.org/legal' },
      { kind: 'text', text: '.' },
    ])
  })
})

describe('LegalText', () => {
  it('renders headings and paragraphs in the right language', () => {
    render(<LegalText text={'Title\nDernière mise à jour : 7 octobre 2026\nBonjour.\n\n1. Qui nous sommes\n\nContact : x@y.org\n'} lang="fr" />)
    expect(screen.getByRole('heading', { level: 3, name: '1. Qui nous sommes' })).toBeInTheDocument()
    expect(screen.getByText('Dernière mise à jour : 7 octobre 2026')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'x@y.org' })).toHaveAttribute('href', 'mailto:x@y.org')
    expect(document.querySelector('[lang="fr"]')).not.toBeNull()
  })
})
