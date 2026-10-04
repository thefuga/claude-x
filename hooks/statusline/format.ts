import type { Box, Cursor, Draft, Echo, FieldState, Git, Menu, Reading, Usage } from '../../types'
import { MAX_LENGTH, cursorIn, layOut } from './wrap'
import type { Row } from './wrap'

// The editor's mode, the permission mode where the bar names it (`''` where it does not), the model
// and the effort.
export type Segments = { mode: string; permission: string; model: string; provider: string; effort: string }

export type Right = { cursor: string; usage: string; git: string }

// The git part of the bar as drawn: the branch after its icon, and each count that is
// not zero.
export type GitPart = { branch: string; added: string; deleted: string }

// A number drawn over the box's gutter: the line's, and whether the cursor is on that line.
export type LineNumber = { label: string; isCurrent: boolean }

// What the bar says after its badge in place of the rest of its left half: the command line while it is
// open, with a cell after it for its cursor, or what the last command answered.
export type Line = { text: string; hasCursor: boolean; isWarning: boolean }

// The completions as drawn just above the command line, as vim's popup menu stands over its own:
// each row's name and description, cut to the menu's cells, and which row is picked.
export type MenuRow = { name: string; description: string; isPicked: boolean }

export type MenuBlock = { rows: MenuRow[]; nameWidth: number; width: number }


// What the left-hand site draws in the fullscreen terminal: the status bar on the footer's first row
// and a blank row under it, the line numbers over the prompt box's gutter, and the rows added under a
// box shorter than it is to stand. `under` is the rows other plugins pinned between the box and the
// footer. `slot` is the cells kept clear at the head of the bar for the engine's own permission mark,
// where the bar does not name the mode itself, and `read` the mode the mark's width says it is,
// believed or not.
export type Block = {
  columns: number
  tuning: number
  bar: Segments & { cursor: string }
  slot: number
  // The command line, which stands after the badge in place of the rest of the bar's left half.
  line: Line | null
  menu: MenuBlock | null
  // The git state and the usage, at the head of the bar's right half, before the cursor.
  git: GitPart | null
  usage: string
  // The blank cells between the bar's two halves, drawn so that they cover the engine's mark.
  gap: number
  // The line numbers drawn over the box's gutter, one entry for each row the box shows, from the
  // top: null on a row that carries a line on, and null in all where the gutter is left as the
  // engine draws it.
  numbers: readonly (LineNumber | null)[] | null
  // The rows drawn under a box shorter than it is to stand, so that it reads as that tall: its own
  // rule blanked, blank rows of the footer's under it, and a rule on the last of them.
  pad: number
  under: number
  read: string | null
}

// One permission mode as Claude Code marks it at the head of the footer: a symbol, the mode's name and
// ` on`, this many cells in all.
export type Permission = { mode: string; label: string; cells: number; mark: string }

type Size = 'full' | 'compact' | 'tiny'

type Facts = { columns: number; mode: string; model: string; effort: string | null }

type Named = Omit<Facts, 'columns'> & { permission: string }

export const ORIGIN: Draft = { line: 1, column: 1, percent: 100, text: '', offset: 0 }

export const UNPLACED: Box = { rows: null, under: 0, isAligned: false }

export const FIRST_FIELD: FieldState = { drawn: 0, isDown: false, value: '' }

export const NO_USAGE: Usage = { tokens: null, percent: null, usd: null }

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

