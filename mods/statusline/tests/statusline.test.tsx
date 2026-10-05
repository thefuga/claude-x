import type { ConfigRow, On, PromptEditInput, PromptEditResult } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'

import { EFFORT_ENTRY } from '../hooks/format'

const SURFACES = ['terminal', 'desktop'] as const
const VIEWPORT = { columns: 170, rows: 42, isFullscreen: false }
const FULLSCREEN = { columns: 120, rows: 40, isFullscreen: true }
const HINT = { plugin: 'statusline', component: 'PromptHint', viewport: VIEWPORT } as const
const MODES = { plugin: 'statusline', component: 'SessionMode', viewport: VIEWPORT, props: { modes: [] } } as const
const IDLE = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
// The engine's own line in any mode but the manual one.
const CYCLING = { ...IDLE, hint: '(shift+tab to cycle) · ← for agents' }
const BAND = { plugin: 'statusline', component: 'AbovePrompt', surface: 'terminal', viewport: FULLSCREEN, requestId: 'above-prompt' } as const
const BLOCK = { ...HINT, surface: 'terminal', viewport: FULLSCREEN } as const
const TABS = { ...MODES, surface: 'terminal', viewport: FULLSCREEN } as const
const FILL = '#4e4e4e'
// What the engine leaves the measuring strip at 120 columns, beside its mark for each mode.
const STRIP = { plan: 102, auto: 101, manual: 100 }

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

// What the band above the prompt is told when it is left `maxRows` rows: at 40 rows, 13 of them
// beside a one-row draft with nothing pinned under it.
const band = (maxRows: number) => ({
  hasSurvey: false,
  isWorking: false,
  maxRows,
  bodyColumns: FULLSCREEN.columns,
  scroll: { offset: 0, bodyRows: maxRows },
  view: {},
})

// The vim mod as far as the bar goes: its line's state, set here by a command so that a test can
// open the line, answer it and offer completions.
const VIM_MOD: Plugin = {
  name: 'vim',
  register(on) {
    on('command.run', { command: 'line' }, async ($, e) => {
      const [typed = '', answer = ''] = e.args.split('|')
      await $.state.set({ plugin: 'vim', key: 'command' }, typed === '' ? null : typed)
      await $.state.set({ plugin: 'vim', key: 'echo' }, answer === '' ? null : { text: answer, isWarning: answer.startsWith('no ') })
      await $.state.set(
        { plugin: 'vim', key: 'menu' },
        typed === 'e' ? { items: ['e', 'edit', 'e!'].map(name => ({ name, description: `${name} does` })), picked: 1, total: 3 } : null,
      )

      return {}
    })
  },
}
const LINE = { command: 'line', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const

const START = { cwd: '/home/me/open-claude', surface: 'terminal', isInteractive: true } as const
const LABELS = ['Manual', 'Auto', 'Plan', 'Accept edits', 'Bypass']
// The permission mode the bar names, where it names one.
const named = async (site: { findAll: (query: { type: 'Text' }) => Promise<{ text: string; props: Record<string, unknown> }[]> }) =>
  (await site.findAll({ type: 'Text' })).find(text => LABELS.includes(text.text.trim()))
const EFFORT = {
  command: 'effort',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 170 },
} as const
const VIM: ConfigRow = {
  key: 'editor',
  label: 'Editor mode',
  kind: 'choice',
  value: 'vim',
  options: ['normal', 'vim'],
  provider: { plugin: 'engine', tier: 'core' },
  isLocked: false,
}

// The slash commands the engine has in these tests.
const COMMANDS = ['effort', 'exit', 'compact']

type World = {
  box: { text: string; cursor: number }
  announced: string
  rows: ConfigRow[]
  settings: Record<string, unknown>
  reads: number
  version: string
  kept: Record<string, unknown>
  // The slash commands run, each with what followed its name, and the turns cut short.
  ran: string[]
  aborted: string[]
  // Whether the band above the prompt still has the keyboard, as the engine answers a focus.
  hasKeyboard: boolean
  // The working copy as git answers: the branch HEAD is on (null outside a repository), and the
  // lines `git diff --numstat` prints.
  branch: string | null
  numstat: string
  // What the mod wrote to the debug log: what went wrong in it and was passed over.
  logs: string[]
}

