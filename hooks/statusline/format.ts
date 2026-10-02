import type { Box, Cursor, Draft, Reading, Usage } from '../../types'
import { MAX_LENGTH, cursorIn, isPlain, layOut } from './wrap'
import type { Row } from './wrap'

// The editor's mode, the permission mode where the bar names it (`''` where it does not), the model
// and the effort.
export type Segments = { mode: string; permission: string; model: string; provider: string; effort: string }

export type Left = Segments & { title: string }

export type Right = { cursor: string; usage: string }

// One row of the draft as it is drawn over: `text` when the row's text is drawn too (the engine's
// own shows through otherwise), the cell the fill starts at, and one cell of it left open for the
// character typed next. A row with no `fillFrom` gets its gutter and nothing else.
export type BlockRow = { text: string | null; isDim: boolean; fillFrom: number | null; gap: number | null }

// What the left-hand site draws in the fullscreen terminal: the status bar on the footer's first row,
// and over the prompt box above it the draft's rows and a row of fill on each of its rules. `rows` is
// null where the box is left as the engine draws it; `under` is the rows other plugins pinned between
// the box and the footer. `slot` is the cells kept clear at the head of the bar for the engine's own
// permission mark, where the bar does not name the mode itself, and `read` the mode the mark's width
// says it is, believed or not.
export type Block = {
  columns: number
  tuning: number
  bar: Segments & { cursor: string }
  slot: number
  // The session's tab, drawn on the notice row over the prompt box where the box's rows are known.
  // The mod's own copy of the engine's mark, drawn under the bar where the mode is known, and the usage.
  mark: string
  label: string
  usage: string
  // The blank cells between the bar's two halves, drawn so that they cover the engine's mark.
  gap: number
  rows: readonly BlockRow[] | null
  under: number
  isFilled: boolean
  isMeasured: boolean
  read: string | null
}

// The row under the block: the session's tab, and at its far end the engine's own labels and the usage.
export type TabRow = { columns: number; title: string; note: string }

// One permission mode as Claude Code marks it at the head of the footer: a symbol, the mode's name and
// ` on`, this many cells in all.
export type Permission = { mode: string; label: string; cells: number; mark: string }

type Size = 'full' | 'compact' | 'tiny'

type Facts = { columns: number; mode: string; model: string; effort: string | null }

type Named = Omit<Facts, 'columns'> & { permission: string }

export const ORIGIN: Draft = { line: 1, column: 1, percent: 100, text: '', offset: 0, isDecorated: false }

export const UNPLACED: Box = { rows: null, under: 0, isAligned: false, isPlaced: false }

// What the empty box says: what it takes, and the keys that work in the editor's mode at the time.
export const placeholderOf = (mode: string) => {
  const ask = mode.startsWith('SHELL') ? 'Run a shell command…' : 'Ask anything…'

  if (mode.endsWith('NORMAL')) {
    return `${ask}  (i insert)`
  }

  return mode === 'SHELL' ? `${ask}  (backspace leaves shell mode)` : `${ask}  (? shortcuts · / commands · @ files)`
}

export const PLACEHOLDER = placeholderOf('INSERT')

export const NO_USAGE: Usage = { tokens: null, percent: null, usd: null }

export const UNTITLED = 'New session'

// A transcript's title rows, as `grep -E` finds them.
export const TITLE_ENTRY = '^\\{"type":"(custom-title|ai-title)"'

// Where `/effort` announced the level it set, as `grep -o -E` cuts it out of a transcript's rows.
export const EFFORT_ENTRY = '"content":"<local-command-stdout>Set effort level to [a-z]+'

// The fullscreen prompt as Claude Code lays it out: the draft starts two cells in, and the footer
// keeps two cells clear of each edge of the screen.
export const GUTTER = 2
export const EDGE = 2

// The narrowest terminal the block is drawn in.
export const MIN_OVERLAID_COLUMNS = 64

// `dontAsk` cannot be cycled to, is marked as wide as `auto`, and would read as it.
export const PERMISSIONS: readonly Permission[] = [
  { mode: 'plan', label: 'Plan', cells: 14, mark: '⏸ plan mode on' },
  { mode: 'auto', label: 'Auto', cells: 15, mark: '⏵⏵ auto mode on' },
  { mode: 'default', label: 'Manual', cells: 16, mark: '⏸ manual mode on' },
  { mode: 'acceptEdits', label: 'Accept edits', cells: 18, mark: '⏵⏵ accept edits on' },
  { mode: 'bypassPermissions', label: 'Bypass', cells: 24, mark: '⏵⏵ bypass permissions on' },
]

