import type { On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'

import type { Echo, Menu } from '../types'

const FULLSCREEN = { columns: 120, rows: 40, isFullscreen: true }
const BAND = { plugin: 'vim', component: 'AbovePrompt', surface: 'terminal', viewport: FULLSCREEN, requestId: 'above-prompt' } as const
const START = { cwd: '/home/me/project', surface: 'terminal', isInteractive: true } as const
// The slash commands the engine has in these tests.
const COMMANDS = ['effort', 'exit', 'compact']
const HOME_DRAFT = 'draft:home:/home/me/project'

// What the band above the prompt is told: at 40 rows, 13 rows beside a one-row draft.
const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 13,
  bodyColumns: FULLSCREEN.columns,
  scroll: { offset: 0, bodyRows: 13 },
  view: {},
}

type World = {
  box: { text: string; cursor: number }
  kept: Record<string, unknown>
  // The slash commands run, each with what followed its name, and the turns cut short.
  ran: string[]
  aborted: string[]
  // Whether the band above the prompt still has the keyboard, as the engine answers a focus.
  hasKeyboard: boolean
  // What the mod wrote to the debug log: what went wrong in it and was passed over.
  logs: string[]
}

// What the engine answers beneath the mod.
const world = (on: On): World => {
  const held: World = { box: { text: '', cursor: 0 }, kept: {}, ran: [], aborted: [], hasKeyboard: true, logs: [] }

  on('store.get', ($, e) => ({ value: held.kept[e.key] }))
  on('store.set', ($, e) => {
    held.kept = { ...held.kept, [e.key]: e.value }

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    held.kept = Object.fromEntries(Object.entries(held.kept).filter(([key]) => key !== e.key))

    return { value: undefined }
  })
  on('session.turns', () => ({ value: 0 }))
  on('session.root', () => ({ value: '/home/me/project' }))
  on('session.id', () => ({ value: 'abc' }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('classic.SessionStart', () => ({}))
  on('classic.UserPromptSubmit', () => ({}))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.abort', ($, e) => {
    held.aborted = [...held.aborted, e.turnId]

    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    held.logs = [...held.logs, e.text]

    return { value: undefined }
  })
  on('command.list', () => ({ value: COMMANDS.map(name => ({ name, description: '', source: 'builtin' as const })) }))
  on('command.run', ($, e) => {
    if (!COMMANDS.includes(e.command)) {
      throw new Error(`no command named ${e.command}`)
    }

    held.ran = [...held.ran, `${e.command} ${e.args}`.trim()]

    return {}
  })
  on('ui.focus', () => (held.hasKeyboard ? {} : { deny: 'that site does not hold the keyboard' }))
  on('prompt.fill', ($, e) => {
    held.box = { text: e.text, cursor: e.text.length }

    return { isFilled: true }
  })
  on('prompt.read', () => ({ value: held.box }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })

  return held
}

// The statusline mod as far as these tests go: it reads the line's state and draws it, here as JSON.
const BAR: Plugin = {
  name: 'bar',
  register(on) {
    on('ui.render', { component: 'PromptHint' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      const [command, echo, menu] = await Promise.all([
        $.state.get({ plugin: 'vim', key: 'command' }),
        $.state.get({ plugin: 'vim', key: 'echo' }),
        $.state.get({ plugin: 'vim', key: 'menu' }),
      ])

      return <Text>{JSON.stringify({ command: command.value ?? null, echo: echo.value ?? null, menu: menu.value ?? null })}</Text>
    })
  },
}
const WITH_BAR = { plugins: [BAR] }

type Shown = { command: string | null; echo: Echo | null; menu: Menu | null }

// What the bar draws of the line: what is typed, what it said last, and the menu.
const barOf = async ($: Engine) => {
  const bar = await $.ui.mount({ plugin: 'bar', component: 'PromptHint', surface: 'terminal', viewport: FULLSCREEN, props: { isDraft: false, isWorking: false, hint: '' } })
  const shown = async (): Promise<Shown> => JSON.parse((await bar.find({ type: 'Text' }))?.text ?? '{}')

  return {
    typed: async () => (await shown()).command,
    said: async () => (await shown()).echo,
    offered: async () => (await shown()).menu,
  }
}

// The person's focus chord, or the ring the engine moves for Tab and the arrows, landing on `element`.
const focus = ($: Engine, element: string) =>
  $.ui.focus({ component: 'AbovePrompt', requestId: 'above-prompt', plugin: 'vim', element, origin: { kind: 'person' } })

