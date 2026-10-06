import type { FsEntry, FsStat, On } from 'claude-code'
import { describe, expect, mock, test } from 'claude-code/testing'
import type { Mounted, Plugin } from 'claude-code/testing'

import type { IssueReference } from '../types'

const FULLSCREEN = { columns: 120, rows: 40, isFullscreen: true }
const BAND = { plugin: 'attachments', component: 'AbovePrompt', viewport: FULLSCREEN, requestId: 'above-prompt' } as const
const START = { cwd: '/home/me/project', surface: 'terminal', isInteractive: true } as const
const SESSION = 'a1b2c3d4-0000-4000-8000-000000000001'
const IMAGES = `/tmp/claude-1000/-home-me-project/${SESSION}/images`

// The issues mod as far as these tests go: the issues it has loaded for the draft, set by a command.
const ISSUES: Plugin = {
  name: 'issues',
  register(on) {
    on('command.run', { command: 'loaded' }, async ($, e) => {
      await $.state.set({ plugin: 'issues', key: 'references' }, JSON.parse(e.args))

      return {}
    })
  },
}
const LOADED = { command: 'loaded', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const
const loaded = (references: IssueReference[]) => ({ ...LOADED, args: JSON.stringify(references) })

// What the band above the prompt is told: at 40 rows, 13 rows beside a one-row draft.
const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 13,
  bodyColumns: FULLSCREEN.columns,
  scroll: { offset: 0, bodyRows: 13 },
  view: {},
}

const bytes = (text: string) => new Uint8Array([...text].map(char => char.charCodeAt(0)))
const base64Of = (data: Uint8Array) => (data as unknown as { toBase64: () => string }).toBase64()
const big = (value: number) => String.fromCharCode(...[24, 16, 8, 0].map(shift => (value >>> shift) & 255))
const PNG = bytes(`\x89PNG\r\n\x1a\n${big(13)}IHDR${big(1448)}${big(1086)}`)
const FFPROBE = JSON.stringify({ streams: [{ codec_type: 'video', width: 1280, height: 720 }], format: { duration: '42.0' } })

type World = {
  box: { text: string; cursor: number }
  // The files and folders the mod may look at, by the path it names them by.
  files: Record<string, Uint8Array>
  folders: Record<string, string[]>
  ran: string[]
  reads: string[]
  // Files the person may not read.
  locked: string[]
  logs: string[]
}

const fileStat = (data: Uint8Array): FsStat => ({ kind: 'file', size: data.length, mtimeMs: 1, isLink: false })

// The engine hands a relative path over as it lands from the working directory.
const lookUp = <T,>(table: Record<string, T>, path: string) =>
  table[path] ?? Object.entries(table).find(([key]) => !key.startsWith('/') && path.endsWith(`/${key}`))?.[1]

// What the engine answers beneath the mod: the prompt box, a file system and the commands it runs.
const world = (on: On): World => {
  const held: World = { box: { text: '', cursor: 0 }, files: {}, folders: {}, ran: [], reads: [], locked: [], logs: [] }

  mock.env(on, { HOME: '/home/me' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: SESSION }))
  on('session.root', () => ({ value: '/home/me/project' }))
  on('classic.SessionStart', () => ({}))
  on('prompt.read', () => ({ value: held.box }))
  on('prompt.fill', ($, e) => {
    held.box = { text: e.text, cursor: e.text.length }

    return { isFilled: true }
  })
  on('ui.log', ($, e) => {
    held.logs = [...held.logs, e.text]

    return { value: undefined }
  })
  on('fs.stat', ($, e) => {
    const file = lookUp(held.files, e.path)

    if (file !== undefined) {
      return { value: fileStat(file) }
    }

    if (lookUp(held.folders, e.path) !== undefined) {
      return { value: { kind: 'dir', size: 0, mtimeMs: 1, isLink: false } }
    }

    throw new Error(`ENOENT: ${e.path}`)
  })
  on('fs.list', ($, e) => {
    const names = lookUp(held.folders, e.path)

    if (names === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }

    return { value: names.map((name): FsEntry => ({ name, ...fileStat(held.files[`${e.path}/${name}`] ?? new Uint8Array()) })) }
  })
  on('fs.read', ($, e) => {
    const file = lookUp(held.files, e.path)
    held.reads = [...held.reads, e.path]

    if (held.locked.some(name => e.path.endsWith(`/${name}`))) {
      throw new Error(`EACCES: ${e.path}`)
    }

    if (file === undefined) {
      throw new Error(`ENOENT: ${e.path}`)
    }

    return { value: { base64: base64Of(file) } }
  })
  on('process.run', ($, e) => {
    held.ran = [...held.ran, e.argv[0] ?? '']
    const ran = (exitCode: number, stdout: string) => ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

    return e.argv[0] === 'id' ? ran(0, '1000\n') : e.argv[0] === 'ffprobe' ? ran(0, FFPROBE) : ran(127, '')
  })
  // What else stands in the band: the vim mod's command line, say.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text key="beneath">beneath</Text>
  })

  return held
}

// The person's draft, as the mod reads it a moment later.
const draft = async (held: World, clock: { advance: (ms: number) => Promise<void> }, text: string) => {
  held.box = { text, cursor: text.length }
  await clock.advance(250)
}

// What the band shows, Text by Text.
const texts = async (above: Pick<Mounted, 'findAll'>) => (await above.findAll({ type: 'Text' })).map(({ text }) => text)

