import { atom, read, update } from 'claude-code'
import type {
  EngineInterface,
  PromptBox,
  Register,
  RenderSurface,
  RenderViewport,
  SessionContextUsage,
  SessionCost,
  Timer,
} from 'claude-code'

import type { Box, MenuItem, Usage } from '../types'
import { HELP, NEXT, PREVIOUS, SAID, commandOf, completionsOf, draftKey, fieldKey, isField, keptDraft } from './commandline/commands'
import {
  EDGE,
  EFFORT_ENTRY,
  FIRST_FIELD,
  GUTTER,
  MIN_OVERLAID_COLUMNS,
  NO_USAGE,
  ORIGIN,
  TITLE_ENTRY,
  UNPLACED,
  announcedEfforts,
  boxRowsOf,
  draftOf,
  editorMode,
  effortLevel,
  fitBlock,
  fitLeft,
  fitLine,
  fitRight,
  isBelieved,
  isInserting,
  minRowsOf,
  pickTitle,
  readingOf,
  sharesMark,
  standsIn,
  transcriptPath,
  verdictsOf,
} from './statusline/format'
import { theme } from './statusline/theme'
import { CommandField, StatusBlock, StatusNote, StatusRow } from './statusline/view'
import { layOut } from './statusline/wrap'
import { paint } from './syntax/paint'

const POLL_MS = 100
// The vim editor's normal mode changes the draft with no event at all, so there it is read each frame or two.
const FAST_POLL_MS = 33
const SETTLE_MS = 150
const WIDE = 120
const TALL = 40
// Past the end of any draft: the engine clamps a decoration to the text.
const WHOLE_DRAFT = 1_000_000
// Where the verdicts on the permission label are kept between sessions.
const VERDICTS = 'label-verdicts'
// The slash command that quits.
const EXIT = 'exit'
// How often an open command line asks whether it still has the keyboard, how long its field is
// left undrawn to hand the keys back, and how long an answer stays in the footer.
const WATCH_MS = 100
const FIELD_DOWN_MS = 80
const ECHO_MS = 3000
// How long after Enter a completion is given to the field: the engine empties it once the submit
// has been answered. And how many completions are kept for the menu around the picked one.
const FIELD_VALUE_MS = 30
const MENU_KEPT = 16
// A prompt box is bound a moment after its session starts: how long a saved draft waits for one.
const BOX_WAITS = [0, 100, 400, 1500]

const input = atom({ plugin: 'open-claude', key: 'input' } as const, ORIGIN)
const box = atom({ plugin: 'open-claude', key: 'box' } as const, UNPLACED)
const isBoxPlain = atom({ plugin: 'open-claude', key: 'isBoxPlain' } as const, true)
const pins = atom({ plugin: 'open-claude', key: 'pins' } as const, [])
const suggestion = atom({ plugin: 'open-claude', key: 'suggestion' } as const, null)
const editor = atom({ plugin: 'open-claude', key: 'editor' } as const, 'INSERT')
const reading = atom({ plugin: 'open-claude', key: 'reading' } as const, null)
const isLabelBelieved = atom({ plugin: 'open-claude', key: 'isLabelBelieved' } as const, false)
const model = atom({ plugin: 'open-claude', key: 'model' } as const, '')
const effort = atom({ plugin: 'open-claude', key: 'effort' } as const, null)
const isVim = atom({ plugin: 'open-claude', key: 'isVim' } as const, false)
const title = atom({ plugin: 'open-claude', key: 'title' } as const, null)
const transcript = atom({ plugin: 'open-claude', key: 'transcript' } as const, null)
const usage = atom({ plugin: 'open-claude', key: 'usage' } as const, NO_USAGE)
const command = atom({ plugin: 'open-claude', key: 'command' } as const, null)
const echo = atom({ plugin: 'open-claude', key: 'echo' } as const, null)
const field = atom({ plugin: 'open-claude', key: 'commandField' } as const, FIRST_FIELD)
const menu = atom({ plugin: 'open-claude', key: 'menu' } as const, null)

