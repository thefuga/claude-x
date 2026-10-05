// The attachments of a draft as Claude Code writes them in the prompt: `[Image #N]` for a pasted
// or dropped picture, `[Pasted text #N +L lines]` for a paste long enough to be folded, and `@path`
// (or `@"a path"`) for a mentioned file or folder, a line range after it (`#L10-20`) allowed. What
// each one is on disk is the hooks' business; here they are only found, and taken out again.

// Where an attachment stands in the draft (`text` from `at`) and what it is there. A mention is
// named as typed, without its quotes; `path` is the file, without the line range. A mention that
// ends a sentence carries the stop with it, so `bare` is the same without it.
export type Mark =
  | { kind: 'image'; text: string; at: number; number: number }
  | { kind: 'paste'; text: string; at: number; number: number; lines: number | null }
  | { kind: 'mention'; text: string; at: number; name: string; path: string; bare: Mention | null }

export type Mention = { text: string; name: string; path: string }

// An `@` opens a mention only at the start of the draft or after a space, so an address is none.
const MARKS = /\[Image #(\d+)\]|\[Pasted text #(\d+)(?: \+(\d+) lines?)?\]|(?<=^|\s)@("[^"\n]+"|[^\s"]+)/g
const RANGE = /#L\d+(?:-\d+)?$/
const STOP = /[.,;:!?)\]}'`]+$/

const mentionOf = (text: string, name: string): Mention => ({ text, name, path: name.replace(RANGE, '') })

export const marksOf = (draft: string): Mark[] =>
  [...draft.matchAll(MARKS)].flatMap((match): Mark[] => {
    const [text, image, paste, lines, mention] = match
    const at = match.index

    if (image !== undefined) {
      return [{ kind: 'image', text, at, number: Number(image) }]
    }

    if (paste !== undefined) {
      return [{ kind: 'paste', text, at, number: Number(paste), lines: lines === undefined ? null : Number(lines) }]
    }

    if (mention === undefined) {
      return []
    }

    if (mention.startsWith('"')) {
      return [{ kind: 'mention', ...mentionOf(text, mention.slice(1, -1)), at, bare: null }]
    }

    const bare = mention.replace(STOP, '')

    return [{ kind: 'mention', ...mentionOf(text, mention), at, bare: bare === mention || bare === '' ? null : mentionOf(`@${bare}`, bare) }]
  })

// The draft without one attachment and a space beside it, the one after it if there is one: the
// attachment at `at` while it still stands there, else the first of its text. Null where it is gone.
export const withoutMark = (draft: string, text: string, at: number): string | null => {
  const start = draft.startsWith(text, at) ? at : draft.indexOf(text)

  if (start < 0) {
    return null
  }

  const end = start + text.length
  const after = draft[end] === ' ' ? 1 : 0
  const before = after === 0 && draft[start - 1] === ' ' ? 1 : 0

  return draft.slice(0, start - before) + draft.slice(end + after)
}