// The box grows with the draft until it stands five rows short of half the screen, then scrolls.
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
export const draftOf = (text: string, offset: number): Draft => ({
  ...locate(text, offset),
  text: text.length > MAX_LENGTH ? null : text,
  offset,
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

export const truncate = (text: string, max: number) => {
  const glyphs = [...text]

  return glyphs.length <= max ? text : `${glyphs.slice(0, max - 1).join('').trimEnd()}…`
}

// The end of a text too long for its room: what is typed last is what has to show.
const tail = (text: string, max: number) => {
  const glyphs = [...text]

  return glyphs.length <= max ? text : `…${glyphs.slice(glyphs.length - Math.max(0, max - 1)).join('')}`
}

// The command line as vim draws it, a colon and what is typed, in `room` cells with its cursor; or
// the last answer, until it is taken down.
export const lineOf = (command: string | null, echo: Echo | null, room: number): Line | null => {
  if (command !== null) {
    return { text: tail(`:${command}`, room - 1), hasCursor: true, isWarning: false }
  }

  return echo === null ? null : { text: truncate(echo.text, room), hasCursor: false, isWarning: echo.isWarning }
}

// <config>/projects/<the project's path, each character outside a-z, A-Z and 0-9 a dash>/<session>.jsonl
export const transcriptPath = (configDirectory: string, root: string, sessionId: string) =>
  `${configDirectory}/projects/${root.replace(/[^a-zA-Z0-9]/g, '-')}/${sessionId}.jsonl`

// The cells the bar's left half takes: the badge and a cell either side of it, then each segment.
export const columnsOf = ({ mode, permission, model, provider, effort }: Segments) =>
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

export const fitLeft = (facts: Facts): Segments =>
  richest(facts.columns - PILL_COLUMNS - RIGHT_COLUMNS[sizeOf(facts.columns)], { ...facts, permission: '' })

// opencode.vim's icon for the branch, Nerd Font's `nf-oct-git_branch`, and how long a branch's
// name is let stand: cut to fit, but not below the shorter.
export const GIT_ICON = '\uf418'
const MAX_BRANCH = 24
const MIN_BRANCH = 8

// The cells the git part takes: the icon, a space, the branch, and each count after a space.
export const gitCells = (part: GitPart | null) =>
  part === null ? 0 : 2 + part.branch.length + (part.added === '' ? 0 : part.added.length + 1) + (part.deleted === '' ? 0 : part.deleted.length + 1)

// The git part and the usage in `room` cells, two between them. What gives way first is what
// opencode.vim lets go first: the usage, then the counts, then the branch's length.
export const fitGit = (room: number, git: Git | null, usage: string): { git: GitPart | null; usage: string } => {
  if (git === null) {
    return { git: null, usage: usage.length <= room ? usage : '' }
  }

  const branch = truncate(git.branch, MAX_BRANCH)
  const counted = { branch, added: git.additions > 0 ? `+${git.additions}` : '', deleted: git.deletions > 0 ? `-${git.deletions}` : '' }
  const bare = { branch, added: '', deleted: '' }

  if (gitCells(counted) + 2 + usage.length <= room) {
    return { git: counted, usage }
  }

  const fitting = [counted, bare].find(part => gitCells(part) <= room)

  if (fitting !== undefined) {
    return { git: fitting, usage: '' }
  }

  return room - 2 >= MIN_BRANCH ? { git: { ...bare, branch: truncate(branch, room - 2) }, usage: '' } : { git: null, usage: '' }
}

// The menu shows this many completions at most, and stays this narrow.
const MENU_ROWS = 8
const MENU_NAME = 24
const MENU_WIDTH = 72

// A window of the completions the hooks keep that holds the picked one, in the rows there are: the
// menu covers the rows of the prompt box and the bar, and nothing can be drawn above the box.
export const menuOf = (menu: Menu | null, rows: number, room: number): MenuBlock | null => {
  const shown = Math.min(rows, MENU_ROWS)

  if (menu === null || menu.items.length === 0 || shown < 1) {
    return null
  }

  const first = clamp(menu.picked - Math.floor(shown / 2), 0, Math.max(0, menu.items.length - shown))
  const items = menu.items.slice(first, first + shown)
  const nameWidth = Math.min(MENU_NAME, Math.max(...items.map(({ name }) => name.length)))
  // Two cells lead the name, two keep it off the description, and one ends the row.
  const width = Math.min(room, MENU_WIDTH, nameWidth + 5 + Math.max(...items.map(({ description }) => description.length)))
  const told = Math.max(0, width - nameWidth - 5)

  return {
    rows: items.map(({ name, description }, index) => ({
      name: truncate(name, nameWidth),
      description: truncate(description, told),
      isPicked: first + index === menu.picked,
    })),
    nameWidth,
    width,
  }
}

// The command line where the bar is one row after the engine's mark: what that row has room for.
export const fitLine = (columns: number, mode: string, command: string | null, echo: Echo | null) =>
  lineOf(command, echo, columns - PILL_COLUMNS - RIGHT_COLUMNS[sizeOf(columns)] - mode.length - 4)

// Where the footer is the engine's, one line of text: the git part where the screen is wide.
export const fitRight = (columns: number, modes: readonly string[], cursor: Cursor, usage: Usage, git: Git | null = null): Right => {
  const part = sizeOf(columns) === 'full' ? fitGit(MAX_BRANCH + 16, git, '').git : null

  return {
    cursor: labelled(columns, modes, cursor),
    usage: usageText(usage, sizeOf(columns)),
    git: part === null ? '' : [`${GIT_ICON} ${part.branch}`, part.added, part.deleted].filter(text => text !== '').join(' '),
  }
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
  reading: Reading | null
  usage: Usage
  isNumbered: boolean
  // The rows the box is to stand at the least; 1 leaves it as the engine sizes it.
  minRows: number
  isBelieved: boolean
  command: string | null
  echo: Echo | null
  menu: Menu | null
  git: Git | null
}

// The gutter is two cells: a number under 10 keeps one clear of the text, one under 100 fills both,
// and past that only its last two digits fit.
export const gutterLabel = (line: number) => (line < 10 ? `${line} ` : String(line % 100).padStart(2, '0'))

// A box too short for its draft shows a window of its rows, and the engine keeps the cursor's row in
// the middle of it.
export const windowStart = (row: number, laid: number, cap: number) => clamp(row - Math.floor(cap / 2), 0, Math.max(0, laid - cap))

// The number of each row the box shows. The rows are the ones laid out here: the engine's own count
// goes by the room the band above the prompt is left, and whatever else stands under the prompt (its
// list of agents, a notice) takes from that room too. So that count only tells when the draft cannot
// stand in as many rows as were laid out, and then nothing is numbered.
const shownRows = (laid: readonly Row[] | null, cap: number, { box }: Drawn) => {
  const shown = laid === null ? null : Math.min(cap, laid.length)

  return shown === null || (!box.isAligned && box.rows !== null && box.rows < shown) ? null : shown
}

const lineNumbers = (laid: readonly Row[] | null, cap: number, facts: Drawn) => {
  const { draft, isNumbered } = facts

  if (!isNumbered || laid === null || shownRows(laid, cap, facts) === null) {
    return null
  }

  const from = windowStart(cursorIn(laid, draft.offset).row, laid.length, cap)

  return laid
    .map((row, index) => (laid[index - 1]?.line === row.line ? null : { label: gutterLabel(row.line), isCurrent: row.line === draft.line }))
    .slice(from, from + cap)
}

// The `minLines` option as a count of rows: a whole number from 1, which asks for nothing.
export const minRowsOf = (value: unknown) => (typeof value === 'number' && value >= 1 ? Math.floor(value) : 1)

// The `expandedLines` option: the rows the box stands at while expanded, never fewer than it stands
// at otherwise. The box cannot grow past what the engine lets it (half the screen, less the rows
// around the box), so a screen too short for them gets as many as fit, and the default is more
// than any screen fits: as tall as the box can stand.
export const EXPANDED_LINES = 100

export const expandedRowsOf = (value: unknown, minRows: number) =>
  Math.max(minRows, typeof value === 'number' && value >= 1 ? Math.floor(value) : EXPANDED_LINES)

// The rows to add under a box that shows fewer than it is to stand. They are the footer's own, so
// the engine's mark would stand in the first of them: none where the bar does not name the mode in
// the mark's place, and none where another plugin's row is pinned between the box and the footer.
const padRows = (shown: number | null, cap: number, slot: number, { box, minRows }: Drawn) =>
  shown === null || slot !== 0 || box.under > 0 ? 0 : Math.max(0, Math.min(minRows, cap) - shown)

export const fitBlock = (facts: Drawn): Block => {
  const { columns, height, draft, box } = facts
  const found = permissionOf(columns, facts.reading)
  // The bar names the mode in the mark's place only where the reading is believed, and nothing the
  // engine itself says of the mode stands against it.
  const named = found !== null && facts.isBelieved && !contradicts(facts.hint, found) ? found : null
  const slot = named === null ? MARK_SLOT : 0
  const start = slot === 0 ? 0 : GUTTER + slot
  const cursor = cursorText(draft, sizeOf(columns))
  // A cell leads the bar, two keep its halves apart and two end it. The git state and the usage take
  // at most half of what is left, with two cells before the cursor; the left half has the rest.
  const across = columns - start - cursor.length - 5
  const right = fitGit(Math.floor(across / 2) - 2, facts.git, usageText(facts.usage, sizeOf(columns)))
  const spent = gitCells(right.git) + (right.git !== null && right.usage !== '' ? 2 : 0) + right.usage.length
  const tail = spent === 0 ? 0 : spent + 2
  const bar = { ...richest(across - tail, { ...facts, permission: named?.label ?? '' }), cursor }
  const room = columns - GUTTER - EDGE
  const laid = draft.text === null ? null : layOut(draft.text, room)
  const cap = rowCap(height, box.under)
  const shown = shownRows(laid, cap, facts)
  const pad = padRows(shown, cap, slot, facts)

  return {
    columns,
    tuning: tuningOf(columns),
    bar,
    slot,
    // After the badge and a cell, up to two cells short of the bar's right half.
    line: lineOf(facts.command, facts.echo, across - facts.mode.length - tail - 3),
    // From the row under the box's top rule down to the one above the bar: the rows the box shows,
    // its bottom rule, the rows pinned under it and the rows added under those.
    menu: menuOf(facts.menu, (shown ?? 1) + 1 + box.under + pad, columns - 2 * EDGE),
    git: right.git,
    usage: right.usage,
    gap: Math.max(2, columns - start - columnsOf(bar) - tail - cursor.length - 2),
    numbers: lineNumbers(laid, cap, facts),
    pad,
    under: box.under,
    read: found?.mode ?? null,
  }
}
