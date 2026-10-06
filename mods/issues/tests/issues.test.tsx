import type { On, PromptEditInput, PromptEditResult } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine, Mounted, Plugin } from 'claude-code/testing'

import { contextOf, issueOf } from '../hooks/github'

const FULLSCREEN = { columns: 120, rows: 40, isFullscreen: true }
const BAND = { plugin: 'issues', component: 'AbovePrompt', surface: 'terminal', viewport: FULLSCREEN, requestId: 'above-prompt' } as const
const START = { cwd: '/home/me/project', surface: 'terminal', isInteractive: true } as const
const SLUG = 'thefuga/opencode.vim'
const PERSON = { origin: { kind: 'composer' }, wait: false } as const

// What the band above the prompt is told: at 40 rows, 13 rows beside a one-row draft.
const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 13,
  bodyColumns: 115,
  scroll: { offset: 0, bodyRows: 13 },
  view: {},
}

// One issue as gh prints it.
const raw = (number: number, title: string, labels: string[] = [], body = '', state = 'OPEN') => ({
  number,
  title,
  state,
  body,
  labels: labels.map(name => ({ name })),
  assignees: [],
  author: { login: 'thefuga' },
  createdAt: '2026-09-01T10:00:00Z',
  updatedAt: '2026-09-03T16:30:44Z',
  url: `https://github.com/${SLUG}/issues/${number}`,
})

type Raw = ReturnType<typeof raw>

// The open issues, as gh lists them: the most recently opened first.
const OPEN = [
  raw(215, 'Show detected prompt references in a compact composer strip', ['enhancement']),
  raw(195, "slash autocomplete doesn't show skills", ['bug']),
  raw(161, 'Render the footer with the session tabs', [], 'The footer should show the tabs.'),
  raw(140, 'Rendering glitch in the compact popup', ['bug']),
  raw(16, 'Prefer the native renderer'),
]

type World = {
  box: { text: string; cursor: number }
  // The repository's origin, the issues gh lists and the closed ones it can fetch; what gh prints
  // when it fails, and whether it is installed at all.
  origin: string
  open: Raw[]
  closed: Raw[]
  ghFails: string | null
  hasGh: boolean
  // The commands run, each as one line.
  ran: string[]
  // Whether the band above the prompt still has the keyboard, as the engine answers a focus.
  hasKeyboard: boolean
  toasts: string[]
  logs: string[]
}

const printed = (exitCode: number, stdout: string, stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })

// What the engine answers beneath the mod: the prompt box, git and gh, and the band's keyboard.
const world = (on: On): World => {
  const held: World = {
    box: { text: '', cursor: 0 },
    origin: `git@github.com:${SLUG}.git`,
    open: OPEN,
    closed: [],
    ghFails: null,
    hasGh: true,
    ran: [],
    hasKeyboard: true,
    toasts: [],
    logs: [],
  }

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/home/me/project' }))
  on('prompt.read', () => ({ value: held.box }))
  on('prompt.fill', ($, e) => {
    held.box = { text: e.text, cursor: e.text.length }

    return { isFilled: true }
  })
  on('prompt.edit', ($, e) => ({ text: `${e.text.slice(0, e.start)}${e.inputText}${e.text.slice(e.end)}`, cursor: e.start + e.inputText.length }))
  on('prompt.submit', ($, e) => ({ text: e.text, context: e.context }))
  on('ui.focus', () => (held.hasKeyboard ? {} : { deny: 'that site does not hold the keyboard' }))
  on('ui.toast', ($, e) => {
    held.toasts = [...held.toasts, e.text]

    return { value: undefined }
  })
  on('ui.log', ($, e) => {
    held.logs = [...held.logs, e.text]

    return { value: undefined }
  })
  on('process.run', ($, e) => {
    const [command, verb, action, number] = e.argv
    held.ran = [...held.ran, e.argv.join(' ')]

    if (command === 'git') {
      return verb === 'rev-parse' ? printed(0, '/home/me/project\n') : printed(0, `${held.origin}\n`)
    }

    if (!held.hasGh) {
      throw new Error('spawn gh ENOENT')
    }

    if (held.ghFails !== null) {
      return printed(1, '', held.ghFails)
    }

    if (verb === 'issue' && action === 'list') {
      return printed(0, JSON.stringify(held.open))
    }

    const issue = [...held.open, ...held.closed].find(each => each.number === Number(number))

    return issue === undefined ? printed(1, '', `GraphQL: Could not resolve to an issue or pull request with the number of ${number}.`) : printed(0, JSON.stringify(issue))
  })
  // What else stands in the band: the vim mod's command line, say.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text key="beneath">beneath</Text>
  })

  return held
}

