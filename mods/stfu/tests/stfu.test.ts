import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'

const SPINNER = { plugin: 'stfu', component: 'Spinner', surface: 'terminal' } as const
const DURATION = { plugin: 'stfu', component: 'TurnDuration', surface: 'terminal' } as const

// The engine's own lines as far as a test goes: what it is handed, laid out as it draws it.
const engine = (on: On) => {
  on('ui.render', { component: 'Spinner' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return Text({ children: `${e.props.message ?? e.props.word}${e.props.suffix} (12s)` })
  })
  on('ui.render', { component: 'TurnDuration' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return Text({ children: `${e.props.word} for 3s` })
  })
}

describe('stfu', () => {
  test('drops the word from the running line and keeps a message that stands in for it', async ($, on) => {
    engine(on)
    const running = await $.ui.mount({ ...SPINNER, props: { word: 'Sauteing', message: null, suffix: '…', mode: 'thinking' } })
    const task = await $.ui.mount({ ...SPINNER, props: { word: 'Sauteing', message: 'Running tests', suffix: '…', mode: 'tool-use' } })

    expect((await running.find({ type: 'Text' }))?.text).toBe('  (12s)')
    expect((await task.find({ type: 'Text' }))?.text).toBe('Running tests… (12s)')
  })

  test('names the line that closes a turn with a plain verb', async ($, on) => {
    engine(on)
    const closed = await $.ui.mount({ ...DURATION, props: { word: 'Baked', durationMs: 3000 } })

    expect((await closed.find({ type: 'Text' }))?.text).toBe('Worked for 3s')
  })
})
