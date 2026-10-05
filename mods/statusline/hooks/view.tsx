import type { Elements } from 'claude-code'

import type { Menu } from '../types'
import { EDGE, GIT_ICON, GUTTER, columnsOf, gitCells } from './format'
import type { Block, GitPart, Line, MenuBlock, Segments } from './format'
import { badgeColor, permissionColor, theme } from './theme'

type Table = Pick<Elements['terminal'], 'Box' | 'Text'>

type Terminal = Pick<Elements['terminal'], 'Box' | 'Text' | 'Client'>

// A box over the screen's cells from `column`, `width` of them, `top` rows under the footer's first.
type Place = (top: number, column: number, width: number) => { position: 'absolute'; top: number; right: number; width: number }

const cells = (count: number) => ' '.repeat(Math.max(0, count))

// The mode, the permission mode, the model and the effort.
const segments = ({ Text }: Table, { mode, permission, model, provider, effort }: Segments) => [
  <Text backgroundColor={badgeColor(mode)} color={theme.badge.text} bold>
    {` ${mode} `}
  </Text>,
  permission !== '' && (
    <Text color={permissionColor(permission)} bold>
      {` ${permission}`}
    </Text>
  ),
  permission !== '' && model !== '' && (
    <Text dimColor>
      {' ·'}
    </Text>
  ),
  model !== '' && <Text>{` ${model}`}</Text>,
  provider !== '' && (
    <Text dimColor>
      {` ${provider}`}
    </Text>
  ),
  effort !== '' && (
    <Text dimColor>
      {' · '}
    </Text>
  ),
  effort !== '' && (
    <Text color={theme.effort} bold>
      {effort}
    </Text>
  ),
]

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
    return <Box>{segments(table, row)}</Box>
  }

  return (
    <Box>
      {segments(table, { mode: row.mode, permission: '', model: '', provider: '', effort: '' })}
      {said(table, line)}
      {picked !== undefined && <Text dimColor>{`  ${picked.name}`}</Text>}
    </Box>
  )
}

// The branch and the counts, before the usage in the bar's right half.
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

export const StatusNote = ({ Text }: Table, text: string) => <Text dimColor>{text}</Text>

// Drawn from the left-hand site, in the footer's first row. The engine keeps its permission mark at
// the head of that row and lays this tree out after it, so nothing here is placed from the tree's
// left edge: the tree asks for more than the row, which pins its right edge two cells short of the
// screen's, and every piece is placed from there. The bar goes over the engine's mark and names the
// mode in it, with the git state and the usage before the cursor; where the mode is not known for
// sure the engine's own mark keeps a slot at the head of the bar. A blank row under the bar keeps it
// off the screen's last row (and covers what of the engine's mark wraps onto it). The line
// numbers go over the gutter of the prompt box, whose last row stands two rows above the footer's
// first: the box's rule is between them, and under the rule the rows other plugins pinned.
//
// A box that is to stand taller than its draft gets `pad` rows more: its own rule is blanked, the
// tree takes that many rows ahead of the bar, all but the last blanked too (the engine's mark is
// in the first, and wraps onto the second), and the last one is drawn as the rule.
//
// While the command line is open or has something to say, it stands in the bar after the badge.
export const StatusBlock = (table: Terminal, { columns, tuning, bar, slot, gap, line, menu, git, usage, numbers, pad, under }: Block) => {
  const { Box, Text, Client } = table
  const at: Place = (top, column, width) => ({ position: 'absolute', top, right: columns - EDGE - column - width, width })
  const start = slot === 0 ? 0 : GUTTER + slot
  const taken = line === null ? 0 : line.text.length + (line.hasCursor ? 2 : 1)
  const right = [git !== null && gitTexts(table, git, usage === ''), usage !== '' && <Text dimColor>{usage}</Text>, (git !== null || usage !== '') && <Text>{'  '}</Text>]

  return (
    <Box flexDirection="column" height={pad + 2}>
      <Box height={0}>
        <Client key="measure" module="./measure.tsx" props={{ of: columns }} flexGrow={1} height={0} />
      </Box>
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
        {line === null ? segments(table, bar) : segments(table, { mode: bar.mode, permission: '', model: '', provider: '', effort: '' })}
        {line !== null && said(table, line)}
        <Text>{cells(line === null ? gap : gap + columnsOf(bar) - bar.mode.length - 2 - taken)}</Text>
        {right}
        <Text dimColor>{`${bar.cursor}  `}</Text>
      </Box>
      <Box {...at(pad + 1, 0, columns)}>
        <Text>{cells(columns)}</Text>
      </Box>
      {numbers?.map(
        (number, index) =>
          number !== null && (
            <Box {...at(index - numbers.length - 1 - under, 0, GUTTER)}>
              <Text dimColor={!number.isCurrent}>{number.label}</Text>
            </Box>
          ),
      )}
      {menu !== null && menuRows(table, menu, at, pad - 1)}
    </Box>
  )
}