// What the engine answers beneath the mod: a session on Opus, on a
// version of Claude Code the permission label was checked on.
const world = (on: On): World => {
  const held: World = {
    box: { text: '', cursor: 0 },
    announced: '',
    rows: [],
    settings: {},
    reads: 0,
    version: '2.1.287',
    kept: {},
    ran: [],
    aborted: [],
    hasKeyboard: true,
    logs: [],
    branch: null,
    numstat: '',
  }

  mock.env(on, { HOME: '/home/me' })
  on('store.get', ($, e) => ({ value: held.kept[e.key] }))
  on('store.set', ($, e) => {
    held.kept = { ...held.kept, [e.key]: e.value }

    return { value: undefined }
  })
  on('store.delete', ($, e) => {
    held.kept = Object.fromEntries(Object.entries(held.kept).filter(([key]) => key !== e.key))

    return { value: undefined }
  })
  on('session.version', () => ({ value: { version: held.version } }))
  on('session.turns', () => ({ value: 0 }))
  on('classic.SessionStart', () => ({}))
  on('classic.PostToolUse', () => ({}))
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
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('command.list', () => ({ value: COMMANDS.map(name => ({ name, description: '', source: 'builtin' as const })) }))
  on('ui.focus', () => (held.hasKeyboard ? {} : { deny: 'that site does not hold the keyboard' }))
  on('prompt.fill', ($, e) => {
    held.box = { text: e.text, cursor: e.text.length }

    return { isFilled: true }
  })
  on('classic.ConfigChange', () => ({}))
  on('ui.message', () => ({}))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('session.root', () => ({ value: '/home/me/open-claude' }))
  on('session.id', () => ({ value: 'abc' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('config.list', () => ({ value: held.rows }))
  on('settings.read', () => ({ value: held.settings }))
  on('fs.exists', () => ({ value: true }))
  on('command.run', ($, e) => {
    if (!COMMANDS.includes(e.command)) {
      throw new Error(`no command named ${e.command}`)
    }

    held.ran = [...held.ran, `${e.command} ${e.args}`.trim()]

    return {}
  })
  on('classic.Stop', () => ({}))
  on('classic.PostModelSwitch', () => ({}))
  on('prompt.read', () => {
    held.reads += 1

    return { value: held.box }
  })
  on('prompt.edit', ($, e) => {
    held.box = {
      text: `${e.text.slice(0, e.start)}${e.inputText}${e.text.slice(e.end)}`,
      cursor: e.start + e.inputText.length,
    }

    return held.box
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.hint}</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
  on('process.run', ($, e) => {
    const ran = (exitCode: number, stdout: string) => ({
      value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    })

    if (e.argv[0] === 'git') {
      const outside = held.branch === null ? ran(128, '') : null

      if (e.argv.includes('symbolic-ref')) {
        return outside ?? ran(0, `${held.branch}\n`)
      }

      return outside ?? (e.argv.includes('diff') ? ran(0, held.numstat) : ran(128, ''))
    }

    return ran(0, e.argv.includes(EFFORT_ENTRY) ? held.announced : '')
  })

  return held
}

describe('status line', () => {
  test("draws the bar over the engine's mark, naming the mode in it", async ($, on) => {
    const clock = mock.clock(on)
    world(on)
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: CYCLING })
    const bar = async () => (await left.findAll({ type: 'Box' })).map(box => box.props).find(props => props.top === 0)

    expect((await left.find({ type: 'Text', text: 'INSERT' }))?.props).toMatchObject({ backgroundColor: '#b8bb26' })
    expect(await left.find({ type: 'Text', text: 'Claude Opus 5.5' })).toBeDefined()
    expect(await left.find({ type: 'Text', text: 'Ln 1, Col 1 · 100%' })).toBeDefined()
    expect(await left.find({ type: 'Text', text: '0 (0%)' })).toBeDefined()
    // Until the strip has been laid out the engine's own mark keeps a slot at the head of the bar.
    expect(await left.find({ type: 'Client' })).toBeDefined()
    expect(await bar()).toMatchObject({ right: -2, width: 91 })
    expect(await named(left)).toBeUndefined()

    await left.resize({ columns: STRIP.auto, rows: 0 })

    expect(await bar()).toMatchObject({ right: -2, width: 120 })
    expect(await named(left)).toMatchObject({ text: ' Auto', props: { color: '#fabd2f' } })

    await left.resize({ columns: STRIP.plan, rows: 0 })

    expect((await named(left))?.text).toBe(' Plan')

    // The engine's own line says a mode other than the manual one is on: the reading is not taken.
    await left.resize({ columns: STRIP.manual, rows: 0 })

    expect(await named(left)).toBeUndefined()

    await left.redraw(IDLE)

    expect((await named(left))?.text).toBe(' Manual')
  })

  test('holds its mark against the mode each prompt goes out under', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.version = '2.9.0'
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: CYCLING })
    await left.resize({ columns: STRIP.auto, rows: 0 })

    // A version of Claude Code the reading was never checked on: read, and not yet shown.
    expect(await named(left)).toBeUndefined()

    await $.classic.UserPromptSubmit({ prompt: 'hi', permission_mode: 'auto' })
    await clock.settle()

    expect((await named(left))?.text).toBe(' Auto')
    expect(held.kept).toEqual({ 'label-verdicts': { '2.9.0': true } })

    await $.classic.UserPromptSubmit({ prompt: 'hi', permission_mode: 'plan' })
    await clock.advance(150)

    expect(await named(left)).toBeUndefined()
    expect(held.kept).toEqual({ 'label-verdicts': { '2.9.0': false } })
  })

  test('keeps to one row after the mark where it cannot draw outside its site', async ($, on) => {
    const clock = mock.clock(on)
    world(on)
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...HINT, surface: 'terminal', props: IDLE })
    const right = await $.ui.mount({ ...MODES, surface: 'terminal' })

    expect(await left.find({ type: 'Text', text: 'INSERT' })).toBeDefined()
    expect(await left.findAll({ type: 'Box' })).toHaveLength(1)
    expect((await right.find({ type: 'Text' }))?.text).toBe('Ln 1, Col 1 · 100% · 0 (0%)')
  })

  test('follows the effort a turn ran at, the model it switched to and what it cost', async ($, on) => {
    const clock = mock.clock(on)
    world(on)
    await $.session.start(START)
    await $.classic.Stop({ stop_hook_active: false, effort: { level: 'xhigh' } })
    await $.classic.PostModelSwitch({
      from_model: 'claude-opus-5-5[1m]',
      to_model: 'claude-sonnet-5-5',
      requested_model: 'sonnet',
      source: 'command',
      context_tokens: 0,
      prompt_cache_warm: false,
      cache_ttl: '5m',
      estimated_cache_write_usd: 0,
      pricing: 'catalog',
    })
    await $.session.measure({
      context: { tokens: 19_700, window: 1_000_000, percent: 2 },
      rateLimits: [],
      cost: { usd: 0.13 },
      changed: ['context', 'cost'],
    })
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: IDLE })

    expect(await left.find({ type: 'Text', text: 'Claude Sonnet 5.5' })).toBeDefined()
    expect((await left.find({ type: 'Text', text: 'xhigh' }))?.props).toMatchObject({ color: '#fe8019', bold: true })
    expect(await left.find({ type: 'Text', text: '19.7K (2%) · $0.13' })).toBeDefined()
  })

  test('takes the effort `/effort` was given, and the one its picker left in the transcript', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await $.command.run({ ...EFFORT, args: 'max' })
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: IDLE })

    expect(await left.find({ type: 'Text', text: 'max' })).toBeDefined()

    await $.command.run(EFFORT)
    await clock.advance(2000)

    expect(await left.find({ type: 'Text', text: 'max' }), 'a cancelled picker changes nothing').toBeDefined()

    await $.command.run(EFFORT)
    held.announced = '"content":"<local-command-stdout>Set effort level to high\n'
    await clock.advance(100)

    expect(await left.find({ type: 'Text', text: 'high' })).toBeDefined()
  })

  test("shows the vim editor's mode in place of its marker, and yields to the engine's exit line", async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.rows = [VIM]
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: { ...IDLE, hint: '' } })

    expect((await left.find({ type: 'Text', text: 'NORMAL' }))?.props).toMatchObject({ backgroundColor: '#7fa598' })

    await left.redraw({ ...IDLE, hint: '-- VISUAL -- ← for agents' })

    expect(await left.find({ type: 'Text', text: 'VISUAL' })).toBeDefined()
    expect(await left.find({ type: 'Text', text: '--' })).toBeUndefined()

    await left.redraw({ ...IDLE, hint: 'Press Ctrl-C again to exit' })

    expect((await left.find({ type: 'Text' }))?.text).toBe('Press Ctrl-C again to exit')
  })

  test("numbers the draft's lines over the gutter of the prompt box", async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: { ...CYCLING, isDraft: true } })
    // The numbers are the only boxes two cells wide: the gutter's, placed from the screen's right edge.
    const gutter = async () => (await left.findAll({ type: 'Box' })).map(box => box.props).filter(props => props.width === 2)
    const number = async (label: string) => (await left.findAll({ type: 'Text' })).find(text => text.text === label)

    expect(await gutter(), 'the empty box: one row, two rows over the footer').toMatchObject([{ top: -2, right: 116 }])

    held.box = { text: 'fix the\nstatus line', cursor: 10 }
    await clock.advance(100)

    expect(await gutter()).toMatchObject([
      { top: -3, right: 116 },
      { top: -2, right: 116 },
    ])
    expect((await number('1 '))?.props).toMatchObject({ dimColor: true })
    expect((await number('2 '))?.props, "the cursor's line").toMatchObject({ dimColor: false })

    // An agent's transcript in view: its name stands in the gutter.
    const above = await $.ui.mount({ ...BAND, props: { ...band(13), view: { agentId: 'a1' } } })
    await clock.advance(0)

    expect(await gutter()).toEqual([])

    await above.redraw(band(13))
    await clock.advance(0)

    expect(await gutter()).toHaveLength(2)

    // Claude Code 2.1.289 tells the band a few columns short of the screen with nothing docked.
    await above.redraw({ ...band(13), bodyColumns: 115 })
    await clock.advance(0)

    expect(await gutter()).toHaveLength(2)

    // A pane docked beside the transcript: the prompt is narrower than the screen.
    await above.redraw({ ...band(13), bodyColumns: 80 })
    await clock.advance(0)

    expect(await gutter()).toEqual([])
  })

  test('keeps the box as tall as it is asked to, with rows of its own under the draft', { options: { minLines: 5 } }, async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: { ...CYCLING, isDraft: true } })
    const tops = async (text: string) =>
      (await left.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute' && box.text.includes(text)).map(box => box.props.top)
    const rule = '─'.repeat(120)

    // Until the mode is read the engine's own mark stands in the footer's first row: nothing is added.
    expect(await tops(rule)).toEqual([])
    expect(await tops('INSERT')).toEqual([0])

    await left.resize({ columns: STRIP.auto, rows: 0 })

    expect(await tops(rule), 'the rule, on the last of the four rows added').toEqual([3])
    expect(await tops('INSERT')).toEqual([4])
    expect(await tops(' '.repeat(120)), "the box's own rule, the rows over the engine's mark, and the row under the bar").toEqual([
      -1, 0, 1, 2, 5,
    ])
    expect(await tops('1 '), 'the numbers stay with the draft').toContain(-2)

    held.box = { text: 'one\ntwo\nthree\nfour\nfive', cursor: 0 }
    await clock.advance(100)

    expect(await tops(rule), 'a draft that fills the box').toEqual([])
    expect(await tops('INSERT')).toEqual([0])
  })

  test('stands the box taller while expanded, until a prompt is sent', { options: { minLines: 5, expandedLines: 8 } }, async ($, on) => {
    const clock = mock.clock(on)
    world(on)
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: { ...CYCLING, isDraft: true } })
    const rule = async () =>
      (await left.findAll({ type: 'Box' })).filter(box => box.props.position === 'absolute' && box.text.includes('─'.repeat(120))).map(box => box.props.top)
    await left.resize({ columns: STRIP.auto, rows: 0 })

    expect(await rule(), 'four rows added at five lines').toEqual([3])

    await $.command.run({ ...EFFORT, command: 'expand' })
    await left.redraw({ ...CYCLING, isDraft: true })

    expect(await rule(), 'seven rows added at eight lines').toEqual([6])

    await $.command.run({ ...EFFORT, command: 'expand' })
    await left.redraw({ ...CYCLING, isDraft: true })

    expect(await rule(), 'run again, back to five').toEqual([3])

    await $.command.run({ ...EFFORT, command: 'expand' })
    await $.classic.UserPromptSubmit({ prompt: 'hi', permission_mode: 'auto' })
    await clock.advance(0)
    await left.redraw({ ...CYCLING, isDraft: true })

    expect(await rule(), 'a prompt sent takes it back to five').toEqual([3])
  })

  test('numbers nothing with the option off', { options: { lineNumbers: false } }, async ($, on) => {
    const clock = mock.clock(on)
    world(on)
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: CYCLING })

    expect((await left.findAll({ type: 'Box' })).filter(box => box.props.width === 2)).toEqual([])
    expect(await left.find({ type: 'Text', text: 'INSERT' })).toBeDefined()
  })

  test("draws the vim mod's command line in the bar after the badge, and its completions above it", { plugins: [VIM_MOD] }, async ($, on) => {
    const clock = mock.clock(on)
    world(on)
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: { ...IDLE, isDraft: true } })
    const texts = async () => (await left.findAll({ type: 'Text' })).map(text => text.text)
    // The menu's rows as drawn: each name, and the one picked.
    const names = async () =>
      (await left.findAll({ type: 'Text' })).filter(text => text.text.startsWith('  ') && text.text.trim() !== '').map(text => text.text.trim())

    expect(await left.find({ type: 'Text', text: 'COMMAND' })).toBeUndefined()

    await $.command.run({ ...LINE, args: 'w' })

    expect(await left.find({ type: 'Text', text: 'COMMAND' }), 'the badge names the open line').toBeDefined()
    expect(await texts()).toContain(' :w')

    await $.command.run({ ...LINE, args: 'e' })

    expect(await names(), 'as many as the rows from under the box to the one above the bar').toEqual(['e', 'edit'])
    expect((await left.findAll({ type: 'Text' })).find(text => text.props.bold === true && text.text.startsWith('  '))?.text.trim()).toBe('edit')

    await $.command.run({ ...LINE, args: '|no write since last change' })

    expect(await left.find({ type: 'Text', text: 'COMMAND' })).toBeUndefined()
    expect((await left.find({ type: 'Text', text: 'no write since last change' }))?.props).toMatchObject({ color: '#fb4934' })
  })

  test('shows the branch and the lines changed before the usage, and reads them again after a tool call', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.branch = 'feat/footer-git'
    held.numstat = '3\t1\tnotes.txt\n-\t-\tlogo.png\n'
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: CYCLING })
    const texts = async () => (await left.findAll({ type: 'Text' })).map(text => text.text)

    expect(await texts()).toContain('\uf418 feat/footer-git')
    expect((await left.find({ type: 'Text', text: '+3' }))?.props).toMatchObject({ color: '#b8bb26' })
    expect((await left.find({ type: 'Text', text: '-1' }))?.props).toMatchObject({ color: '#fb4934' })

    held.numstat = ''
    await $.classic.PostToolUse({ tool_name: 'Edit', tool_input: {}, tool_response: {}, tool_use_id: 'toolu_1' })
    await clock.settle()

    expect(await texts(), 'a clean working copy has its branch alone').toContain('\uf418 feat/footer-git')
    expect(await left.find({ type: 'Text', text: '+3' })).toBeUndefined()

    held.branch = null
    await clock.advance(5000)

    expect(await texts(), 'outside a repository, nothing').not.toContain('\uf418 feat/footer-git')
  })

  test('takes up what a change to the settings brings: the vim editor, a status line under the box', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: { ...IDLE, hint: '' } })
    const gutter = async () => (await left.findAll({ type: 'Box' })).filter(box => box.props.width === 2)

    expect(await left.find({ type: 'Text', text: 'INSERT' })).toBeDefined()
    expect(await gutter()).toHaveLength(1)

    // The engine asks its hooks before it takes the change up.
    held.rows = [VIM]
    held.settings = { statusLine: { type: 'command', command: 'date' } }
    await $.classic.ConfigChange({ source: 'user_settings' })

    expect(await left.find({ type: 'Text', text: 'INSERT' })).toBeDefined()

    await clock.advance(150)

    expect(await left.find({ type: 'Text', text: 'NORMAL' })).toBeDefined()
    expect(await gutter(), 'a status line draws its rows between the box and the footer').toEqual([])
  })

  test('reads the cursor while the box holds a draft, and stops once it is empty', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const left = await $.ui.mount({ ...BLOCK, props: { ...IDLE, isDraft: true } })

    held.box = { text: 'fix the\nstatus line', cursor: 10 }
    await clock.advance(100)

    expect(await left.find({ type: 'Text', text: 'Ln 2, Col 3 · 100%' })).toBeDefined()

    held.box = { text: '', cursor: 0 }
    await clock.advance(100)

    expect(await left.find({ type: 'Text', text: 'Ln 1, Col 1 · 100%' })).toBeDefined()

    await left.redraw(IDLE)
    await clock.advance(100)
    const reads = held.reads
    await clock.advance(1000)

    expect(held.reads).toBe(reads)
  })
})
