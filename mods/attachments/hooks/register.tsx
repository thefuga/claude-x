import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Chip, FileType } from '../types'
import { marksOf, withoutMark } from './draft'
import type { Mark, Mention } from './draft'
import {
  MAX_READ,
  PROBE,
  bytesOf,
  counted,
  expandedPath,
  factsOf,
  imagesFolder,
  mediaFactsOf,
  probed,
  shownPath,
  typeOfBytes,
  typeOfName,
  wantsBytes,
} from './files'
import { Chips } from './view'

// How often the draft is read: a paste, a completion or a history recall changes it with no event.
const POLL_MS = 250
const PROBE_TIMEOUT_MS = 3000
// How many files' descriptions are kept, each for the size and change time it was read at.
const KEPT = 256

type Described = { type: FileType; facts: string[] }

const chips = atom({ plugin: 'attachments', key: 'chips' } as const, [])

let poll: Timer | undefined
let home: string | undefined
// The folder this session's pasted pictures are saved in, where it could be worked out.
let images: string | null = null
// The draft last read, the chips last written for it, and which reading is the latest: a reading
// overtaken by a newer one while it looked at the disk writes nothing.
let seenDraft: string | undefined
let seenChips: string | undefined
let readings = 0
const described = new Map<string, Described>()

// Nothing here is worth failing a hook over: what cannot be read is left out of the chips.
const quietly = async ($: EngineInterface, label: string, work: Promise<unknown>) => {
  try {
    await work
  } catch (error) {
    $.ui.log(`${label}: ${String(error)}`, { to: 'debug' })
  }
}

const probe = async ($: EngineInterface, path: string) => {
  const run = await $.process.run(PROBE(path), { timeoutMs: PROBE_TIMEOUT_MS }).catch(() => null)

  return run?.exitCode === 0 ? probed(run.stdout) : null
}

// A file's type and the facts its chip shows, read once for each size and change time it has.
const describe = async ($: EngineInterface, path: string, size: number, mtimeMs: number): Promise<Described> => {
  const key = `${path}\n${size}\n${mtimeMs}`
  const held = described.get(key)

  if (held !== undefined) {
    return held
  }

  // A file that cannot be read (gone since, or not the person's to read) is told by its name and
  // size alone, and asked again next time.
  const named = typeOfName(path)
  const isRead = wantsBytes(named) && size <= MAX_READ
  const loaded = isRead ? await $.fs.read(path, { as: 'bytes' }).catch(() => null) : null
  const bytes = loaded === null ? null : bytesOf(loaded.base64)
  const type = named ?? (bytes === null ? 'unknown' : typeOfBytes(bytes))
  const facts = type === 'video' || type === 'audio' ? mediaFactsOf(await probe($, path), size) : factsOf(type, bytes, size)
  const fresh = { type, facts }

  if (described.size >= KEPT) {
    described.clear()
  }

  if (!isRead || loaded !== null) {
    described.set(key, fresh)
  }

  return fresh
}

// A pasted picture is saved as `<N>.<format>` the moment it is pasted. That copy is its only path:
// where it was pasted from reaches a mod only once the prompt is sent.
const imageChip = async ($: EngineInterface, mark: Extract<Mark, { kind: 'image' }>): Promise<Chip> => {
  const entries = images === null ? [] : await $.fs.list(images).catch(() => [])
  const entry = entries.find(({ name }) => name.startsWith(`${mark.number}.`))

  if (images === null || entry === undefined) {
    return { type: 'image', name: `Image #${mark.number}`, facts: [], mark: mark.text, at: mark.at }
  }

  const path = `${images}/${entry.name}`
  const { facts } = await describe($, path, entry.size, entry.mtimeMs)

  return { type: 'image', name: shownPath(path, home), facts, mark: mark.text, at: mark.at }
}

// A mention is a chip only while what it names is there: a sentence's stop after it is tried
// without, and anything else, an agent or an MCP resource, is none.
const mentionChip = async ($: EngineInterface, mark: Extract<Mark, { kind: 'mention' }>): Promise<Chip | null> => {
  const candidates: Mention[] = mark.bare === null ? [mark] : [mark, mark.bare]

  for (const { text, name, path } of candidates) {
    const found = expandedPath(path, home)
    const stat = await $.fs.stat(found).catch(() => undefined)

    if (stat === undefined) {
      continue
    }

    if (stat.kind === 'dir') {
      const entries = await $.fs.list(found).catch(() => [])

      return { type: 'folder', name: shownPath(name, home), facts: [counted(entries.length, 'entry', 'entries')], mark: text, at: mark.at }
    }

    return { ...(await describe($, found, stat.size, stat.mtimeMs)), name: shownPath(name, home), mark: text, at: mark.at }
  }

  return null
}

const chipOf = async ($: EngineInterface, mark: Mark): Promise<Chip | null> => {
  if (mark.kind === 'image') {
    return imageChip($, mark)
  }

  if (mark.kind === 'mention') {
    return mentionChip($, mark)
  }

  return { type: 'paste', name: `Pasted text #${mark.number}`, facts: mark.lines === null ? [] : [counted(mark.lines, 'line', 'lines')], mark: mark.text, at: mark.at }
}

const sync = async ($: EngineInterface) => {
  const { text } = await $.prompt.read()

  if (text === seenDraft) {
    return
  }

  seenDraft = text
  readings += 1
  const reading = readings
  const found = (await Promise.all(marksOf(text).map(mark => chipOf($, mark)))).filter(chip => chip !== null)
  const seen = JSON.stringify(found)

  if (reading === readings && seen !== seenChips) {
    seenChips = seen
    await update($, chips, () => found)
  }
}

// The chip's placeholder or mention out of the draft. Claude Code puts the cursor at the end of a
// draft a mod fills in.
const detach = async ($: EngineInterface, chip: Chip) => {
  const { text } = await $.prompt.read()
  const next = withoutMark(text, chip.mark, chip.at)

  if (next !== null) {
    await $.prompt.fill({ text: next, mode: 'replace' })
  }
}

// A session that starts, or another one opened in the same process (`/resume`, `/clear`): its
// pictures are saved in a folder of its own and its chips start empty, so the draft is read afresh.
const boot = async ($: EngineInterface, sessionId: string) => {
  home = await $.env.get('HOME')
  const temp = (await $.env.get('CLAUDE_CODE_TMPDIR')) ?? '/tmp'
  const user = await $.process.run(['id', '-u']).catch(() => null)
  images = user?.exitCode === 0 ? imagesFolder(temp, user.stdout.trim(), await $.session.root(), sessionId) : null
  seenDraft = undefined
  seenChips = undefined
  poll ??= $.clock.every(POLL_MS, () => {
    void quietly($, 'draft', sync($))
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void quietly($, 'start', $.session.id().then(id => boot($, id)))

    return started
  })

  on('classic.SessionStart', ($, e, next) => {
    void quietly($, 'session', boot($, e.session_id))

    return next(e)
  })

  // The chips stand above whatever else is drawn in the band, the vim mod's command line among it,
  // and give way to a survey.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)

    if (e.surface !== 'terminal' || e.props.hasSurvey) {
      return beneath
    }

    const shown = await read($, chips)

    if (shown.length === 0) {
      return beneath
    }

    const table = $.ui.resolve(e)
    const { Box } = table

    return (
      <Box flexDirection="column">
        {Chips(table, shown, chip => {
          void quietly($, 'remove', detach($, chip))
        })}
        {beneath}
      </Box>
    )
  })
}
