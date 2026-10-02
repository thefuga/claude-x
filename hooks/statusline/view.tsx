import type { Elements } from 'claude-code'

import { EDGE, GUTTER } from './format'
import type { Bar, Block, Left, Right, Segments, TabRow } from './format'
import { badgeColor, permissionColor, theme } from './theme'

type Table = Pick<Elements['terminal'], 'Box' | 'Text'>

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

// The bar alone, in one row after the engine's own permission mark.
export const StatusRow = (table: Table, row: Segments) => {
  const { Box } = table

  return <Box>{segments(table, row, {})}</Box>
}

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
export const StatusBlock = (table: Terminal, { columns, tuning, bar, slot, gap, mark, label, usage, numbers, under, isMeasured }: Block) => {
  const { Box, Text, Client } = table
  const at: Place = (top, column, width) => ({ position: 'absolute', top, right: columns - EDGE - column - width, width })
  const start = slot === 0 ? 0 : GUTTER + slot
  const lead = mark === '' ? '' : ` ${mark}`

  return (
    <Box flexDirection="column" height={2}>
      <Box height={0}>{isMeasured && <Client key="measure" module="./measure.tsx" props={{ of: columns }} flexGrow={1} height={0} />}</Box>
      <Box width={columns - 2 * EDGE + tuning} height={1} flexShrink={0} />
      <Box {...at(0, start, columns - start)}>
        {segments(table, bar, {})}
        <Text>{cells(gap)}</Text>
        <Text dimColor>{`${bar.cursor}  `}</Text>
      </Box>
      <Box {...at(1, 0, columns)}>
        <Text color={permissionColor(label)} dimColor={label === 'Manual'}>
          {lead}
        </Text>
        <Text>{cells(columns - lead.length - usage.length - 2)}</Text>
        <Text dimColor>{`${usage}  `}</Text>
      </Box>
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
