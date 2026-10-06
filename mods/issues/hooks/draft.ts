// The `@#` references of a draft, as opencode.vim reads them (its `autocomplete.ts` and
// `github-issues.ts`): the one being typed at the cursor, which the list above the prompt follows
// and a pick replaces, and the finished `@#N` ones that go with the prompt when it is sent. What
// they name is the hooks' business; here they are only found, and written.

// The reference being typed: where its `@` stands, where it ends (before a stop typed after it, a
// comma, a closing bracket) and what follows the `#`.
export type Typed = { start: number; end: number; query: string }

const STOP = /[.,;:!?'"`)\]}]+$/u
const QUERY = /^[\p{L}\p{N}_./-]*$/u
const WORD = /[A-Za-z0-9_]/

// The reference the cursor is at the end of: `@#` at the start of the draft or after a space, then
// a number or words without spaces. An address (`me@#1`) is none, nor is a plain `@` mention.
export const typedAt = (text: string, cursor: number): Typed | null => {
  const upto = text.slice(0, Math.max(0, Math.min(cursor, text.length)))
  const at = upto.lastIndexOf('@')

  if (at < 0 || (at > 0 && !/\s/.test(upto[at - 1] ?? ''))) {
    return null
  }

  const word = upto.slice(at + 1)

  if (/\s/.test(word) || !word.startsWith('#')) {
    return null
  }

  const raw = word.slice(1)
  const stop = STOP.exec(raw)?.[0] ?? ''
  const query = raw.slice(0, raw.length - stop.length)

  return QUERY.test(query) ? { start: at, end: upto.length - stop.length, query } : null
}

// Which reference this is, as long as it stays where it is and reads the same.
export const typedKey = ({ start, query }: Typed) => `${start}:${query}`

// The draft with the reference being typed made `@#N`, and a space after it unless a space or a
// stop follows already.
export const withIssue = (text: string, typed: Typed, number: number) => {
  const before = text.slice(0, typed.start)
  const after = text.slice(typed.end)
  const space = after !== '' && /^\s|^[.,;:!?'"`)\]}]/u.test(after) ? '' : ' '

  return `${before}@#${number}${space}${after}`
}

// The issues a prompt names, each once and in the order it is first named: `@#N` standing alone,
// so `me@#1` and `@#1a` name none, and `(@#2)` names one.
export const referencesOf = (text: string): number[] => {
  const numbers = new Set<number>()

  for (const match of text.matchAll(/@#([1-9][0-9]*)/g)) {
    const start = match.index
    const end = start + match[0].length
    const number = Number(match[1])

    if (Number.isSafeInteger(number) && !WORD.test(text[start - 1] ?? '') && !WORD.test(text[end] ?? '')) {
      numbers.add(number)
    }
  }

  return [...numbers]
}
