import type { Elements } from 'claude-code'

import type { List, Row } from '../types'
import { theme } from './theme'

type Parts = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Input'>

// What the list's field is drawn with: its address, the text it holds when drawn, and what typing
// and Enter run.
export type Field = {
  key: string
  value: string
  onInput: (value: string) => void
  onSubmit: (value: string) => void
}

// The field is drawn under a new key each time the list lets the keys go: the engine keeps what was
// typed in a field by its key.
export const fieldKey = (drawn: number) => `issues:${drawn}`

export const isField = (key: string | undefined) => key !== undefined && /^issues:\d+$/.test(key)

// The two elements drawn either side of the field. The engine moves the ring onto one for Tab or
// Down and for Shift+Tab or Up; that move is a step through the list instead.
export const NEXT = 'issues:next'
export const PREVIOUS = 'issues:previous'

// The most issues the list shows at once.
const ROWS = 6

// The keys, said right after what is typed: Claude Code keeps the arrows and Enter while the keys
// are in the prompt, so the way into the list is spelled out while there is something to pick.
const keysOf = ({ rows, isFocused }: List) =>
  isFocused ? '↑↓ pick · enter insert · esc back' : rows.length > 0 ? 'ctrl+x tab or click to pick' : null

// How many issues answer, once they are listed.
const countOf = ({ rows, open, repository }: List) =>
  repository === null ? null : rows.length === open ? `${open} open in ${repository}` : `${rows.length} of ${open} open`

// A title cut to `room` cells, an ellipsis at its end where it was cut.
const cut = (text: string, room: number) => {
  const chars = [...text]

  return chars.length <= room ? text : `${chars.slice(0, Math.max(0, room - 1)).join('')}…`
}

// One issue: its number in a column as wide as the widest shown and its title, which a click takes,
// and its labels after them where the title leaves them room. The rows not picked are drawn dim,
// and at full strength under the pointer.
const issueRow = ({ Box, Text, Button }: Parts, row: Row, isPicked: boolean, numbers: number, width: number, onPick: (number: number) => void) => {
  const number = `#${row.number}`.padEnd(numbers)
  const labels = row.labels.join(', ')
  const room = width - 2 - numbers - 2
  const isLabeled = labels !== '' && room - labels.length - 2 >= 24
  const title = cut(row.title, isLabeled ? room - labels.length - 2 : room)

  return (
    <Box key={`row:${row.number}`} flexDirection="row" width={width} paddingX={1} backgroundColor={isPicked ? theme.picked : theme.background}>
      <Button key={`pick:${row.number}`} plain dimColor={!isPicked} onPress={() => onPick(row.number)}>
        {`${number}  ${title}`}
      </Button>
      {isLabeled && <Text color={theme.hint}>{`  ${labels}`}</Text>}
    </Box>
  )
}

// The list, one row over the issues for what is typed and the keys, then as many issues as the band
// has rows for, round the picked one, which is marked; or the note that stands for them. The field
// the person's focus chord moves the keys into stands first, in a box of no height, so that its
// `autoFocus` is the band's first.
export const IssueList = (parts: Parts, list: List, field: Field | null, width: number, height: number, onPick: (number: number) => void) => {
  const { Box, Text, Button, Input } = parts
  const fit = Math.max(0, Math.min(ROWS, height - 1))
  const first = Math.max(0, Math.min(list.picked - Math.floor(fit / 2), list.rows.length - fit))
  const rows = list.rows.slice(first, first + fit)
  const numbers = Math.max(0, ...rows.map(({ number }) => String(number).length + 1))
  const keys = keysOf(list)
  const count = countOf(list)

  return (
    <Box flexDirection="column">
      {field !== null && (
        <Box height={0} overflow="hidden">
          <Button key={PREVIOUS} onPress={() => undefined}>
            previous
          </Button>
          <Input key={field.key} value={field.value} autoFocus onInput={field.onInput} onSubmit={field.onSubmit} />
          <Button key={NEXT} onPress={() => undefined}>
            next
          </Button>
        </Box>
      )}
      <Box flexDirection="row" width={width} paddingX={1} justifyContent="space-between" backgroundColor={theme.background}>
        <Box flexDirection="row">
          <Text color={theme.text} bold>{`@#${list.query}`}</Text>
          {list.isFocused && <Text inverse> </Text>}
          {keys !== null && <Text color={theme.keys}>{`  ${keys}`}</Text>}
        </Box>
        {count !== null && (
          <Text color={theme.hint} wrap="truncate-end">
            {count}
          </Text>
        )}
      </Box>
      {list.note !== null ? (
        <Box flexDirection="row" width={width} paddingX={1} backgroundColor={theme.background}>
          <Text color={list.note.isWarning ? theme.warning : theme.hint}>{list.note.text}</Text>
        </Box>
      ) : (
        rows.map((row, index) => issueRow(parts, row, first + index === list.picked, numbers, width, onPick))
      )}
    </Box>
  )
}
