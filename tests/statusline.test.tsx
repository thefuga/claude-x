import type { ConfigRow, On, PromptEditInput, PromptEditResult } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'

import { EFFORT_ENTRY, PLACEHOLDER } from '../hooks/statusline/format'

const SURFACES = ['terminal', 'desktop'] as const
const VIEWPORT = { columns: 170, rows: 42, isFullscreen: false }
const FULLSCREEN = { columns: 120, rows: 40, isFullscreen: true }
const HINT = { plugin: 'open-claude', component: 'PromptHint', viewport: VIEWPORT } as const
const MODES = { plugin: 'open-claude', component: 'SessionMode', viewport: VIEWPORT, props: { modes: [] } } as const
const IDLE = { isDraft: false, isWorking: false, hint: '? for shortcuts' }
// The engine's own line in any mode but the manual one.
const CYCLING = { ...IDLE, hint: '(shift+tab to cycle) · ← for agents' }
const BAND = { plugin: 'open-claude', component: 'AbovePrompt', surface: 'terminal', viewport: FULLSCREEN } as const
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

// Another plugin with a status line of its own, pinned under the prompt until a turn ends.
const GAUGE: Plugin = {
  name: 'gauge',
  register(on) {
    on('session.start', async ($, e, next) => {
      const started = await next(e)
      $.ui.status('3 checks running')

      return started
    })
    on('classic.Stop', ($, e, next) => {
      $.ui.status(undefined)

      return next(e)
    })
  },
}
const START = { cwd: '/home/me/open-claude', surface: 'terminal', isInteractive: true } as const
const EFFORT = {
  command: 'effort',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 170 },
} as const
const TITLES = '{"type":"ai-title","aiTitle":"Update Claude Code mods","sessionId":"abc"}\n'
const VIM: ConfigRow = {
  key: 'editor',
  label: 'Editor mode',
  kind: 'choice',
  value: 'vim',
  options: ['normal', 'vim'],
  provider: { plugin: 'engine', tier: 'core' },
  isLocked: false,
}

type World = {
  box: { text: string; cursor: number }
  announced: string
  rows: ConfigRow[]
  reads: number
  version: string
  kept: Record<string, unknown>
}

// What the engine answers beneath the mod: a session on Opus with one title in its transcript, on a
// version of Claude Code the permission label was checked on.
const world = (on: On): World => {
  const held: World = { box: { text: '', cursor: 0 }, announced: '', rows: [], reads: 0, version: '2.1.287', kept: {} }

  mock.env(on, { HOME: '/home/me' })
  on('store.get', ($, e) => ({ value: held.kept[e.key] }))
  on('store.set', ($, e) => {
    held.kept = { ...held.kept, [e.key]: e.value }

    return { value: undefined }
  })
  on('session.version', () => ({ value: { version: held.version } }))
  on('classic.UserPromptSubmit', () => ({}))
  on('ui.message', () => ({}))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1_000_000 }, rateLimits: [] } }))
  on('session.root', () => ({ value: '/home/me/open-claude' }))
  on('session.id', () => ({ value: 'abc' }))
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('config.list', () => ({ value: held.rows }))
  on('settings.read', () => ({ value: {} }))
  on('fs.exists', () => ({ value: true }))
  on('command.run', () => ({}))
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
  on('prompt.suggest', () => ({ isShown: true }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>{e.props.hint}</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box />
  })
  on('process.run', ($, e) => ({
    value: {
      exitCode: 0,
      stdout: e.argv.includes(EFFORT_ENTRY) ? held.announced : TITLES,
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))

  return held
}

describe('status line', () => {
  test("draws the bar over the engine's mark and its own copy of the mark under it", async ($, on) => {
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
    expect(await left.find({ type: 'Text', text: 'mode on' })).toBeUndefined()

    await left.resize({ columns: STRIP.auto, rows: 0 })

    expect(await bar()).toMatchObject({ right: -2, width: 120 })
    expect((await left.find({ type: 'Text', text: 'auto mode on' }))?.props).toMatchObject({ color: '#fabd2f' })

    await left.resize({ columns: STRIP.plan, rows: 0 })

    expect((await left.find({ type: 'Text', text: 'plan mode on' }))?.text).toBe(' ⏸ plan mode on')

    // The engine's own line says a mode other than the manual one is on: the reading is not taken.
    await left.resize({ columns: STRIP.manual, rows: 0 })

    expect(await left.find({ type: 'Text', text: 'mode on' })).toBeUndefined()

    await left.redraw(IDLE)

    expect(await left.find({ type: 'Text', text: 'manual mode on' })).toBeDefined()
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
    expect(await left.find({ type: 'Text', text: 'auto mode on' })).toBeUndefined()

    await $.classic.UserPromptSubmit({ prompt: 'hi', permission_mode: 'auto' })
    await clock.settle()

    expect(await left.find({ type: 'Text', text: 'auto mode on' })).toBeDefined()
    expect(held.kept).toEqual({ 'label-verdicts': { '2.9.0': true } })

    await $.classic.UserPromptSubmit({ prompt: 'hi', permission_mode: 'plan' })
    await clock.advance(150)

    expect(await left.find({ type: 'Text', text: 'auto mode on' })).toBeUndefined()
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
