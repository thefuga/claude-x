import type { Elements } from 'claude-code'

import type { Menu } from '../../types'
import { EDGE, GIT_ICON, GUTTER, gitCells } from './format'
import type { Bar, Block, GitPart, Left, Line, MenuBlock, Right, Segments, TabRow } from './format'
import { badgeColor, permissionColor, theme } from './theme'

type Table = Pick<Elements['terminal'], 'Box' | 'Text'>

type Fields = Pick<Elements['terminal'], 'Box' | 'Button' | 'Input'>

// What the command line's field is drawn with: its address, the text it holds when drawn, what
// typing and Enter run, and the two elements beside it, which the keys that move the ring land on.
type Field = {
  key: string
  value: string
  onInput: (value: string) => void
  onSubmit: (value: string) => void
  guards: { previous: string; next: string }
}

type Terminal = Pick<Elements['terminal'], 'Box' | 'Text' | 'Client'>

type Fill = { backgroundColor?: string }

// A box over the screen's cells from `column`, `width` of them, `top` rows under the footer's first.
type Place = (top: number, column: number, width: number) => { position: 'absolute'; top: number; right: number; width: number }


// The width the right-hand site is given, so that where it starts is known.
const SITE = 24

const cells = (count: number) => ' '.repeat(Math.max(0, count))

// The mode, the permission mode, the model and the effort, on the block's fill when they are drawn there.
const segments = ({ Text }: Table, { mode, permission, model, provider, effort }: Segments, fill: Fill) => [
  <Text backgroundColor={badgeColor(mode)} color={theme.badge.text} bold>
    {` ${mode} `}
  </Text>,
  permission !== '' && (
    <Text {...fill} color={permissionColor(permission)} bold>
      {` ${permission}`}
    </Text>
  ),
  permission !== '' && model !== '' && (
    <Text {...fill} dimColor>
      {' ·'}
    </Text>
  ),
  model !== '' && <Text {...fill}>{` ${model}`}</Text>,
  provider !== '' && (
    <Text {...fill} dimColor>
      {` ${provider}`}
    </Text>
  ),
  effort !== '' && (
    <Text {...fill} dimColor>
      {' · '}
    </Text>
  ),
  effort !== '' && (
    <Text {...fill} color={theme.effort} bold>
      {effort}
    </Text>
  ),
]

export const SessionTab = ({ Text }: Table, title: string) => (
  <Text backgroundColor={theme.tab.background} color={theme.tab.text}>
    {` ≡ ${title} `}
  </Text>
)

export const StatusLeft = (table: Table, { title, ...row }: Left) => {
  const { Box } = table

  return (
    <Box flexDirection="column">
      <Box>{segments(table, row, {})}</Box>
      <Box>{SessionTab(table, title)}</Box>
    </Box>
  )
}

export const StatusRight = ({ Box, Text }: Table, { cursor, usage }: Right) => (
  <Box flexDirection="column" alignItems="flex-end">
    <Text dimColor>{cursor}</Text>
    <Text dimColor>{usage}</Text>
  </Box>
)

// The command line or its last answer, and after an open line the cell its cursor stands in.
const said = ({ Text }: Table, { text, hasCursor, isWarning }: Line) => [
  <Text color={isWarning ? theme.warning : undefined}>{` ${text}`}</Text>,
  hasCursor && <Text inverse> </Text>,
]

// The bar alone, in one row after the engine's own permission mark. While the command line has
// something to say, it says it after the mode's badge, and the completion picked after that.
export const StatusRow = (table: Table, row: Segments, line: Line | null, menu: Menu | null) => {
  const { Box, Text } = table
  const picked = menu?.items[menu.picked]

  if (line === null) {
    return <Box>{segments(table, row, {})}</Box>
  }

  return (
    <Box>
      {segments(table, { mode: row.mode, permission: '', model: '', provider: '', effort: '' }, {})}
      {said(table, line)}
      {picked !== undefined && <Text dimColor>{`  ${picked.name}`}</Text>}
    </Box>
  )
}

// The branch and the counts, before the usage at the end of the footer's last row.
const gitTexts = ({ Text }: Table, { branch, added, deleted }: GitPart, isLast: boolean) => [
  <Text color={theme.git.branch}>{`${GIT_ICON} ${branch}`}</Text>,
  added !== '' && <Text color={theme.git.added}>{` ${added}`}</Text>,
  deleted !== '' && <Text color={theme.git.deleted}>{` ${deleted}`}</Text>,
  !isLast && <Text>{'  '}</Text>,
]

// The completions, in rows that end on the bar's, from the screen's edge, so that nothing of the
// rows under them shows beside them, with the names under the name typed after the colon.
const menuRows = ({ Box, Text }: Table, menu: MenuBlock, place: (top: number, column: number, width: number) => object, bottom: number) =>
  menu.rows.map(({ name, description, isPicked }, index) => {
    const background = isPicked ? theme.menu.picked : theme.menu.background

    return (
      <Box {...place(bottom - menu.rows.length + 1 + index, 0, menu.width)}>
        <Text backgroundColor={background} color={isPicked ? theme.menu.pickedText : theme.menu.text} bold={isPicked}>
          {`  ${name.padEnd(menu.nameWidth)}  `}
        </Text>
        <Text backgroundColor={background} color={isPicked ? theme.menu.pickedText : theme.menu.description}>
          {description.padEnd(menu.width - menu.nameWidth - 4)}
        </Text>
      </Box>
    )
  })

