import type { Elements } from 'claude-code'

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

// The command line's field, which is typed into where nobody sees it: it stands in the band above
// the prompt, the one place a mod's field can take the keyboard, in a box of no height, and what
// is typed is drawn by the statusline mod in its bar, where vim has its command line.
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