describe('vim', () => {
  test('opens a command line in the band above the prompt, runs what is typed there and answers', WITH_BAR, async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })
    const { typed, said, offered } = await barOf($)
    const run = async (key: string, line: string) => {
      await focus($, key)
      await above.input({ key, text: line })
      await clock.advance(80)
    }

    // The field stands in a box of no height, for the chord to find.
    expect((await above.find({ type: 'Input' }))?.key).toBe('command:0')
    expect((await above.findAll({ type: 'Box' })).map(box => box.props.height)).toContain(0)
    expect(await typed()).toBe(null)

    await focus($, 'command:0')

    expect(await typed()).toBe('')

    held.box = { text: 'fix the bar', cursor: 11 }
    await above.input({ key: 'command:0', text: 'w', kind: 'change' })

    expect(await typed()).toBe('w')

    await above.input({ key: 'command:0', text: 'w' })

    expect(held.kept[HOME_DRAFT]).toBe('fix the bar')
    expect(await said()).toEqual({ text: 'draft saved', isWarning: false })
    expect(await typed()).toBe(null)
    expect(await above.find({ type: 'Input' }), 'left undrawn, which hands the keys back').toBeUndefined()

    await clock.advance(80)

    expect((await above.find({ type: 'Input' }))?.key, 'another field, with nothing typed in it').toBe('command:1')

    // A draft changed since it was saved keeps the session and itself from being dropped.
    held.box = { text: 'fix the bar and the tab', cursor: 0 }
    await run('command:1', 'q')

    expect(await said()).toEqual({ text: 'no write since last change (:q! to override)', isWarning: true })
    expect(held.ran).toEqual([])

    await run('command:2', 'e')

    expect((await said())?.text).toBe('no write since last change (add ! to override)')
    expect(held.box.text).toBe('fix the bar and the tab')

    await run('command:3', 'e!')

    expect(held.box).toEqual({ text: 'fix the bar', cursor: 11 })

    await run('command:4', 'q')

    expect(held.ran).toEqual(['exit'])

    // Any other name is a slash command's; one the engine does not know is said so.
    await run('command:5', 'compact keep the plan')
    await run('command:6', 'nosuch')

    expect(held.ran).toEqual(['exit', 'compact keep the plan'])
    expect((await said())?.text).toBe('unknown command: :nosuch')

    await clock.advance(3000)

    expect(await said(), 'an answer is taken down after a while').toBe(null)
    expect(held.logs).toEqual([])
  })

  test('completes the name typed in the command line: Tab opens and steps, Enter takes the pick, the next Enter runs', WITH_BAR, async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })
    const { typed, said, offered } = await barOf($)
    const names = async () => (await offered())?.items.map(({ name }) => name) ?? []
    const picked = async () => {
      const menu = await offered()

      return menu?.items[menu.picked]?.name
    }

    await focus($, 'command:0')
    await above.input({ key: 'command:0', text: 'e', kind: 'change' })

    expect(await focus($, 'complete:next'), 'the ring is kept on the field').toEqual({})
    expect(await names(), "the line's own first, then Claude Code's").toEqual(['e', 'edit', 'e!', 'edit!', 'effort', 'exit'])
    expect(await picked()).toBe('e')

    await focus($, 'complete:next')
    await focus($, 'complete:next')
    await focus($, 'complete:next')

    expect(await picked()).toBe('edit!')

    await focus($, 'complete:previous')
    await focus($, 'complete:previous')
    await above.input({ key: 'command:0', text: 'e' })

    expect(await typed(), 'the pick is in the line').toBe('edit')
    expect(await offered(), 'and the menu is down').toBe(null)

    await clock.advance(30)

    expect((await above.find({ type: 'Input' }))?.props, 'and in the field').toMatchObject({ value: 'edit' })

    // Typing narrows the completions; the next Enter runs what the line holds.
    await above.input({ key: 'command:0', text: 'comp', kind: 'change' })
    await focus($, 'complete:next')

    expect(await names()).toEqual(['compact'])

    await above.input({ key: 'command:0', text: 'comp' })
    await clock.advance(30)
    await above.input({ key: 'command:0', text: 'compact' })

    expect(held.ran).toEqual(['compact'])
  })

  test('closes the command line when Escape hands the keys back, and ends a running turn to quit by force', WITH_BAR, async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })
    const { typed, said, offered } = await barOf($)

    await focus($, 'command:0')
    await above.input({ key: 'command:0', text: 'wq', kind: 'change' })

    expect(await typed()).toBe('wq')

    // Escape raises nothing: the engine only refuses the next focus asked of the band.
    held.hasKeyboard = false
    await clock.advance(100)

    expect(await typed(), 'one refusal may be a ring on the move').toBe('wq')

    await clock.advance(100)

    expect(await typed()).toBe(null)

    held.hasKeyboard = true
    await clock.advance(80)
    await $.turn.start({ text: 'count to a hundred', turnId: 'turn-1' })
    await focus($, 'command:1')
    await above.input({ key: 'command:1', text: 'q' })

    expect((await said())?.text).toBe('session is running (:q! to override)')
    expect(held.ran).toEqual([])

    await clock.advance(80)
    await focus($, 'command:2')
    await above.input({ key: 'command:2', text: 'q!' })

    expect(held.aborted).toEqual(['turn-1'])
    expect(held.ran).toEqual(['exit'])
  })

  test('puts a saved draft back when its session is opened again, and drops it when a prompt is sent', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.kept = { 'draft:session:abc': 'the draft of that session', [HOME_DRAFT]: 'the draft of the folder' }
    await $.session.start(START)
    await clock.settle()

    await $.classic.SessionStart({ source: 'startup', session_id: 'abc' })
    await clock.settle()

    expect(held.box.text, 'a session nothing was sent in has the draft of its folder').toBe('the draft of the folder')

    held.box = { text: '', cursor: 0 }
    await $.classic.SessionStart({ source: 'resume', session_id: 'abc' })
    await clock.settle()

    expect(held.box.text).toBe('the draft of that session')

    held.box = { text: 'typed already', cursor: 0 }
    await $.classic.SessionStart({ source: 'resume', session_id: 'abc' })
    await clock.settle()

    expect(held.box.text, 'a box that holds text is left alone').toBe('typed already')

    await $.classic.UserPromptSubmit({ prompt: 'typed already', permission_mode: 'auto' })
    await clock.settle()

    expect(Object.keys(held.kept)).toEqual([HOME_DRAFT])
  })
})
