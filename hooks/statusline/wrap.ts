// How the prompt box lays a draft out, so that what is drawn over the box lands beside its text and
// never on it. The box wraps each line with Bun.wrapAnsi(line, width, { hard: true, trim: false })
// and shows a row that continues a line without the spaces it would start with.

// One row of the box: its text as shown, where the row starts in the draft, and how many spaces
// ahead of the text are not shown.
export type Row = { text: string; start: number; hidden: number }

// Characters that are one cell each and break nowhere but at a space: printable ASCII, the Latin,
// Greek and Cyrillic letters, and the common dashes, quotes, arrows, operators and box drawing.
// Anything else (a tab, an emoji, a CJK character, a combining mark, an odd space) is laid out by
// rules this file does not carry.
const KNOWN =
  /^[\x20-\x7e\u00a1-\u00ac\u00ae-\u02ff\u0370-\u0373\u0375-\u037d\u037f-\u0386\u0388-\u03ff\u0400-\u04ff\u1e00-\u1eff\u2010-\u2027\u2030-\u205e\u20a0-\u20bf\u2190-\u22ff\u2500-\u259f]*$/

export const MAX_LENGTH = 8000

// Whether every character of `text` is one this file has rules for: a cell each, one line.
export const isPlain = (text: string) => KNOWN.test(text)

const breakWord = (rows: string[], word: string, width: number) => {
  let visible = rows[rows.length - 1]?.length ?? 0

  for (let index = 0; index < word.length; index += 1) {
    if (visible + 1 <= width) {
      rows[rows.length - 1] += word.charAt(index)
    } else {
      rows.push(word.charAt(index))
      visible = 0
    }

    visible += 1

    if (visible === width && index < word.length - 1) {
      rows.push('')
      visible = 0
    }
  }

  const last = rows[rows.length - 1] ?? ''

  if (visible === 0 && last.length > 0 && rows.length > 1) {
    rows.pop()
    rows[rows.length - 1] += last
  }
}

// wrap-ansi's own steps, less what only escape codes need: a space goes on the row it follows unless
// that row is full, a word that does not fit starts a row, and one longer than a row is cut.
const wrapLine = (line: string, width: number) => {
  const rows = ['']

  line.split(' ').forEach((word, index) => {
    let length = rows[rows.length - 1]?.length ?? 0

    if (index !== 0) {
      if (length >= width) {
        rows.push('')
        length = 0
      }

      rows[rows.length - 1] += ' '
      length += 1
    }

    if (word.length > width) {
      const startingHere = 1 + Math.floor((word.length - (width - length) - 1) / width)

      if (Math.floor((word.length - 1) / width) < startingHere) {
        rows.push('')
      }

      breakWord(rows, word, width)

      return
    }

    if (length + word.length > width && length > 0 && word.length > 0) {
      rows.push('')
    }

    rows[rows.length - 1] += word
  })

  return rows
}

// The rows of a draft in a box `width` cells wide, or null for one this file cannot lay out.
export const layOut = (text: string, width: number): Row[] | null => {
  if (width < 1 || text.length > MAX_LENGTH || !KNOWN.test(text.replaceAll('\n', ''))) {
    return null
  }

  const rows: Row[] = []
  let start = 0

  for (const line of text.split('\n')) {
    wrapLine(line, width).forEach((raw, index) => {
      const shown = index === 0 ? raw : raw.trimStart()
      rows.push({ text: shown, start, hidden: raw.length - shown.length })
      start += raw.length
    })
    start += 1
  }

  return rows
}

// Where the cursor is drawn: the row it is on and the cell in it, counted from the row's text.
export const cursorIn = (rows: readonly Row[], offset: number) => {
  const found = rows.findLastIndex(row => row.start <= offset)
  const index = Math.max(0, found)
  const row = rows[index]

  return { row: index, column: row === undefined ? 0 : Math.max(0, offset - row.start - row.hidden) }
}