let poll: { timer: Timer; ms: number } | undefined
let settle: Timer | undefined
let columns = WIDE
// Whether the last draw filled the draft's rows: only then is typed text given the fill's color.
let isFilling = false
let prompt: PromptBox = { text: '', cursor: 0 }
let edits = 0
// The draft the engine was last handed decorations for; it drops them when the draft changes unasked.
let decorated: string | undefined
// Whether the box was in shell mode when its hint was last drawn: what is typed there is a command.
let isShell = false
// The open command line: the timer that asks after its keyboard, the times in a row it was told no,
// what is typed in it, and the text its field was last given.
let line: { watch: Timer; denied: number; typed: string; given: string } | undefined
// The completions while they are up, and Claude Code's commands as fetched for this line.
let completion: { items: MenuItem[]; picked: number } | undefined
let natives: MenuItem[] | undefined
let answered: Timer | undefined
// The turn that is running, by the id it started under and by what the hint last said.
let turn: string | undefined
let isWorking = false
// Whether a prompt was sent in this session: until one is, its draft is kept for its folder.
let isStarted = false
// Whether a draft loaded back is painted as a typed one is.
let isPainted = true
let band: { maxRows: number; height: number } | undefined
// The plugins with a status line pinned under the prompt: a row each, between its rule and the footer.
let pinned = new Set<string>()
// The screen height and pinned rows at which a draft was last found standing in the engine's rows.
let placedFor: string | undefined
// The permission mode the engine's mark was last read as, believed or not.
let marked: string | null = null
let engine: string | undefined
let seenPrompt: string | undefined
let seenBox: string | undefined
// What keeps the draft's lines from being numbered, each learned on its own.
let isGutterTaken = false
let hasStatusLine = false
let seenPlain: boolean | undefined
let seenSuggestion: string | null | undefined
let seenEffort: string | null | undefined
let seenReading: string | undefined
let seenBelieved: boolean | undefined

// Nothing here is worth failing a hook over: what cannot be read stays as it was drawn.
const quietly = async ($: EngineInterface, label: string, work: Promise<unknown>) => {
  try {
    await work
  } catch (error) {
    $.ui.log(`${label}: ${String(error)}`, { to: 'debug' })
  }
}

const measured = (context: SessionContextUsage, cost: SessionCost | undefined): Usage => ({
  tokens: context.tokens ?? null,
  percent: context.percent ?? null,
  usd: cost?.usd ?? null,
})

const setSuggestion = async ($: EngineInterface, text: string | null) => {
  if (text !== seenSuggestion) {
    seenSuggestion = text
    await update($, suggestion, () => text)
  }
}

// Whether the rows laid out here are the rows the engine drew the box in: what is drawn beside the
// draft's text goes by the first and is only safe while the second agrees. The engine's count and
// the draft arrive apart, so a difference is only believed once both have settled; and a draft that
// is laid out here and still stands in other rows means the rows around it are not the known ones.
const verify = async ($: EngineInterface, isSettled: boolean) => {
  if (band === undefined) {
    return
  }

  const under = pinned.size
  const rows = boxRowsOf(band.height, band.maxRows, under)
  const laid = layOut(prompt.text, columns - GUTTER - EDGE)
  const isSame = laid !== null && standsIn(band.height, band.maxRows, under, laid.length)
  const key = `${band.height}:${under}`

  if (!isSame && !isSettled) {
    verifySoon($)

    return
  }

  if (isSame) {
    placedFor = key
  } else if (laid !== null) {
    placedFor = undefined
  }

  const next: Box = { rows, under, isAligned: isSame, isPlaced: placedFor === key }
  const seen = JSON.stringify(next)

  if (seen !== seenBox) {
    seenBox = seen
    await update($, box, () => next)
  }
}

const verifySoon = ($: EngineInterface) => {
  settle?.cancel()
  settle = $.clock.after(SETTLE_MS, () => {
    void quietly($, 'rows', verify($, true))
  })
}

const setPrompt = async ($: EngineInterface, next: PromptBox) => {
  prompt = next

  if (next.text === '') {
    poll?.timer.cancel()
    poll = undefined
  }

  const isDecorated = next.text !== '' && next.text === decorated
  const seen = `${isDecorated}:${next.cursor}:${next.text}`

  if (seen === seenPrompt) {
    return
  }

  seenPrompt = seen
  await update($, input, () => draftOf(next.text, next.cursor, isDecorated))

  if (next.text !== '') {
    await setSuggestion($, null)
  }

  verifySoon($)
}

const syncBox = async ($: EngineInterface) => {
  const before = edits
  const now = await $.prompt.read()

  // A keystroke landed while the box was being read: what its hook saw is the newer.
  if (before !== edits) {
    return
  }

  if (now.text !== prompt.text) {
    decorated = undefined
  }

  await setPrompt($, now)
}

// History recall, completion and the vim editor's normal mode all change the draft without raising
// `prompt.edit`, so the box is read on a timer for as long as it holds one.
const watchBox = ($: EngineInterface, ms: number) => {
  if (poll?.ms === ms) {
    return
  }

  poll?.timer.cancel()
  poll = {
    ms,
    timer: $.clock.every(ms, () => {
      void quietly($, 'cursor', syncBox($))
    }),
  }
}

