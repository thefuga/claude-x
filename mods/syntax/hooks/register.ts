import { atom, read } from 'claude-code'
import type { Register } from 'claude-code'

import { paint } from './paint'

// The editor's mode as the statusline mod reads it off the prompt's hint, where that mod is
// installed: in shell mode what is typed is a command, and is colored as one. Without it every
// draft is markdown.
const mode = atom({ plugin: 'statusline', key: 'mode' } as const, 'INSERT')

export const register: Register = on => {
  // Every keystroke passes here with the draft it leaves, and the engine paints the runs answered in
  // the frame it draws the text. It keeps them until the draft changes with no keystroke (a new line
  // from a key bound to one, an edit in the vim editor's normal mode), and nothing here can paint
  // again before the next one: the one call that paints a whole draft also moves the cursor to its end.
  on('prompt.edit', async ($, e, next) => {
    const edited = await next(e)
    const runs = paint(edited.text, (await read($, mode)).startsWith('SHELL'))

    return runs.length === 0 ? edited : { ...edited, decorations: [...(edited.decorations ?? []), ...runs] }
  })
}