// The ` · ` the engine draws after its mark, and the room the widest mark takes with it.
const SEPARATOR = 3
export const MARK_SLOT = 24 + SEPARATOR

// The versions of Claude Code the label was checked on, mode by mode and width by width.
export const VERIFIED = ['2.1.287']

// The footer row is shared with the engine's own mode pill on the left.
const PILL_COLUMNS = 24
const RIGHT_COLUMNS: Record<Size, number> = { full: 22, compact: 14, tiny: 6 }
const MAX_TITLE = 24

const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max']

// claude-opus-5-5[1m], us.anthropic.claude-opus-4-1-20250805-v1:0
const FAMILY_FIRST = /claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?!\d)/
// claude-3-5-sonnet-20241022
const VERSION_FIRST = /claude-(\d+)(?:-(\d{1,2}))?-([a-z]+)/

const capitalize = (word: string) => word.charAt(0).toUpperCase() + word.slice(1)

const version = (major: string, minor: string | undefined) => (minor === undefined ? major : `${major}.${minor}`)

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const sizeOf = (columns: number): Size => (columns >= 80 ? 'full' : columns >= 56 ? 'compact' : 'tiny')

export const modelName = (id: string, isShort = false) => {
  const brand = isShort ? '' : 'Claude '
  const familyFirst = FAMILY_FIRST.exec(id)

  if (familyFirst !== null) {
    const [, family = '', major = '', minor] = familyFirst

    return `${brand}${capitalize(family)} ${version(major, minor)}`
  }

  const versionFirst = VERSION_FIRST.exec(id)

  if (versionFirst !== null) {
    const [, major = '', minor, family = ''] = versionFirst

    return `${brand}${version(major, minor)} ${capitalize(family)}`
  }

  return id.replace(/\[[^\]]*\]$/, '')
}

export const providerName = (id: string) => {
  if (/(^|[./])anthropic\./.test(id)) {
    return 'Bedrock'
  }

  return id.includes('@') ? 'Vertex AI' : 'Anthropic'
}

export const effortLevel = (value: unknown) => {
  const level = typeof value === 'string' ? value.trim().toLowerCase() : ''

  return EFFORTS.includes(level) ? level : null
}

// Every level the matches of EFFORT_ENTRY name, oldest first.
export const announcedEfforts = (matches: string) =>
  matches.split('\n').flatMap(match => effortLevel(match.split(' ').at(-1)) ?? [])

export const formatTokens = (tokens: number) => {
  if (tokens < 1000) {
    return String(tokens)
  }

  return tokens < 999_950 ? `${(tokens / 1000).toFixed(1)}K` : `${(tokens / 1_000_000).toFixed(1)}M`
}

const usageText = ({ tokens, percent, usd }: Usage, size: Size) => {
  if (size === 'tiny') {
    return `${percent ?? 0}%`
  }

  const fill = `${formatTokens(tokens ?? 0)} (${percent ?? 0}%)`

  return size === 'compact' || usd === null ? fill : `${fill} · $${usd.toFixed(2)}`
}

const cursorText = ({ line, column, percent }: Cursor, size: Size) => {
  if (size === 'full') {
    return `Ln ${line}, Col ${column} · ${percent}%`
  }

  return size === 'compact' ? `${line}:${column} · ${percent}%` : `${line}:${column}`
}

// The engine's own labels beside the cursor (`focus`, `memory paused`) keep their place where there is room.
const labelled = (columns: number, modes: readonly string[], cursor: Cursor) =>
  `${columns >= 110 && modes.length > 0 ? `${modes.join(' & ')} · ` : ''}${cursorText(cursor, sizeOf(columns))}`

// The footer: the bar and the blanked row under it.
const FOOTER_ROWS = 2

// The rows around the draft in the fullscreen prompt: its two rules, the notice row above them and
// the footer.
const AROUND = 3 + FOOTER_ROWS

// The box grows with the draft until it stands five rows short of half the screen, then scrolls. The
// engine counts on a footer of one row there, so at its tallest the box pushes the tab row off the
// screen.
export const rowCap = (height: number, under: number) => Math.max(3, Math.floor(height / 2) - 5 - under)

// The band above the prompt is told the rows it may take: what the prompt leaves of half the screen.
// So the rows the box is drawn in follow from it, given the rows pinned under the box. A band left
// no rows says only that the box stands at its tallest or a row short of it, and the taller is taken;
// too small a screen says nothing.
export const boxRowsOf = (height: number, maxRows: number, under: number) => {
  if (height < 16) {
    return null
  }

  return maxRows >= 1 ? Math.floor(height / 2) - AROUND - under - maxRows : rowCap(height, under)
}

