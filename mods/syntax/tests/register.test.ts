import type { PromptEditInput, PromptEditResult } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'

type Edits = { edit: (e: PromptEditInput) => Promise<PromptEditResult> }

// The engine raises `prompt.edit` in a test as it does at the prompt, though this build's types
// leave the call off the test's `$`.
const raisesEdits = (prompt: object): prompt is Edits => typeof Reflect.get(prompt, 'edit') === 'function'

// The person typing into an empty box.
const type = async ($: Engine, inputText: string) => {
  if (!raisesEdits($.prompt)) {
    throw new Error('this engine raises no prompt.edit')
  }

  return $.prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText })
}

// The statusline mod as far as this one goes: the editor's mode it publishes, set here by a command.
const STATUSLINE: Plugin = {
  name: 'statusline',
  register(on) {
    on('command.run', { command: 'mode' }, async ($, e) => {
      await $.state.set({ plugin: 'statusline', key: 'mode' }, e.args)

      return {}
    })
  },
}
const MODE = { command: 'mode', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const

describe('syntax', () => {
  test('colors the draft as it is typed: its markdown, or in shell mode the command it is', { plugins: [STATUSLINE] }, async ($, on) => {
    on('prompt.edit', ($, e) => ({ text: `${e.text.slice(0, e.start)}${e.inputText}${e.text.slice(e.end)}`, cursor: e.start + e.inputText.length }))

    expect((await type($, '# fix')).decorations).toEqual([
      { start: 0, end: 5, color: '#fabd2f', bold: true },
      { start: 0, end: 1, color: '#8a8a8a', bold: false, italic: false, underline: false },
    ])

    // In shell mode, as the statusline mod reads it off the hint, a `#` starts a comment.
    await $.command.run({ ...MODE, args: 'SHELL' })

    expect((await type($, '# fix')).decorations).toEqual([{ start: 0, end: 5, color: '#8a8a8a', italic: true }])

    await $.command.run({ ...MODE, args: 'INSERT' })

    expect((await type($, 'plain words')).decorations).toBeUndefined()
  })

  test('colors every draft as markdown without the statusline mod', async ($, on) => {
    on('prompt.edit', ($, e) => ({ text: `${e.text.slice(0, e.start)}${e.inputText}${e.text.slice(e.end)}`, cursor: e.start + e.inputText.length }))

    expect((await type($, '# fix')).decorations).toHaveLength(2)
  })
})
