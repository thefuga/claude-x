// The markdown a draft is written in, as far as it is worth a color: headings, emphasis, code,
// links, lists, quotes, tags, and inside a fence the code of the language it names. Lines are read
// one at a time against the handful of forms a prompt uses; the rest of markdown (tables, indented
// code, reference links, a paragraph that runs into a heading) is left as plain text.

import { lex } from './code'
import type { TokenKind } from './code'

export type Kind = TokenKind | 'heading' | 'marker' | 'strong' | 'emphasis' | 'raw' | 'link' | 'url' | 'list' | 'quote' | 'tag' | 'language'

// One stretch of the draft and what it is. Where two cover the same text the later is the inner
// one, and the later run is the one the engine lets win.
export type Span = { start: number; end: number; kind: Kind }

type Fence = { mark: string; language: string; body: number }

// A line longer than this is a paste, not prose: its blocks are told apart and its inside left alone.
const MAX_INLINE = 2000
// How far emphasis is followed into emphasis.
const MAX_DEPTH = 3

const HEADING = /^( {0,3})(#{1,6})(?:[ \t]+(.*))?$/
const QUOTE = /^( {0,3}>[ \t]?)(.*)$/
const ITEM = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(\[[ xX]\](?=[ \t]|$))?(.*)$/
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/
const OPENING = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)(.*)$/
const CLOSING = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

// Where stars open and close emphasis. Markdown asks less of them, and would set a glob
// (`src/**/*.ts`), a product (`2 * 3`) and a pair of star arguments in italics: here the stars stand
// clear of a word and of a path on their outer side, and what they hold starts with neither a
// space nor a stop and ends with neither a space nor an opening bracket.
const OPENS = String.raw`(?<![\w*/])`
const STARTS = String.raw`(?=[^\s*/.,;:!?)\]}])`
const ENDS = String.raw`[^\s*/(\[{]`
const CLOSES = String.raw`(?![\w*/])`

// What is told apart inside a line, the first that fits at each place: an escaped mark, a code
// span, a link, an address, a tag, then strong and plain emphasis. A mark inside a word is a part
// of the word, and one with a space on its inner side opens or closes nothing.
const INLINE = new RegExp(
  [
    String.raw`(?<escape>\\[!-/:-@[-\x60{-~])`,
    String.raw`(?<ticks>\x60+)(?!\x60)(?<raw>.*?[^\x60])\k<ticks>(?!\x60)`,
    String.raw`\[(?<label>[^\]\n]+)\]\((?<target>[^)\s]+)\)`,
    String.raw`(?<url>https?:\/\/[^\s<>\x60]*[^\s<>\x60.,;:!?'")\]])`,
    String.raw`(?<tag><\/?[A-Za-z][\w:-]*(?:\s[^<>\n]*)?\/?>)`,
    String.raw`${OPENS}(?<stars>\*\*)${STARTS}(?<strong>.+?)(?<=${ENDS})\*\*${CLOSES}`,
    String.raw`(?<![\w_])(?<bars>__)(?=\S)(?<stronger>.+?)(?<=\S)__(?![\w_])`,
    String.raw`${OPENS}(?<star>\*)${STARTS}(?<emphasis>[^*\n]*?${ENDS})\*${CLOSES}`,
    String.raw`(?<![\w_])(?<bar>_)(?=[^\s_])(?<emphatic>[^_\n]*?[^\s_])_(?![\w_])`,
  ].join('|'),
  'g',
)