// Whether a draft laid out in `laid` rows stands in the rows the engine draws the box in.
export const standsIn = (height: number, maxRows: number, under: number, laid: number) => {
  const cap = rowCap(height, under)
  const shown = Math.min(laid, cap)

  return maxRows >= 1 ? boxRowsOf(height, maxRows, under) === shown : height >= 16 && shown >= cap - 1
}

// The percentage is vim's: how far down the draft the cursor's line is.
export const locate = (text: string, offset: number): Cursor => {
  const before = text.slice(0, offset)
  const line = before.split('\n').length
  const column = [...before.slice(before.lastIndexOf('\n') + 1)].length + 1

  return { line, column, percent: Math.round((line / text.split('\n').length) * 100) }
}

// A draft too long to lay out keeps its cursor and drops its text.
export const draftOf = (text: string, offset: number, isDecorated: boolean): Draft => ({
  ...locate(text, offset),
  text: text.length > MAX_LENGTH ? null : text,
  offset,
  isDecorated,
})

// The hint leads with the vim editor's marker (`-- INSERT --`, `-- VISUAL --`, nothing in normal mode),
// then with `! ` in shell mode; the default editor has no modes and always inserts. What is typed in
// shell mode is a command, so there `SHELL` stands for inserting.
export const editorMode = (hint: string, isVim: boolean) => {
  const marker = /^-- ([A-Z ]+) -- ?/.exec(hint)
  const mode = marker?.[1] ?? (isVim ? 'NORMAL' : 'INSERT')

  if (!hint.slice(marker?.[0].length ?? 0).startsWith('! ')) {
    return mode
  }

  return mode === 'INSERT' ? 'SHELL' : `SHELL ${mode}`
}

// Whether keys go into the draft as text, each of them an edit the engine raises.
export const isInserting = (mode: string) => mode === 'INSERT' || mode === 'SHELL'

const parse = (line: string): Record<string, unknown> | undefined => {
  try {
    const entry: unknown = JSON.parse(line)

    return typeof entry === 'object' && entry !== null ? { ...entry } : undefined
  } catch {
    return undefined
  }
}

// A name the person gave the session wins over the one Claude Code generated; of each, the last row.
export const pickTitle = (entries: string) => {
  let given = ''
  let generated = ''

  for (const line of entries.split('\n')) {
    const entry = parse(line)

    if (entry?.type === 'custom-title' && typeof entry.customTitle === 'string') {
      given = entry.customTitle
    }

    if (entry?.type === 'ai-title' && typeof entry.aiTitle === 'string') {
      generated = entry.aiTitle
    }
  }

  return given || generated || null
}

export const truncate = (text: string, max: number) => {
  const glyphs = [...text]

  return glyphs.length <= max ? text : `${glyphs.slice(0, max - 1).join('').trimEnd()}…`
}

// <config>/projects/<the project's path, each character outside a-z, A-Z and 0-9 a dash>/<session>.jsonl
export const transcriptPath = (configDirectory: string, root: string, sessionId: string) =>
  `${configDirectory}/projects/${root.replace(/[^a-zA-Z0-9]/g, '-')}/${sessionId}.jsonl`

const columnsOf = ({ mode, permission, model, provider, effort }: Segments) =>
  mode.length +
  2 +
  (permission === '' ? 0 : permission.length + (model === '' ? 1 : 3)) +
  (model === '' ? 0 : model.length + 1) +
  (provider === '' ? 0 : provider.length + 1) +
  (effort === '' ? 0 : effort.length + 3)

// The richest row that fits: the provider goes first, then the brand, then the effort, then the model.
const richest = (room: number, { mode, permission, model, effort }: Named): Segments => {
  const level = effort ?? ''
  const isKnown = model !== ''
  const name = isKnown ? modelName(model) : ''
  const shortName = isKnown ? modelName(model, true) : ''
  const rows = [
    { mode, permission, model: name, provider: isKnown ? providerName(model) : '', effort: level },
    { mode, permission, model: name, provider: '', effort: level },
    { mode, permission, model: shortName, provider: '', effort: level },
    { mode, permission, model: shortName, provider: '', effort: '' },
  ]

  return rows.find(row => columnsOf(row) <= room) ?? { mode, permission, model: '', provider: '', effort: '' }
}

const fitTitle = (room: number, title: string | null, min = 8) =>
  truncate(title ?? UNTITLED, clamp(room - 4, min, MAX_TITLE))

