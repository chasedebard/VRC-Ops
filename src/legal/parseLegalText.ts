/**
 * The legal documents are stored in Supabase as plain text (the apps show them as-is). This turns that text into a few block types so the
 * website can show it with headings, without changing a single word:
 *
 *   - line 1 is the document's title and line 2 its "Last updated" line;
 *   - "12. Title" is a section heading, "12.3 Title" a sub-section heading;
 *   - a short line with a blank line before and after it, and no punctuation, address or colon in it, is an unnumbered heading ("How to read this policy");
 *   - every other non-empty line is a paragraph.
 *
 * The page always renders every line, in order; nothing is dropped or reworded.
 */
export type LegalBlock =
  | { kind: 'h3'; text: string }
  | { kind: 'h4'; text: string }
  | { kind: 'p'; text: string }

export interface ParsedLegalText {
  title: string
  updated: string
  blocks: LegalBlock[]
}

const SECTION = /^\d+\.\s+\S/
const SUBSECTION = /^\d+\.\d+\s+\S/
const UNNUMBERED_HEADING_MAX = 70

export function parseLegalText(text: string): ParsedLegalText {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const title = lines[0] ?? ''
  const updated = lines[1] ?? ''
  const blocks: LegalBlock[] = []
  for (let i = 2; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') continue
    const blankBefore = i === 0 || lines[i - 1].trim() === ''
    const blankAfter = i === lines.length - 1 || lines[i + 1].trim() === ''
    if (SUBSECTION.test(line)) blocks.push({ kind: 'h4', text: line })
    else if (SECTION.test(line)) blocks.push({ kind: 'h3', text: line })
    else if (blankBefore && blankAfter && line.length < UNNUMBERED_HEADING_MAX && !/[.:;,@]|https?:/.test(line)) blocks.push({ kind: 'h3', text: line })
    else blocks.push({ kind: 'p', text: line })
  }
  return { title, updated, blocks }
}

/** Splits a paragraph into text, web addresses and email addresses so the page can link them. */
export type LegalInline = { kind: 'text'; text: string } | { kind: 'url'; text: string } | { kind: 'email'; text: string }

const INLINE = /(https?:\/\/[^\s"'<>)]*[^\s"'<>).,;:!?])|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g

export function splitInline(text: string): LegalInline[] {
  const out: LegalInline[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    const start = m.index ?? 0
    if (start > last) out.push({ kind: 'text', text: text.slice(last, start) })
    out.push(m[1] ? { kind: 'url', text: m[1] } : { kind: 'email', text: m[2] })
    last = start + m[0].length
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) })
  return out
}