// A draw cannot write, so the mode read off the hint is written on the next tick.
const publishEditor = ($: EngineInterface, label: string) => {
  $.clock.after(0, () => {
    void quietly($, 'mode', update($, editor, () => label))
  })
}

// The band above the prompt is drawn by nobody here; what it is told is how tall the prompt stands.
const noteBand = ($: EngineInterface, maxRows: number, height: number) => {
  band = { maxRows, height }
  $.clock.after(0, () => {
    void quietly($, 'rows', verify($, false))
  })
}

// The numbers go by a box that stands as the engine draws it for the main conversation: two cells
// of gutter beside the draft, and between the box and the footer only the rows other plugins pin.
const publishPlain = ($: EngineInterface) => {
  const isPlain = !isGutterTaken && !hasStatusLine

  if (isPlain === seenPlain) {
    return
  }

  seenPlain = isPlain
  $.clock.after(0, () => {
    void quietly($, 'box', update($, isBoxPlain, () => isPlain))
  })
}

// An agent's transcript in view puts the agent's name in the gutter, and a pane docked beside the
// transcript leaves the prompt narrower than it is laid out here.
const noteGutter = ($: EngineInterface, isTaken: boolean) => {
  isGutterTaken = isTaken
  publishPlain($)
}

// A status line command draws what it prints between the box and the footer, however many rows.
const syncStatusLine = async ($: EngineInterface) => {
  hasStatusLine = (await $.settings.read()).statusLine !== undefined
  publishPlain($)
}

// Another plugin pinned a status line, or took one down: a row under the prompt's rule either way.
// The engine lays the prompt out again for it, which is when the rows are checked.
const notePin = ($: EngineInterface, plugin: string, isUp: boolean) => {
  if (isUp === pinned.has(plugin)) {
    return
  }

  pinned = new Set(isUp ? [...pinned, plugin] : [...pinned].filter(name => name !== plugin))
  const names = [...pinned]
  $.clock.after(0, () => {
    void quietly($, 'pins', update($, pins, () => names))
  })
  verifySoon($)
}

const loadPins = async ($: EngineInterface) => {
  pinned = new Set([...(await read($, pins)), ...pinned])
}

// The strip in the footer's first row says how wide the engine laid it out.
const noteReading = async ($: EngineInterface, data: unknown) => {
  const next = readingOf(data)
  const seen = JSON.stringify(next)

  if (next !== null && seen !== seenReading) {
    seenReading = seen
    await update($, reading, () => next)
  }
}

const setBelieved = async ($: EngineInterface, isOn: boolean) => {
  if (isOn !== seenBelieved) {
    seenBelieved = isOn
    await update($, isLabelBelieved, () => isOn)
  }
}

// The label is read off how the engine lays its own mark out, which another version may do another
// way. So each version is believed on its record: what was checked when this was written, and since
// then what the label read each time a prompt went out under a mode the engine named.
const syncBelieved = async ($: EngineInterface) => {
  const { version } = await $.session.version()
  engine = version
  await setBelieved($, isBelieved(version, verdictsOf(await $.store.get(VERDICTS))))
}

// A prompt is sent under a mode the engine names: the one moment the label can be held against it.
// A mode changed in the same breath is drawn a moment later, so a difference is looked at twice.
const judgeLabel = async ($: EngineInterface, said: string) => {
  if (marked !== null && marked !== said) {
    await $.clock.sleep(SETTLE_MS)
  }

  const version = engine
  const found = marked

  if (version === undefined || found === null) {
    return
  }

  if (sharesMark(found, said)) {
    await setBelieved($, false)

    return
  }

  const verdicts = verdictsOf(await $.store.get(VERDICTS))
  const isTrue = found === said && verdicts[version] !== false

  if (verdicts[version] !== isTrue) {
    await $.store.set(VERDICTS, { ...verdicts, [version]: isTrue })
  }

  await setBelieved($, isTrue)
}

// Every tool call reports the effort, so only a change is written, and drawn.
const setEffort = async ($: EngineInterface, level: string | null) => {
  if (level !== seenEffort) {
    seenEffort = level
    await update($, effort, () => level)
  }
}

const syncModel = async ($: EngineInterface) => {
  const id = await $.session.model()

  await update($, model, () => id)
}