// The person's draft, as the mod reads it a moment later, and what the read set off settled.
const draft = async (held: World, clock: { advance: (ms: number) => Promise<void>; settle: () => Promise<void> }, text: string, cursor = text.length) => {
  held.box = { text, cursor }
  await clock.advance(250)
  await clock.settle()
}

type Edits = { edit: (e: PromptEditInput) => Promise<PromptEditResult> }

// The engine raises `prompt.edit` in a test as it does at the prompt, though this build's types
// leave the call off the test's `$`.
const raisesEdits = (prompt: object): prompt is Edits => typeof Reflect.get(prompt, 'edit') === 'function'

// One key typed into the box as it stands.
const type = async ($: Engine, held: World, inputText: string) => {
  if (!raisesEdits($.prompt)) {
    throw new Error('this engine raises no prompt.edit')
  }

  const { text, cursor } = held.box
  held.box = await $.prompt.edit({ origin: { kind: 'composer' }, text, cursor, start: cursor, end: cursor, inputText })
}

// What the band shows, in order: its Texts and the issues' rows, which are Buttons, leaving out the
// two the field's keys land on, which are never seen.
const texts = async (above: Pick<Mounted, 'findAll'>) =>
  (await above.findAll({}))
    .filter(({ type, key }) => type === 'Text' || (type === 'Button' && key?.startsWith('pick:') === true))
    .map(({ text }) => text)

// The issue the list has picked, by the key of its row.
const pickedRow = async (above: Pick<Mounted, 'findAll'>) => (await above.findAll({ type: 'Box' })).find(box => box.props.backgroundColor === 'selectionBg')?.key

// The person's focus chord, or the ring the engine moves for Tab and the arrows, landing on `element`.
const focus = ($: Engine, element: string) =>
  $.ui.focus({ component: 'AbovePrompt', requestId: 'above-prompt', plugin: 'issues', element, origin: { kind: 'person' } })

// The attachments mod as far as these tests go: it reads the issues this one loaded for the draft,
// and draws them here as JSON.
const READER: Plugin = {
  name: 'reader',
  register(on) {
    on('ui.render', { component: 'PromptHint' }, async ($, e) => {
      const { Text } = $.ui.resolve(e)
      const { value } = await $.state.get({ plugin: 'issues', key: 'references' })

      return <Text>{JSON.stringify(value ?? [])}</Text>
    })
  },
}

const referencesIn = async ($: Engine) => {
  const hint = await $.ui.mount({ plugin: 'reader', component: 'PromptHint', surface: 'terminal', viewport: FULLSCREEN, props: { isDraft: false, isWorking: false, hint: '' } })

  return async () => JSON.parse((await hint.find({ type: 'Text' }))?.text ?? '[]') as unknown[]
}

const contextFor = (issue: Raw) => {
  const read = issueOf(issue)

  return read === null ? '' : contextOf(read, SLUG)
}