describe('attachments', () => {
  test("shows a chip for each attachment of the draft: its type's glyph, its path and its facts", async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.files = {
      [`${IMAGES}/1.png`]: PNG,
      'README.md': bytes('one\ntwo\nthree\n'),
      'clip.mp4': bytes('not really a video'),
      NOTES: bytes('first\nsecond\n'),
    }
    held.folders = { [IMAGES]: ['1.png'], docs: ['a.md', 'b.md'] }
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, surface: 'terminal', props: BAND_PROPS })

    expect(await texts(above), 'nothing of its own for an empty draft').toEqual(['beneath'])

    await draft(held, clock, '[Image #1] [Pasted text #2 +30 lines] see @README.md, @docs @clip.mp4 @NOTES @nowhere.md and mail me@example.com')

    expect(await texts(above)).toEqual([
      '\uf1c5',
      '/tmp/claude-1000/…/images/1.png',
      '1448x1086 · 24 B',
      '\uf0ea',
      'Pasted text #2',
      '30 lines',
      '\uf0f6',
      'README.md',
      '3 lines · 14 B',
      '\uf114',
      'docs',
      '2 entries',
      '\uf1c8',
      'clip.mp4',
      '1280x720 · 0:42 · 18 B',
      '\uf0f6',
      'NOTES',
      '2 lines · 13 B',
      'beneath',
    ])
    expect(held.logs).toEqual([])
  })

  test('takes an attachment out of the draft with its ×, and the chip with it', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.files = { 'a.md': bytes('a\n'), 'b.md': bytes('b\n') }
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, surface: 'terminal', props: BAND_PROPS })

    await draft(held, clock, 'compare @a.md with @b.md')

    expect((await above.findAll({ type: 'Button' })).map(({ key }) => key)).toEqual(['remove:8', 'remove:19'])

    await above.press({ key: 'remove:8' })

    expect(held.box).toEqual({ text: 'compare with @b.md', cursor: 18 })

    await clock.advance(250)

    expect(await texts(above)).toEqual(['\uf0f6', 'b.md', '1 line · 2 B', 'beneath'])
  })

  test('shows each issue the draft names once the issues mod has loaded it, by its state', { plugins: [ISSUES] }, async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, surface: 'terminal', props: BAND_PROPS })

    await draft(held, clock, 'fix @#320 like @#12 and @#212, not @#5')

    expect(await texts(above), 'none is loaded yet').toEqual(['beneath'])

    // Loaded while the draft stays as it was.
    await $.command.run(
      loaded([
        { number: 320, title: 'Missing ownership check on /users/:userId/{personal-records,goals,achievements}', state: 'OPEN', isPull: false },
        { number: 12, title: 'An old crash', state: 'CLOSED', isPull: false },
        { number: 212, title: 'Align agent eligibility', state: 'MERGED', isPull: true },
      ]),
    )
    await clock.advance(250)

    expect(await texts(above)).toEqual([
      '\uf41b',
      '#320 Missing ownership check on /users/:use…',
      '\uf41d',
      '#12 An old crash',
      'closed',
      '\uf419',
      '#212 Align agent eligibility',
      'merged',
      'beneath',
    ])

    await above.press({ key: 'remove:4' })

    expect(held.box.text, 'its × takes the reference out').toBe('fix like @#12 and @#212, not @#5')
    expect(held.logs).toEqual([])
  })

  test('reads a file once for as long as it stays the same, and a video only through ffprobe', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.files = { 'clip.mp4': bytes('frames'), 'a.md': bytes('a\n') }
    await $.session.start(START)
    await clock.settle()

    await draft(held, clock, 'see @clip.mp4 and @a.md')
    await draft(held, clock, 'see @clip.mp4 and @a.md, both')
    await clock.advance(1000)

    expect(held.ran.filter(command => command === 'ffprobe')).toHaveLength(1)
    expect(held.reads.map(path => path.split('/').pop()), 'a video is only asked of ffprobe').toEqual(['a.md'])
  })

  test('tells a file it cannot read by its name and size, and reads it again next time', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.files = { 'notes.md': bytes('one\ntwo\n') }
    held.locked = ['notes.md']
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, surface: 'terminal', props: BAND_PROPS })

    await draft(held, clock, 'see @notes.md')

    expect(await texts(above)).toEqual(['\uf0f6', 'notes.md', '8 B', 'beneath'])

    held.locked = []
    await draft(held, clock, 'see @notes.md again')

    expect(await texts(above)).toEqual(['\uf0f6', 'notes.md', '2 lines · 8 B', 'beneath'])
  })

  test('gives way to a survey, and draws nothing off the terminal', async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    held.files = { 'a.md': bytes('a\n') }
    await $.session.start(START)
    await clock.settle()
    await draft(held, clock, '@a.md')
    const survey = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND_PROPS, hasSurvey: true } })
    const desktop = await $.ui.mount({ ...BAND, surface: 'desktop', props: BAND_PROPS })

    expect(await texts(survey)).toEqual(['beneath'])
    expect(await texts(desktop)).toEqual(['beneath'])
  })

  test("looks for the pictures of a session opened again in that session's own folder", async ($, on) => {
    const clock = mock.clock(on)
    const held = world(on)
    const other = '/tmp/claude-1000/-home-me-project/a1b2c3d4-0000-4000-8000-000000000002/images'
    held.files = { [`${other}/1.png`]: PNG }
    held.folders = { [other]: ['1.png'] }
    await $.session.start(START)
    await clock.settle()
    const above = await $.ui.mount({ ...BAND, surface: 'terminal', props: BAND_PROPS })

    await draft(held, clock, '[Image #1]')

    expect(await texts(above), 'not in this session').toEqual(['\uf1c5', 'Image #1', 'beneath'])

    await $.classic.SessionStart({ source: 'resume', session_id: 'a1b2c3d4-0000-4000-8000-000000000002' })
    await clock.advance(250)

    expect(await texts(above)).toEqual(['\uf1c5', '/tmp/claude-1000/…/images/1.png', '1448x1086 · 24 B', 'beneath'])
  })
})