const syncVim = async ($: EngineInterface) => {
  const rows = await $.config.list()
  const isOn = rows.some(row => row.key === 'editor' && row.value === 'vim')

  await update($, isVim, () => isOn)
}

const syncUsage = async ($: EngineInterface) => {
  const { context, cost } = await $.session.usage()

  await update($, usage, () => measured(context, cost))
}

// Until a turn reports the effort it ran at, the configured one is the best there is to show.
const seedEffort = async ($: EngineInterface) => {
  if ((await read($, effort)) !== null) {
    return
  }

  const configured =
    effortLevel(await $.env.get('CLAUDE_CODE_EFFORT_LEVEL')) ?? effortLevel((await $.settings.read()).effortLevel)

  if (configured !== null) {
    await setEffort($, configured)
  }
}

// A classic hook event names the transcript; before the first one, its usual place is tried.
const findTranscript = async ($: EngineInterface) => {
  const held = await read($, transcript)

  if (held !== null) {
    return held
  }

  const home = await $.env.get('HOME')
  const configDirectory = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? (home === undefined ? undefined : `${home}/.claude`)

  if (configDirectory === undefined) {
    return null
  }

  const guess = transcriptPath(configDirectory, await $.session.root(), await $.session.id())

  if (!(await $.fs.exists(guess))) {
    return null
  }

  await update($, transcript, () => guess)

  return guess
}

// Claude Code keeps the session's title in its transcript and offers no call for it.
const syncTitle = async ($: EngineInterface) => {
  const path = await findTranscript($)

  if (path === null) {
    return
  }

  const { stdout } = await $.process.run(['grep', '-a', '-E', TITLE_ENTRY, path])
  const found = pickTitle(stdout)

  if (found !== null) {
    await update($, title, () => found)
  }
}

const readAnnounced = async ($: EngineInterface) => {
  const path = await findTranscript($)

  if (path === null) {
    return []
  }

  const { stdout } = await $.process.run(['grep', '-a', '-o', '-E', EFFORT_ENTRY, path])

  return announcedEfforts(stdout)
}

// The picker `/effort` opens answers nothing a hook can read: what it set is the row it leaves in
// the transcript a moment later, and a cancelled one leaves none.
const adoptAnnounced = async ($: EngineInterface, known: number) => {
  for (const wait of [100, 400, 1500]) {
    await $.clock.sleep(wait)
    const levels = await readAnnounced($)
    const last = levels.at(-1)

    if (levels.length > known && last !== undefined) {
      await setEffort($, last)

      return
    }
  }
}

const adoptSession = async ($: EngineInterface, path: string, given: string | undefined) => {
  if ((await read($, transcript)) !== path) {
    await update($, transcript, () => path)
    await update($, title, () => null)
  }

  if (given !== undefined && given !== '') {
    await update($, title, () => given)
  }

  await syncTitle($)
}

// What the command line answers stands in the footer's last row, as vim's messages do, for a while.
const say = async ($: EngineInterface, text: string, isWarning = false) => {
  answered?.cancel()
  await update($, echo, () => ({ text, isWarning }))
  answered = $.clock.after(ECHO_MS, () => {
    void quietly($, 'command', update($, echo, () => null))
  })
}

// The command line closes when its command is run and when the keys go back to the prompt. A field
// that is not drawn can hold no keyboard, so leaving it out of one drawing is what hands the keys
// back, and the one drawn after it is another field, with nothing typed in it.
const closeLine = async ($: EngineInterface) => {
  line?.watch.cancel()
  line = undefined
  completion = undefined
  natives = undefined
  await update($, menu, () => null)
  await update($, command, () => null)
  await update($, field, ({ drawn }) => ({ drawn: drawn + 1, isDown: true, value: '' }))
  $.clock.after(FIELD_DOWN_MS, () => {
    void quietly($, 'command', update($, field, held => ({ ...held, isDown: false })))
  })
}

// Escape hands the keys back to the prompt and raises nothing. The engine refuses to move the ring
// of a site that does not hold the keyboard, so asking it to keep the ring where it is tells; two
// refusals in a row, since a ring on the move is refused too. A call that fails is as good as one.
const watchLine = async ($: EngineInterface, requestId: string, key: string) => {
  const held = await $.ui.focus({ requestId, key }).catch((error: unknown) => ({ deny: String(error) }))

  if (line === undefined) {
    return
  }

  line.denied = held.deny === undefined ? 0 : line.denied + 1

  if (line.denied >= 2) {
    await closeLine($)
  }
}