describe('issues', () => {
  test('loads each issue the draft names for the attachments mod, the one still being typed left out', { plugins: [READER] }, async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.closed = [raw(7, 'An old crash', ['bug'], 'Long fixed.', 'CLOSED'), { ...raw(212, 'Align agent eligibility', [], '', 'MERGED'), url: `https://github.com/${SLUG}/pull/212` }]
    await $.session.start(START)
    await clock.settle()
    const named = await referencesIn($)
    const viewed = () => held.ran.filter(line => line.startsWith('gh issue view')).map(line => line.split(' ')[3])

    await draft(held, clock, 'compare @#161 with @#7, @#212 and @#9 then @#16')

    expect(await named(), '#9 has no issue, and #16 is still being typed').toEqual([
      { number: 161, title: 'Render the footer with the session tabs', state: 'OPEN', isPull: false },
      { number: 7, title: 'An old crash', state: 'CLOSED', isPull: false },
      { number: 212, title: 'Align agent eligibility', state: 'MERGED', isPull: true },
    ])
    expect(viewed()).toEqual(['161', '7', '212', '9'])

    await draft(held, clock, 'compare @#161 with @#7, @#212 and @#9 then @#16 ')

    expect((await named()).map(reference => (reference as { number: number }).number)).toEqual([161, 7, 212, 16])
    expect(viewed(), 'none twice, and #16 from the open issues its @# listed').toEqual(['161', '7', '212', '9'])

    // One gh had none of is asked for again a minute on.
    await clock.advance(60_000)
    await draft(held, clock, 'compare @#161 with @#7, @#212 and @#9 then @#16 again')

    expect(viewed().slice(4)).toEqual(['9'])

    await draft(held, clock, '')

    expect(await named()).toEqual([])
  })

  test('lists the open issues above the prompt as @# is typed, filtered by number or by title', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })

    expect(await texts(above), 'nothing of its own until @# is typed').toEqual(['beneath'])

    await draft(held, clock, 'fix @#')

    expect(await texts(above)).toEqual([
      '@#',
      '  ctrl+x tab or click to pick',
      `5 open in ${SLUG}`,
      '#215  Show detected prompt references in a compact composer strip',
      '  enhancement',
      "#195  slash autocomplete doesn't show skills",
      '  bug',
      '#161  Render the footer with the session tabs',
      '#140  Rendering glitch in the compact popup',
      '  bug',
      '#16   Prefer the native renderer',
      'beneath',
    ])
    expect(held.ran).toEqual([
      'git rev-parse --show-toplevel',
      'git config --get remote.origin.url',
      `gh issue list --repo ${SLUG} --state open --limit 100 --json number,title,state,body,labels,assignees,author,createdAt,updatedAt,url`,
    ])

    await draft(held, clock, 'fix @#ren')

    expect(await texts(above)).toEqual([
      '@#ren',
      '  ctrl+x tab or click to pick',
      '4 of 5 open',
      '#161  Render the footer with the session tabs',
      '#140  Rendering glitch in the compact popup',
      '  bug',
      '#16   Prefer the native renderer',
      '#215  Show detected prompt references in a compact composer strip',
      '  enhancement',
      'beneath',
    ])
    expect(await pickedRow(above)).toBe('row:161')

    await draft(held, clock, 'fix @#16, then')

    expect(await texts(above), 'the cursor is past the reference').toEqual(['beneath'])

    await draft(held, clock, 'fix @#16, then', 8)

    expect((await texts(above)).slice(0, 4)).toEqual(['@#16', '  ctrl+x tab or click to pick', '2 of 5 open', '#16   Prefer the native renderer'])
    expect(held.ran.filter(line => line.startsWith('gh issue list')), 'listed once').toHaveLength(1)

    await draft(held, clock, 'mail me@#16')

    expect(await texts(above)).toEqual(['beneath'])
    expect(held.logs).toEqual([])
  })

  test('picks from the list once the focus chord moves the keys into it: the arrows move, Enter makes the reference @#N', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })

    await draft(held, clock, 'fix @#ren')
    const field = await above.find({ type: 'Input' })

    expect(field?.key).toBe('issues:1')
    expect(field?.props, 'holding what is typed after @#, for the keys to carry on from').toMatchObject({ value: 'ren', autoFocus: true })

    await focus($, 'issues:1')

    expect((await texts(above)).slice(0, 4)).toEqual(['@#ren', ' ', '  ↑↓ pick · enter insert · esc back', '4 of 5 open'])
    expect(await focus($, 'issues:next'), 'the ring is kept on the field').toEqual({})

    await focus($, 'issues:next')
    await focus($, 'issues:previous')

    expect(await pickedRow(above)).toBe('row:140')

    await focus($, 'issues:previous')
    await focus($, 'issues:previous')

    expect(await pickedRow(above), 'round the ends').toBe('row:215')

    await focus($, 'issues:next')
    await focus($, 'issues:next')
    await above.input({ key: 'issues:1', text: 'ren' })

    expect(held.box).toEqual({ text: 'fix @#140 ', cursor: 10 })
    expect(await above.find({ type: 'Input' }), 'the list is down, and the keys back at the prompt').toBeUndefined()

    await clock.advance(250)

    expect(await texts(above)).toEqual(['beneath'])

    // A reference in the middle of the draft keeps what follows it.
    await draft(held, clock, 'see @#rend, and', 10)
    await focus($, 'issues:2')
    await above.input({ key: 'issues:2', text: 'rend' })

    expect(held.box.text).toBe('see @#161, and')
    expect(held.logs).toEqual([])
  })

  test('picks an issue with a click on its row, the keys left at the prompt', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })

    await draft(held, clock, 'fix @#ren')

    expect((await above.find({ key: 'pick:161' }))?.props, 'the rows not picked are dim').toMatchObject({ plain: true, dimColor: false })
    expect((await above.find({ key: 'pick:140' }))?.props).toMatchObject({ dimColor: true })

    await above.press({ key: 'pick:140' })

    expect(held.box).toEqual({ text: 'fix @#140 ', cursor: 10 })

    await clock.advance(250)

    expect(await texts(above)).toEqual(['beneath'])
    expect(held.logs).toEqual([])
  })

  test('narrows the list to what is typed in its field, and closes it on Escape until the reference changes', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })

    await draft(held, clock, 'see @#')
    await focus($, 'issues:1')
    await above.input({ key: 'issues:1', text: 'glit', kind: 'change' })

    expect(await texts(above)).toEqual(['@#glit', ' ', '  ↑↓ pick · enter insert · esc back', '1 of 5 open', '#140  Rendering glitch in the compact popup', '  bug', 'beneath'])
    expect(held.box.text, 'the draft is left as it is until a pick').toBe('see @#')

    // Escape raises nothing: the engine only refuses the next focus asked of the band.
    held.hasKeyboard = false
    await clock.advance(100)

    expect((await texts(above))[0], 'one refusal may be a ring on the move').toBe('@#glit')

    await clock.advance(100)

    expect(await texts(above)).toEqual(['beneath'])

    held.hasKeyboard = true
    await draft(held, clock, 'see @#')

    expect(await texts(above), 'the same reference').toEqual(['beneath'])

    await draft(held, clock, 'see @#1')

    expect((await texts(above)).slice(0, 3)).toEqual(['@#1', '  ctrl+x tab or click to pick', '4 of 5 open'])
    expect((await above.find({ type: 'Input' }))?.key, 'another field, with nothing typed in it').toBe('issues:2')
  })

  test('takes digits no open issue has as the number of a closed one, and hands the keys back on anything else', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })

    await draft(held, clock, '@#')
    await focus($, 'issues:1')
    await above.input({ key: 'issues:1', text: 'zzz', kind: 'change' })

    expect(await texts(above)).toEqual(['@#zzz', ' ', '  ↑↓ pick · enter insert · esc back', '0 of 5 open', 'no open issue answers zzz', 'beneath'])

    await above.input({ key: 'issues:1', text: 'zzz' })

    expect(held.box.text).toBe('@#')
    expect(await above.find({ type: 'Input' }), 'the keys are back at the prompt').toBeUndefined()

    await clock.advance(80)
    await focus($, 'issues:2')
    await above.input({ key: 'issues:2', text: '7', kind: 'change' })
    await above.input({ key: 'issues:2', text: '7' })

    expect(held.box.text).toBe('@#7 ')
  })

  test('sends each issue a prompt names with it, as gh has it now, for the model to read', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    const closed = raw(7, 'An old crash', ['bug'], 'Long fixed.', 'CLOSED')
    held.closed = [closed]
    await $.session.start(START)
    await clock.settle()

    const sent = await $.prompt.submit({ ...PERSON, text: 'compare @#161 with @#7, then @#161 again; not me@#140' })

    expect(sent.text, 'the prompt goes as typed').toBe('compare @#161 with @#7, then @#161 again; not me@#140')
    expect(sent.context).toEqual([contextFor(OPEN[2] as Raw), contextFor(closed)])
    expect(held.ran.filter(line => line.startsWith('gh'))).toEqual([
      `gh issue view 161 --repo ${SLUG} --json number,title,state,body,labels,assignees,author,createdAt,updatedAt,url`,
      `gh issue view 7 --repo ${SLUG} --json number,title,state,body,labels,assignees,author,createdAt,updatedAt,url`,
    ])
    expect(held.toasts, 'an issue that goes with the prompt is not announced').toEqual([])

    const one = await $.prompt.submit({ ...PERSON, text: 'fix @#161' })

    expect(one.context).toHaveLength(1)
  })

  test('says which issue could not go with a prompt, and sends the prompt all the same', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()

    const missing = await $.prompt.submit({ ...PERSON, text: 'look at @#9 and @#16' })

    expect(missing.context).toEqual([contextFor(OPEN[4] as Raw)])
    expect(held.toasts).toEqual(['could not attach @#9: gh: GraphQL: Could not resolve to an issue or pull request with the number of 9.'])

    // Where gh cannot answer, the copy the list was given stands in.
    await draft(held, clock, '@#')
    held.ghFails = 'error connecting to api.github.com'
    const offline = await $.prompt.submit({ ...PERSON, text: 'fix @#161' })

    expect(offline.context).toEqual([contextFor(OPEN[2] as Raw)])

    // A prompt that is not the person's is left as it is.
    const before = held.ran.length
    const plugin = await $.prompt.submit({ origin: { kind: 'plugin', name: 'other' }, wait: false, text: 'see @#161' })

    expect(plugin.context).toBeUndefined()
    expect(held.ran).toHaveLength(before)
  })

  test('says why there are no issues to list: no GitHub origin, no gh, or gh logged out', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.hasGh = false
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })

    await draft(held, clock, '@#')
    const [, said] = await above.findAll({ type: 'Text' })

    // What the engine says of a command it cannot start is its own: the note is a warning from gh.
    expect(said?.text).toMatch(/^gh /)
    expect(said?.props.color).toBe('warning')

    // A new reference lists again.
    held.hasGh = true
    held.ghFails = 'To get started with GitHub CLI, please run:  gh auth login'
    await draft(held, clock, '@#1 and @#', 10)

    expect(await texts(above)).toEqual(['@#', 'gh is not logged in: run gh auth login', 'beneath'])

    held.ghFails = null
    await draft(held, clock, '@#1 @#', 6)

    expect((await texts(above)).slice(0, 3)).toEqual(['@#', '  ctrl+x tab or click to pick', `5 open in ${SLUG}`])

    const sent = await $.prompt.submit({ ...PERSON, text: 'fix @#3' })

    expect(sent.context).toBeUndefined()
  })

  test('says so when no issue is open or none answers, with no key into a list that has nothing to pick', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })

    await draft(held, clock, 'fix @#zzz')

    expect(await texts(above)).toEqual(['@#zzz', '0 of 5 open', 'no open issue answers zzz', 'beneath'])

    held.open = []
    await clock.advance(5 * 60_000)
    await draft(held, clock, 'fix @#zzz and @#')

    expect(await texts(above), 'listed again five minutes on').toEqual(['@#', `0 open in ${SLUG}`, 'no open issues', 'beneath'])
  })

  test('says so where the folder is not a GitHub repository', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.origin = 'git@gitlab.com:me/project.git'
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })

    await draft(held, clock, '@#')

    expect(await texts(above)).toEqual(['@#', 'origin is not a github.com repository', 'beneath'])

    const sent = await $.prompt.submit({ ...PERSON, text: 'fix @#3' })

    expect(sent.context).toBeUndefined()
    expect(held.toasts).toEqual(['@#3 not attached: origin is not a github.com repository'])
    expect(held.ran.filter(line => line.startsWith('gh')), 'gh is never asked').toEqual([])
  })

  test('follows each typed key at once, and gives way to a survey and off the terminal', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, props: BAND_PROPS })
    const survey = await $.ui.mount({ ...BAND, requestId: 'survey', props: { ...BAND_PROPS, hasSurvey: true } })
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop', props: BAND_PROPS })

    await type($, held, 'fix @')
    await type($, held, '#')
    await clock.settle()

    expect((await texts(above)).slice(0, 3)).toEqual(['@#', '  ctrl+x tab or click to pick', `5 open in ${SLUG}`])
    expect(await texts(survey)).toEqual(['beneath'])
    expect(await texts(desktop)).toEqual(['beneath'])

    // A prompt that is sent takes the list with it.
    await $.prompt.submit({ ...PERSON, text: 'fix @#' })

    expect(await texts(above)).toEqual(['beneath'])
  })
})