// The command line's field, which is typed into where nobody sees it: it stands in the band above
// the prompt, the one place a mod's field can take the keyboard, in a box of no height, and what
// is typed is drawn in the footer, where vim has its command line.
export const CommandField = ({ Box, Button, Input }: Fields, { key, value, onInput, onSubmit, guards }: Field) => (
  <Box height={0} overflow="hidden">
    <Button key={guards.previous} onPress={() => undefined}>
      previous
    </Button>
    <Input key={key} value={value} autoFocus onInput={onInput} onSubmit={onSubmit} />
    <Button key={guards.next} onPress={() => undefined}>
      next
    </Button>
  </Box>
)

export const StatusNote = ({ Text }: Table, text: string) => <Text dimColor>{text}</Text>

// The engine draws the band's fold mark, `[-]`, over its last cells.
const CHROME = 4

// The session's tab and the usage, in the band above the prompt.
export const StatusTabs = (table: Table, { columns, title, note }: TabRow) => {
  const { Box, Text } = table

  return (
    <Box width={columns - CHROME}>
      {SessionTab(table, title)}
      <Box flexGrow={1} />
      <Text dimColor wrap="truncate-start">
        {note}
      </Text>
    </Box>
  )
}

// Drawn from the left-hand site, in the footer's first row. The engine keeps its permission mark at
// the head of that row and lays this tree out after it, so nothing here is placed from the tree's
// left edge: the tree asks for more than the row, which pins its right edge two cells short of the
// screen's, and every piece is placed from there. The bar goes over the engine's mark, and a copy
// of the mark on the row under it with the usage; where the mode is not known for sure the engine's
// own mark keeps a slot at the head of the bar, and the row under it has the usage alone. The line
// numbers go over the gutter of the prompt box, whose last row stands two rows above the footer's
// first: the box's rule is between them, and under the rule the rows other plugins pinned.
//
// A box that is to stand taller than its draft gets `pad` rows more: its own rule is blanked, the
// tree takes that many rows ahead of the bar, all but the last blanked too (the engine's mark is
// in the first, and wraps onto the second), and the last one is drawn as the rule.
//
// The footer's last row is the command line's, as the screen's last row is in vim: while it is open
// or has something to say, that stands where the copy of the mark does.
export const StatusBlock = (table: Terminal, { columns, tuning, bar, slot, gap, mark, label, line, menu, git, usage, numbers, pad, under, isMeasured }: Block) => {
  const { Box, Text, Client } = table
  const at: Place = (top, column, width) => ({ position: 'absolute', top, right: columns - EDGE - column - width, width })
  const start = slot === 0 ? 0 : GUTTER + slot
  const lead = mark === '' ? '' : ` ${mark}`
  const taken = line === null ? lead.length : line.text.length + (line.hasCursor ? 2 : 1)
  const ending = gitCells(git) + (git !== null && usage !== '' ? 2 : 0) + usage.length

  return (
    <Box flexDirection="column" height={pad + 2}>
      <Box height={0}>{isMeasured && <Client key="measure" module="./measure.tsx" props={{ of: columns }} flexGrow={1} height={0} />}</Box>
      <Box width={columns - 2 * EDGE + tuning} height={1} flexShrink={0} />
      {pad > 0 && (
        <Box {...at(-1, 0, columns)}>
          <Text>{cells(columns)}</Text>
        </Box>
      )}
      {Array.from({ length: Math.max(0, pad - 1) }, (_, row) => (
        <Box {...at(row, 0, columns)}>
          <Text>{cells(columns)}</Text>
        </Box>
      ))}
      {pad > 0 && (
        <Box {...at(pad - 1, 0, columns)}>
          <Text color="promptBorder">{'─'.repeat(columns)}</Text>
        </Box>
      )}
      <Box {...at(pad, start, columns - start)}>
        {segments(table, bar, {})}
        <Text>{cells(gap)}</Text>
        <Text dimColor>{`${bar.cursor}  `}</Text>
      </Box>
      <Box {...at(pad + 1, 0, columns)}>
        {line === null ? (
          <Text color={permissionColor(label)} dimColor={label === 'Manual'}>
            {lead}
          </Text>
        ) : (
          said(table, line)
        )}
        <Text>{cells(columns - taken - ending - 2)}</Text>
        {git !== null && gitTexts(table, git, usage === '')}
        <Text dimColor>{`${usage}  `}</Text>
      </Box>
      {menu !== null && menuRows(table, menu, at, pad)}
      {numbers?.map(
        (number, index) =>
          number !== null && (
            <Box {...at(index - numbers.length - 1 - under, 0, GUTTER)}>
              <Text dimColor={!number.isCurrent}>{number.label}</Text>
            </Box>
          ),
      )}
    </Box>
  )
}

// Drawn from the right-hand site, whose place is known from the screen's right edge: the usage in
// the site itself, and one row up, in place of the rule under the draft, the bar across the screen.
// The footer's own row, the engine's permission mark and hints in it, is left as the engine draws it.
export const StatusOver = (table: Table, columns: number, { cursor, gap, ...row }: Bar, usage: string, under: number) => {
  const { Box, Text } = table

  return (
    <Box width={SITE} flexShrink={0} justifyContent="flex-end">
      <Text dimColor wrap="truncate-start">
        {usage}
      </Text>
      <Box position="absolute" top={-1 - under} left={SITE + EDGE - columns} width={columns}>
        {segments(table, row, {})}
        <Text>{cells(gap)}</Text>
        <Text dimColor>{`${cursor}  `}</Text>
      </Box>
    </Box>
  )
}