const openLine = async ($: EngineInterface, requestId: string, key: string) => {
  if (line !== undefined) {
    return
  }

  answered?.cancel()
  line = {
    denied: 0,
    typed: '',
    given: '',
    watch: $.clock.every(WATCH_MS, () => {
      void quietly($, 'command', watchLine($, requestId, key))
    }),
  }
  await update($, echo, () => null)
  await update($, command, () => '')
}

// A key typed in the field. One typed in a field nobody saw taking the keyboard (the mod was loaded
// again under it) opens the line as the first does.
const typeLine = async ($: EngineInterface, requestId: string, key: string, typed: string) => {
  await openLine($, requestId, key)

  if (line !== undefined) {
    line.typed = typed
  }

  await update($, command, () => typed)

  // While the completions are up, what is typed narrows them, and past the name ends them.
  if (completion !== undefined) {
    const items = completionsOf(typed, await nativeItems($))
    completion = items.length === 0 ? undefined : { items, picked: 0 }
    await showMenu($)
  }
}

// Claude Code's commands as the menu names them, fetched once for each time the line opens.
const nativeItems = async ($: EngineInterface) => {
  natives ??= (await $.command.list()).map(({ name, description }) => ({ name, description }))

  return natives
}

// The menu keeps a window of the completions round the picked one: the footer draws what fits.
const showMenu = async ($: EngineInterface) => {
  const held = completion

  if (held === undefined) {
    await update($, menu, () => null)

    return
  }

  const first = Math.max(0, Math.min(held.picked - MENU_KEPT / 2, held.items.length - MENU_KEPT))
  await update($, menu, () => ({ items: held.items.slice(first, first + MENU_KEPT), picked: held.picked - first, total: held.items.length }))
}

// Tab or Down, and Shift+Tab or Up, in the field. The first opens the completions of the name typed
// so far, picking the first or the last, and each after it moves the pick, round the ends.
const stepCompletion = async ($: EngineInterface, step: number) => {
  if (line === undefined) {
    return
  }

  if (completion === undefined) {
    const items = completionsOf(line.typed, await nativeItems($))
    completion = items.length === 0 ? undefined : { items, picked: step > 0 ? 0 : items.length - 1 }
  } else {
    const count = completion.items.length
    completion = { ...completion, picked: (completion.picked + step + count) % count }
  }

  await showMenu($)
}

// Enter while the completions are up takes the picked one into the line, as opencode.vim does, and
// the next Enter runs it. The field is given the text once the engine has emptied it after Enter;
// one it was last given already gets a space after it, so as to be another, which the engine takes.
const takeCompletion = async ($: EngineInterface, picked: MenuItem) => {
  if (line === undefined) {
    return
  }

  const text = picked.name === line.given ? `${picked.name} ` : picked.name
  line.typed = text
  line.given = text
  completion = undefined
  await showMenu($)
  await update($, command, () => text)
  $.clock.after(FIELD_VALUE_MS, () => {
    void quietly($, 'command', update($, field, held => ({ ...held, value: text })))
  })
}

const draftPlace = async ($: EngineInterface) => draftKey(isStarted, await $.session.id(), await $.session.root())

const readDraft = async ($: EngineInterface) => keptDraft(await $.store.get(await draftPlace($)))

// The box takes a draft whole, and where the draft is painted, with its colors: a fill is no
// keystroke, so nothing else would paint it before the next one.
const fillDraft = ($: EngineInterface, text: string) =>
  $.prompt.fill({ text, mode: 'replace', ...(isPainted && text !== '' && { decorations: paint(text, false) }) })

const saveDraft = async ($: EngineInterface) => {
  const { text } = await $.prompt.read()
  const place = await draftPlace($)

  if (text === '') {
    await $.store.delete(place)
    await say($, SAID.cleared)

    return
  }

  await $.store.set(place, text)
  await say($, SAID.saved)
}

const reloadDraft = async ($: EngineInterface, isForced: boolean) => {
  const [{ text }, saved] = await Promise.all([$.prompt.read(), readDraft($)])

  if (text !== saved && !isForced) {
    await say($, SAID.unsavedReload, true)

    return
  }

  await fillDraft($, saved)
}

// Quitting is the engine's own `/exit`, which waits for a turn to end: a forced quit ends it first.
const quit = async ($: EngineInterface, isForced: boolean, isSaving: boolean) => {
  const [{ text }, saved] = await Promise.all([$.prompt.read(), readDraft($)])

  if (!isForced && !isSaving && text !== saved) {
    await say($, SAID.unsavedQuit, true)

    return
  }

  if (!isForced && isWorking) {
    await say($, SAID.running(isSaving ? 'wq' : 'q'), true)

    return
  }

  if (isSaving) {
    await saveDraft($)
  }

  if (isWorking && turn !== undefined) {
    await $.turn.abort({ turnId: turn })
  }

  await $.command.run({ command: EXIT })
}