export const fitLeft = ({ title, ...facts }: Facts & { title: string | null }): Left => {
  const room = facts.columns - PILL_COLUMNS - RIGHT_COLUMNS[sizeOf(facts.columns)]

  return { ...richest(room, { ...facts, permission: '' }), title: fitTitle(room, title) }
}

export const fitRight = (columns: number, modes: readonly string[], cursor: Cursor, usage: Usage): Right => ({
  cursor: labelled(columns, modes, cursor),
  usage: usageText(usage, sizeOf(columns)),
})

// The tab row: the engine's own labels (`focus`, `memory paused`) keep their place where there is
// room, and the tab is never cut shorter than `New session`.
export const fitTabRow = (columns: number, title: string | null, modes: readonly string[], usage: Usage): TabRow => {
  const spent = usageText(usage, 'full')
  const note = columns >= 110 && modes.length > 0 ? `${modes.join(' & ')} · ${spent}` : spent

  return { columns, title: fitTitle(columns - 2 * EDGE - note.length - 2, title, UNTITLED.length + 1), note }
}

const roundHalfUp = (value: number) => Math.floor(value + 0.5)

// The footer's first row holds the engine's mark and then the mod's tree, which asks for the whole
// row and `tuning` cells more. The row takes what it lacks from each in proportion to what each
// asked for, and rounds as a layout does. These are the cells the mark is left.
const cellsKept = (cells: number, inner: number, tuning: number) => {
  const asked = cells + SEPARATOR

  return (asked * inner) / (asked + inner + tuning)
}

// A mark cut to fewer than half its cells would take a third row.
const MIN_KEPT = 0.6
// How far from a rounding edge each mark must stand for the cells it is left to be told for sure.
const CLEAR = 0.005
const MAX_TUNING = 64

const tellsApart = (inner: number, tuning: number) => {
  const kept = PERMISSIONS.map(({ cells }) => cellsKept(cells, inner, tuning))
  const isClear = kept.every(cells => Math.abs(cells - Math.floor(cells) - 0.5) >= CLEAR)
  const isWhole = kept.every((cells, index) => cells >= ((PERMISSIONS[index]?.cells ?? 0) + SEPARATOR) * MIN_KEPT)

  return isClear && isWhole && new Set(kept.map(roundHalfUp)).size === kept.length
}

// Two marks a cell apart can be left the same cells. Asking for a little more room moves where each
// one rounds, so the least is asked that leaves every mark its own; 0 where none does.
export const tuningOf = (columns: number) => {
  const inner = columns - 2 * EDGE
  const tunings = Array.from({ length: MAX_TUNING + 1 }, (_, tuning) => tuning)

  return tunings.find(tuning => tellsApart(inner, tuning)) ?? 0
}

// What the measuring strip posts, once it is known to be what it should.
export const readingOf = (data: unknown): Reading | null => {
  const posted: Record<string, unknown> = typeof data === 'object' && data !== null ? { ...data } : {}
  const { columns, of } = posted

  return typeof columns === 'number' && typeof of === 'number' ? { columns, of } : null
}

// The strip is as wide as the row less the mark, so its width names the mode: the one whose mark
// would be left exactly those cells, when there is one and only one.
export const permissionOf = (columns: number, reading: Reading | null): Permission | null => {
  if (reading === null || reading.of !== columns) {
    return null
  }

  const inner = columns - 2 * EDGE
  const tuning = tuningOf(columns)
  const found = PERMISSIONS.filter(({ cells }) => roundHalfUp(cellsKept(cells, inner, tuning)) === inner - reading.columns)

  return found.length === 1 ? (found[0] ?? null) : null
}

// The engine's own line names a key to cycle with in every mode but the manual one, and offers
// `? for shortcuts` in that one alone.
const contradicts = (hint: string, { mode }: Permission) =>
  mode === 'default' ? /\(\S+ to cycle\)/.test(hint) : hint.includes('? for shortcuts')

// Which versions of Claude Code a prompt was sent on with the label reading the mode the engine
// named, and which it read another on, as kept between sessions.
export const verdictsOf = (kept: unknown): Record<string, boolean> => {
  const held: Record<string, unknown> = typeof kept === 'object' && kept !== null ? { ...kept } : {}

  return Object.fromEntries(Object.entries(held).flatMap(([version, isTrue]) => (typeof isTrue === 'boolean' ? [[version, isTrue]] : [])))
}

// A version the label was checked on is believed until it reads wrong; any other, once it has read right.
export const isBelieved = (version: string, verdicts: Record<string, boolean>) => verdicts[version] ?? VERIFIED.includes(version)

