import { parseLegalText, splitInline } from '@/legal/parseLegalText'

function Inline({ text }: { text: string }) {
  return (
    <>
      {splitInline(text).map((part, i) => {
        if (part.kind === 'url') {
          return (
            <a key={i} href={part.text} target="_blank" rel="noreferrer">
              {part.text}
            </a>
          )
        }
        if (part.kind === 'email') {
          return (
            <a key={i} href={`mailto:${part.text}`}>
              {part.text}
            </a>
          )
        }
        return <span key={i}>{part.text}</span>
      })}
    </>
  )
}

/** Shows one stored legal document exactly as written: the text of every line, in order, with headings recognised. */
export default function LegalText({ text, lang }: { text: string; lang: 'en' | 'fr' }) {
  const { updated, blocks } = parseLegalText(text)
  return (
    <div lang={lang} className="space-y-4">
      <p className="text-sm font-medium">{updated}</p>
      {blocks.map((block, i) => {
        if (block.kind === 'h3') return <h3 key={i}>{block.text}</h3>
        if (block.kind === 'h4') return <h4 key={i}>{block.text}</h4>
        return (
          <p key={i}>
            <Inline text={block.text} />
          </p>
        )
      })}
    </div>
  )
}