// Any other name is a slash command's, or one of its aliases, which only running it tells: the
// engine refuses a name it does not know, and the list it gives has no aliases in it.
const runCommand = async ($: EngineInterface, name: string, args: string) => {
  try {
    await $.command.run({ command: name, args })
  } catch (error) {
    if ((await $.command.list()).some(entry => entry.name === name)) {
      throw error
    }

    await say($, SAID.unknown(name), true)
  }
}

const runLine = async ($: EngineInterface, typed: string) => {
  const action = commandOf(typed)

  if (action.kind === 'refused') {
    await say($, action.reason, true)
  } else if (action.kind === 'save') {
    await saveDraft($)
  } else if (action.kind === 'reload') {
    await reloadDraft($, action.isForced)
  } else if (action.kind === 'quit') {
    await quit($, action.isForced, action.isSaving)
  } else if (action.kind === 'help') {
    // A transcript notice is one line: a line break in it is drawn as a mark.
    HELP.forEach(row => {
      $.ui.log(row)
    })
  } else if (action.kind === 'other') {
    await runCommand($, action.command, action.args)
  }
}

// Enter in the field: the line closes first, so that the keys are the prompt's again whatever the
// command does, and a command that fails says so where its answer would have stood.
const submitLine = async ($: EngineInterface, typed: string) => {
  const picked = completion?.items[completion.picked]

  if (picked !== undefined) {
    await takeCompletion($, picked)

    return
  }

  await closeLine($)

  try {
    await runLine($, typed)
  } catch (error) {
    await say($, `command failed: ${error instanceof Error ? error.message : String(error)}`, true)
  }
}

// A session that starts, is opened again or is cleared. The event says which: the session is not
// bound to the mod yet, so its turns cannot be counted, and only one that was opened again has had
// a prompt sent in it. That says where its draft is kept, and a draft kept there is put back in an
// empty box once there is a box. A compaction starts nothing the person sees, and loads none.
const adoptDraft = async ($: EngineInterface, sessionId: string, source: string) => {
  isStarted = source !== 'startup' && source !== 'clear'
  const saved = source === 'compact' ? '' : keptDraft(await $.store.get(draftKey(isStarted, sessionId, await $.session.root())))

  if (saved === '') {
    return
  }

  for (const wait of BOX_WAITS) {
    await $.clock.sleep(wait)

    if ((await $.prompt.read()).text !== '') {
      return
    }

    const { isFilled, refusal } = await fillDraft($, saved)

    if (isFilled || refusal !== 'no_composer') {
      return
    }
  }
}

// A prompt that is sent takes its draft with it, as in opencode.vim: the one kept for the session,
// or for the folder when this is the session's first.
const forgetDraft = async ($: EngineInterface) => {
  await $.store.delete(await draftPlace($))
  isStarted = true
}

// A command line the mod left open before it was loaded again: nothing here knows of it, and what
// it showed stays in the session's state, so it is closed.
const closeStaleLine = async ($: EngineInterface) => {
  if ((await read($, command)) !== null || (await read($, menu)) !== null) {
    await closeLine($)
  }
}

const boot = async ($: EngineInterface) => {
  await Promise.all([
    quietly($, 'pins', loadPins($)),
    quietly($, 'label', syncBelieved($)),
    quietly($, 'model', syncModel($)),
    quietly($, 'editor', syncVim($)),
    quietly($, 'status line', syncStatusLine($)),
    quietly($, 'effort', seedEffort($)),
    quietly($, 'usage', syncUsage($)),
    quietly($, 'cursor', syncBox($)),
    quietly($, 'title', syncTitle($)),
    // The mod loaded again under a running session: a session that only starts is not counted yet.
    quietly($, 'draft', $.session.turns().then(turns => {
      isStarted = isStarted || turns > 0
    })),
    quietly($, 'command', closeStaleLine($)),
  ])
}