// Two modes the engine marks alike cannot be told apart, which is no fault of the reading.
export const sharesMark = (read: string, said: string) => read === 'auto' && said === 'dontAsk'

type Drawn = Facts & {
  height: number
  hint: string
  draft: Draft
  box: Box
  suggestion: string | null
  reading: Reading | null
  title: string | null
  usage: Usage
  isFilled: boolean
  isRelabelled: boolean
  isBelieved: boolean
}

const OPEN: BlockRow = { text: null, isDim: false, fillFrom: null, gap: null }

// The engine paints typed text on the fill itself, until the draft changes with no keystroke; and in
// the vim editor's normal mode every change is one. There the text is drawn over, except while a
// selection is up, which only the engine can draw.
const isRedrawn = (mode: string, draft: Draft) => !mode.includes('VISUAL') && (mode.endsWith('NORMAL') || !draft.isDecorated)

// A prompt the engine offers stands in the box where one can be taken (anywhere but in shell mode),
// if it is text this file can count the cells of.
const emptyText = (mode: string, suggestion: string | null) =>
  mode.startsWith('SHELL') || suggestion === null || !isPlain(suggestion) ? placeholderOf(mode) : suggestion

const blockRows = (count: number, laid: readonly Row[] | null, room: number, facts: Drawn): BlockRow[] => {
  const { draft, mode, box, suggestion, isFilled } = facts
  const open = Array.from({ length: count }, () => OPEN)

  // Nothing is drawn beside the draft's text unless its rows here are the rows the engine drew.
  if (!isFilled || !box.isAligned || laid === null || laid.length !== count) {
    return open
  }

  // The engine's own placeholder is not the draft, so the empty box's one row is drawn whole.
  if (draft.text === '') {
    const text = truncate(emptyText(mode, suggestion), room)

    return [{ text, isDim: true, fillFrom: text.length, gap: null }]
  }

  const at = cursorIn(laid, draft.offset)

  return laid.map((row, index) => {
    const shown = row.text.trimEnd()
    const gap = at.row === index && at.column >= shown.length ? at.column : null

    return { text: isRedrawn(mode, draft) ? shown : null, isDim: false, fillFrom: shown.length, gap }
  })
}

export const fitBlock = (facts: Drawn): Block => {
  const { columns, height, draft, box, isFilled, isRelabelled } = facts
  const found = isRelabelled ? permissionOf(columns, facts.reading) : null
  // The bar names the mode in the mark's place only where the reading is believed, and nothing the
  // engine itself says of the mode stands against it.
  const named = found !== null && facts.isBelieved && !contradicts(facts.hint, found) ? found : null
  const slot = named === null ? MARK_SLOT : 0
  const at = cursorText(draft, sizeOf(columns))
  const cursor = at
  // The accent and a space lead the bar, two spaces end it, and two keep its halves apart.
  const bar = { ...richest(columns - cursor.length - (slot === 0 ? 4 : 6 + slot), { ...facts, permission: '' }), cursor }
  const room = columns - GUTTER - EDGE
  const laid = draft.text === null ? null : layOut(draft.text, room)
  const cap = rowCap(height, box.under)
  // A draft that stood in the engine's rows a moment ago is taken at its own count, which is known
  // first. Otherwise never fewer rows than either count: what is drawn above the draft must not land on it.
  const count = Math.min(cap, laid !== null && box.isAligned ? laid.length : Math.max(box.rows ?? 1, laid?.length ?? 1))

  return {
    columns,
    tuning: isRelabelled ? tuningOf(columns) : 0,
    bar,
    slot,
    mark: named?.mark ?? '',
    label: named?.label ?? '',
    usage: usageText(facts.usage, sizeOf(columns)),
    gap: Math.max(2, columns - (slot === 0 ? 0 : GUTTER + slot) - columnsOf(bar) - cursor.length - 2),
    rows: box.isPlaced ? blockRows(count, laid, room, facts) : null,
    under: box.under,
    isFilled,
    isMeasured: isRelabelled,
    read: found?.mode ?? null,
  }
}

// The bar on a row of its own, across the whole screen: its segments, the blank cells that keep its
// halves apart, and the cursor at its far end.
export type Bar = Segments & { cursor: string; gap: number }

export const fitBar = (facts: Facts, draft: Cursor): Bar => {
  const cursor = cursorText(draft, sizeOf(facts.columns))
  const row = richest(facts.columns - cursor.length - 4, { ...facts, permission: '' })

  return { ...row, cursor, gap: Math.max(2, facts.columns - columnsOf(row) - cursor.length - 2) }
}