const inline = (text: string, at: number, depth: number, spans: Span[]) => {
  if (text.length > MAX_INLINE || depth > MAX_DEPTH) {
    return
  }

  for (const match of text.matchAll(INLINE)) {
    const { ticks, raw, label, target, url, tag, stars, strong, bars, stronger, star, emphasis, bar, emphatic } = match.groups ?? {}
    const start = at + match.index
    const end = start + match[0].length
    // Marks of `width` on both sides of what they hold: the whole as `kind`, the marks over it, and
    // what it holds read again for what is inside.
    const wrapped = (kind: Kind, width: number, held: string) => {
      spans.push({ start, end, kind })
      inline(held, start + width, depth + 1, spans)
      spans.push({ start, end: start + width, kind: 'marker' }, { start: end - width, end, kind: 'marker' })
    }

    if (ticks !== undefined && raw !== undefined) {
      spans.push(
        { start, end, kind: 'raw' },
        { start, end: start + ticks.length, kind: 'marker' },
        { start: end - ticks.length, end, kind: 'marker' },
      )
    } else if (label !== undefined && target !== undefined) {
      const close = start + 1 + label.length

      spans.push({ start, end, kind: 'marker' }, { start: start + 1, end: close, kind: 'link' })
      inline(label, start + 1, depth + 1, spans)
      spans.push({ start: close + 2, end: end - 1, kind: 'url' })
    } else if (url !== undefined) {
      spans.push({ start, end, kind: 'url' })
    } else if (tag !== undefined) {
      spans.push({ start, end, kind: 'tag' })
    } else if (stars !== undefined && strong !== undefined) {
      wrapped('strong', 2, strong)
    } else if (bars !== undefined && stronger !== undefined) {
      wrapped('strong', 2, stronger)
    } else if (star !== undefined && emphasis !== undefined) {
      wrapped('emphasis', 1, emphasis)
    } else if (bar !== undefined && emphatic !== undefined) {
      wrapped('emphasis', 1, emphatic)
    }
  }
}

// The fence a line opens, if it opens one. A backtick fence names no backtick after its marks,
// which is what tells it from a line of code set in three of them.
const opening = (line: string, at: number): Fence | null => {
  const [, , mark, language, rest] = OPENING.exec(line) ?? []

  if (mark === undefined || language === undefined || (mark.startsWith('`') && rest?.includes('`') === true)) {
    return null
  }

  return { mark, language, body: at + line.length + 1 }
}

const closes = (line: string, { mark }: Fence) => {
  const [, found] = CLOSING.exec(line) ?? []

  return found !== undefined && found.startsWith(mark)
}

// The spans of a line that is in no fence, by the block it is.
const block = (line: string, at: number, spans: Span[]) => {
  const end = at + line.length
  const heading = HEADING.exec(line)
  const quote = QUOTE.exec(line)
  const item = ITEM.exec(line)

  if (RULE.test(line)) {
    spans.push({ start: at, end, kind: 'marker' })
  } else if (heading !== null) {
    const [, indent = '', marks = '', title = ''] = heading
    const from = at + indent.length

    spans.push({ start: from, end, kind: 'heading' }, { start: from, end: from + marks.length, kind: 'marker' })
    inline(title, end - title.length, 1, spans)
  } else if (quote !== null) {
    const [, lead = '', quoted = ''] = quote

    spans.push({ start: at, end, kind: 'quote' }, { start: at, end: at + lead.length, kind: 'marker' })
    inline(quoted, at + lead.length, 1, spans)
  } else if (item !== null) {
    const [, indent = '', bullet = '', gap = '', task, rest = ''] = item
    const from = at + indent.length
    const boxed = from + bullet.length + gap.length

    spans.push({ start: from, end: from + bullet.length, kind: 'list' })

    if (task !== undefined) {
      spans.push({ start: boxed, end: boxed + task.length, kind: 'list' })
    }

    inline(rest, end - rest.length, 1, spans)
  } else {
    inline(line, at, 1, spans)
  }
}

// The code between a fence's two lines, which ends one character before `until`, where the line
// that closes it starts (or would, in a fence left open).
const fenced = (text: string, { language, body }: Fence, until: number, spans: Span[]) => {
  const source = text.slice(body, Math.max(body, until - 1))

  for (const { start, end, kind } of lex(source, language)) {
    spans.push({ start: body + start, end: body + end, kind })
  }
}

// The spans of a draft, in the order they are to be painted.
export const scan = (text: string): Span[] => {
  const spans: Span[] = []
  let open: Fence | null = null
  let at = 0

  for (const line of text.split('\n')) {
    const end = at + line.length

    if (open === null) {
      open = opening(line, at)

      if (open === null) {
        block(line, at, spans)
      } else {
        const named = at + line.indexOf(open.mark) + open.mark.length

        spans.push({ start: at, end: named, kind: 'marker' }, ...(named < end ? [{ start: named, end, kind: 'language' } as const] : []))
      }
    } else if (closes(line, open)) {
      fenced(text, open, at, spans)
      spans.push({ start: at, end, kind: 'marker' })
      open = null
    }

    at = end + 1
  }

  if (open !== null) {
    fenced(text, open, text.length + 1, spans)
  }

  return spans
}