export const register: Register = (on, options) => {
  const minRows = minRowsOf(options.minLines)
  isPainted = options.syntax !== false

  // Only the fullscreen terminal lets a site draw outside itself, and only there is the box laid out
  // as the overlay expects.
  const overlays = (surface: RenderSurface, viewport: RenderViewport | undefined) =>
    options.overlay !== false &&
    surface === 'terminal' &&
    viewport?.isFullscreen === true &&
    viewport.columns >= MIN_OVERLAID_COLUMNS

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void boot($)

    return started
  })

  on('classic.SessionStart', ($, e, next) => {
    void quietly($, 'session', adoptSession($, e.transcript_path, e.session_title))
    void quietly($, 'model', syncModel($))
    void quietly($, 'usage', syncUsage($))
    void quietly($, 'cursor', syncBox($))

    if (options.commandLine !== false) {
      void quietly($, 'draft', adoptDraft($, e.session_id, e.source))
    }

    return next(e)
  })

  on('classic.UserPromptSubmit', ($, e, next) => {
    void quietly($, 'session', adoptSession($, e.transcript_path, e.session_title))
    void quietly($, 'model', syncModel($))
    void quietly($, 'suggestion', setSuggestion($, null))

    if (e.agent_id === undefined && e.permission_mode !== undefined) {
      void quietly($, 'label', judgeLabel($, e.permission_mode))
    }

    if (e.agent_id === undefined) {
      void quietly($, 'draft', forgetDraft($))
    }

    return next(e)
  })

  // The running turn's id is what a forced quit ends it by.
  on('turn.start', ($, e, next) => {
    turn = e.turnId

    return next(e)
  })

  on('classic.PostToolUse', ($, e, next) => {
    const level = effortLevel(e.effort?.level)

    if (e.agent_id === undefined && level !== null) {
      void quietly($, 'effort', setEffort($, level))
    }

    return next(e)
  })

  // A model that takes no effort reports none here, which clears the one shown.
  on('classic.Stop', ($, e, next) => {
    void quietly($, 'effort', setEffort($, effortLevel(e.effort?.level)))
    void quietly($, 'session', adoptSession($, e.transcript_path, undefined))

    return next(e)
  })

  on('classic.PostModelSwitch', ($, e, next) => {
    void quietly($, 'model', update($, model, () => e.to_model))

    return next(e)
  })

  on('session.measure', ($, e, next) => {
    void quietly($, 'usage', update($, usage, () => measured(e.context, e.cost)))

    return next(e)
  })

  on('config.set', { key: 'editor' }, async ($, e, next) => {
    const set = await next(e)
    void quietly($, 'editor', syncVim($))

    return set
  })

  // A settings file changed under the session. The hooks are asked before the engine takes the
  // change up, so what it may have changed is read a moment after they have answered.
  on('classic.ConfigChange', async ($, e, next) => {
    const answered = await next(e)
    $.clock.after(SETTLE_MS, () => {
      void quietly($, 'editor', syncVim($))
      void quietly($, 'status line', syncStatusLine($))
    })

    return answered
  })

  on('command.run', { command: 'rename' }, async ($, e, next) => {
    const ran = await next(e)
    const given = e.args.trim()
    void quietly($, 'title', given === '' ? syncTitle($) : update($, title, () => given))

    return ran
  })

  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const asked = effortLevel(e.args)
    const known = asked === null ? (await readAnnounced($).catch(() => [])).length : 0
    const ran = await next(e)
    void quietly($, 'effort', asked === null ? adoptAnnounced($, known) : setEffort($, asked))

    return ran
  })

  // The text the engine offers in an empty box is drawn over with the rest of the row, so it is
  // drawn again there.
  on('prompt.suggest', async ($, e, next) => {
    const shown = await next(e)
    void quietly($, 'suggestion', setSuggestion($, shown.isShown ? e.text : null))

    return shown
  })

  // Every keystroke passes here with the draft it leaves, and the engine paints the runs answered in
  // the frame it draws the text: the fill's color where the draft's rows are filled, and the draft's
  // markdown in its colors. It keeps them until the draft changes with no keystroke (a new line from
  // a key bound to one, an edit in the vim editor's normal mode), and nothing here can paint again
  // before the next one: the one call that paints a whole draft also moves the cursor to its end.
  on('prompt.edit', async ($, e, next) => {
    const edited = await next(e)
    edits += 1
    decorated = isFilling ? edited.text : undefined
    void quietly($, 'cursor', setPrompt($, { text: edited.text, cursor: edited.cursor }))
    const runs = [
      ...(isFilling ? [{ start: 0, end: WHOLE_DRAFT, backgroundColor: theme.bar }] : []),
      ...(options.syntax === false ? [] : paint(edited.text, isShell)),
    ]

    return runs.length === 0 ? edited : { ...edited, decorations: [...(edited.decorations ?? []), ...runs] }
  })

  on('ui.status', ($, e, next) => {
    notePin($, next.origin.plugin, e.text !== undefined && e.text !== '')

    return next(e)
  })

  // The band above the prompt tells how tall the prompt stands, and is where the command line's
  // field is: unseen, under whatever else is drawn there, until the person's focus chord
  // (`abovePrompt:focus`) moves the keys into it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.viewport !== undefined) {
      noteBand($, e.props.maxRows, e.viewport.rows)
      noteGutter($, e.props.view.agentId !== undefined || e.props.bodyColumns !== e.viewport.columns)
    }

    const beneath = await next(e)

    if (options.commandLine === false || e.surface !== 'terminal') {
      return beneath
    }

    const { drawn, isDown, value } = await read($, field)

    if (isDown) {
      return beneath
    }

    const table = $.ui.resolve(e)
    const { Box } = table
    const { requestId } = e
    const key = fieldKey(drawn)

    return (
      <Box flexDirection="column">
        {beneath}
        {CommandField(table, {
          key,
          value,
          guards: { previous: PREVIOUS, next: NEXT },
          onInput: typed => {
            void quietly($, 'command', typeLine($, requestId, key, typed))
          },
          onSubmit: typed => {
            void quietly($, 'command', submitLine($, typed))
          },
        })}
      </Box>
    )
  })

  // The keys moving into the field is the command line opening. Tab, Shift+Tab and the arrows in the
  // field move the ring onto an element beside it: the completions step instead, and the ring is
  // kept on the field by not passing the move on.
  on('ui.focus', async ($, e, next) => {
    if (e.component === 'AbovePrompt' && e.origin.kind === 'person' && (e.element === NEXT || e.element === PREVIOUS)) {
      void quietly($, 'command', stepCompletion($, e.element === NEXT ? 1 : -1))

      return {}
    }

    const moved = await next(e)

    if (e.component === 'AbovePrompt' && e.element !== undefined && isField(e.element) && e.origin.kind === 'person' && moved.deny === undefined) {
      void quietly($, 'command', openLine($, e.requestId, e.element))
    }

    return moved
  })

  on('ui.message', ($, e, next) => {
    void quietly($, 'reading', noteReading($, e.data))

    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    // The engine's own line while it waits for a second ctrl+c or ctrl+d.
    if (e.props.hint.startsWith('Press ')) {
      return next(e)
    }

    const [vim, id, level, at, spent, typed, answer, offered] = await Promise.all([
      read($, isVim),
      read($, model),
      read($, effort),
      read($, input),
      read($, usage),
      read($, command),
      read($, echo),
      read($, menu),
    ])
    const width = e.viewport?.columns ?? WIDE
    const label = editorMode(e.props.hint, vim)
    // The badge names the command line while it is open, as a vim status line does.
    const shown = typed === null ? label : 'COMMAND'
    isShell = label.startsWith('SHELL')
    isWorking = e.props.isWorking

    if (e.props.isDraft) {
      watchBox($, vim && !isInserting(label) ? FAST_POLL_MS : POLL_MS)
    }

    if (e.surface !== 'terminal' || !overlays(e.surface, e.viewport)) {
      return StatusRow($.ui.resolve(e), fitLeft({ columns: width, mode: shown, model: id, effort: level, title: null }), fitLine(width, shown, typed, answer), offered)
    }

    const [stands, measured, believed, plain] = await Promise.all([read($, box), read($, reading), read($, isLabelBelieved), read($, isBoxPlain)])
    const block = fitBlock({
      columns: width,
      // The band is drawn again when the screen's height changes, which this row is not.
      height: band?.height ?? e.viewport?.rows ?? TALL,
      hint: e.props.hint,
      draft: at,
      mode: shown,
      model: id,
      effort: level,
      box: stands,
      suggestion: null,
      reading: measured,
      title: null,
      usage: spent,
      isFilled: false,
      isNumbered: options.lineNumbers !== false && plain,
      minRows: plain ? minRows : 1,
      isRelabelled: true,
      isBelieved: believed,
      command: typed,
      echo: answer,
      menu: offered,
    })

    marked = block.read

    return StatusBlock($.ui.resolve(e), block)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const width = e.viewport?.columns ?? WIDE
    const [at, spent] = await Promise.all([read($, input), read($, usage)])
    const { cursor, usage: used } = fitRight(width, e.props.modes, at, spent)

    // The block has the cursor and the usage; the engine's own labels keep this site.
    return StatusNote($.ui.resolve(e), overlays(e.surface, e.viewport) ? e.props.modes.join(' & ') : `${cursor} · ${used}`)
  })
}
