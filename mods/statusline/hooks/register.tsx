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

import type { Box, Git, Usage } from '../types'
import {
  EDGE,
  EFFORT_ENTRY,
  GUTTER,
  MIN_OVERLAID_COLUMNS,
  NO_USAGE,
  ORIGIN,
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
  expandedRowsOf,
  readingOf,
  sharesMark,
  standsIn,
  transcriptPath,
  verdictsOf,
} from './format'
import { BRANCH, COMMIT, DIFFSTAT, GIT_ENV, branchOf, diffstatOf } from './git'
import { StatusBlock, StatusNote, StatusRow } from './view'
import { layOut } from './wrap'

const POLL_MS = 100
// The vim editor's normal mode changes the draft with no event at all, so there it is read each frame or two.
const FAST_POLL_MS = 33
const SETTLE_MS = 150
const WIDE = 120
// Claude Code 2.1.289 tells the band a few columns fewer than the screen with nothing docked; a pane
// docked beside the transcript takes many more.
const DOCKED = 10
const TALL = 40
// Where the verdicts on the permission label are kept between sessions.
const VERDICTS = 'label-verdicts'
// The slash command that stands the box at its expanded height, for a key to be bound to
// (`command:expand`); `:expand` in the vim mod's command line runs it too.
const EXPAND = 'expand'
// How often the working copy's git state is read besides after each tool call, as opencode.vim reads
// it, and how long one git command may take.
const GIT_MS = 5000
const GIT_TIMEOUT_MS = 1500

const input = atom({ plugin: 'statusline', key: 'input' } as const, ORIGIN)
const box = atom({ plugin: 'statusline', key: 'box' } as const, UNPLACED)
const isBoxPlain = atom({ plugin: 'statusline', key: 'isBoxPlain' } as const, true)
const pins = atom({ plugin: 'statusline', key: 'pins' } as const, [])
const mode = atom({ plugin: 'statusline', key: 'mode' } as const, 'INSERT')
const reading = atom({ plugin: 'statusline', key: 'reading' } as const, null)
const isLabelBelieved = atom({ plugin: 'statusline', key: 'isLabelBelieved' } as const, false)
const model = atom({ plugin: 'statusline', key: 'model' } as const, '')
const effort = atom({ plugin: 'statusline', key: 'effort' } as const, null)
const isVim = atom({ plugin: 'statusline', key: 'isVim' } as const, false)
const transcript = atom({ plugin: 'statusline', key: 'transcript' } as const, null)
const usage = atom({ plugin: 'statusline', key: 'usage' } as const, NO_USAGE)
const git = atom({ plugin: 'statusline', key: 'git' } as const, null)
const isExpanded = atom({ plugin: 'statusline', key: 'isExpanded' } as const, false)
// The vim mod's command line, where it is installed: what is typed, what it said last, and its
// completions. Read here and drawn in the bar; only that mod writes them.
const command = atom({ plugin: 'vim', key: 'command' } as const, null)
const echo = atom({ plugin: 'vim', key: 'echo' } as const, null)
const menu = atom({ plugin: 'vim', key: 'menu' } as const, null)

let poll: { timer: Timer; ms: number } | undefined
let settle: Timer | undefined
let columns = WIDE
let prompt: PromptBox = { text: '', cursor: 0 }
let edits = 0
// The editor's mode as last published, for the syntax mod to read.
let seenMode: string | undefined
// Whether the footer shows the git state, the state last drawn, and a read of it under way, with
// whether another was asked for meanwhile.
let hasGit = true
let seenGit: string | undefined
let gitRead: { isAgain: boolean } | undefined
let band: { maxRows: number; height: number } | undefined
// The plugins with a status line pinned under the prompt: a row each, between its rule and the footer.
let pinned = new Set<string>()
// The permission mode the engine's mark was last read as, believed or not.
let marked: string | null = null
let engine: string | undefined
let seenPrompt: string | undefined
let seenBox: string | undefined
// What keeps the draft's lines from being numbered, each learned on its own.
let isGutterTaken = false
let hasStatusLine = false
let seenPlain: boolean | undefined
let seenEffort: string | null | undefined
let seenReading: string | undefined
let seenBelieved: boolean | undefined
// The session the mod last started for, and the timer that reads the git state.
let session: string | undefined
let gitTimer: Timer | undefined

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

  if (!isSame && !isSettled) {
    verifySoon($)

    return
  }

  const next: Box = { rows, under, isAligned: isSame }
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

  const seen = `${next.cursor}:${next.text}`

  if (seen === seenPrompt) {
    return
  }

  seenPrompt = seen
  await update($, input, () => draftOf(next.text, next.cursor))

  verifySoon($)
}

const syncBox = async ($: EngineInterface) => {
  const before = edits
  const now = await $.prompt.read()

  // A keystroke landed while the box was being read: what its hook saw is the newer.
  if (before !== edits) {
    return
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

// A draw cannot write, so the mode read off the hint is written on the next tick: the syntax mod
// reads it to color a shell command as one.
const publishMode = ($: EngineInterface, label: string) => {
  if (label === seenMode) {
    return
  }

  seenMode = label
  $.clock.after(0, () => {
    void quietly($, 'mode', update($, mode, () => label))
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

// The session's transcript, which classic hook events name: where `/effort`'s picker leaves its level.
const adoptSession = async ($: EngineInterface, path: string) => {
  if ((await read($, transcript)) !== path) {
    await update($, transcript, () => path)
  }
}

// One git command; null where git is missing, refuses to run or takes too long.
const runGit = async ($: EngineInterface, argv: readonly string[]) => {
  try {
    return await $.process.run(argv, { env: GIT_ENV, timeoutMs: GIT_TIMEOUT_MS })
  } catch {
    return null
  }
}

// The branch and the counts, read in the session's folder as opencode.vim reads them; null outside
// a repository. A repository with no commit yet has its branch and no counts.
const readGit = async ($: EngineInterface): Promise<Git | null> => {
  const onBranch = await runGit($, BRANCH)
  const onCommit = onBranch !== null && onBranch.exitCode !== 0 ? await runGit($, COMMIT) : null
  const branch = branchOf(onBranch?.exitCode === 0 ? onBranch.stdout : null, onCommit?.exitCode === 0 ? onCommit.stdout : null)

  if (branch === null) {
    return null
  }

  const diff = await runGit($, DIFFSTAT)

  return { branch, ...(diff?.exitCode === 0 ? diffstatOf(diff.stdout) : { additions: 0, deletions: 0 }) }
}

// Asks while a read is under way come to one more read once it is done.
const syncGit = async ($: EngineInterface) => {
  if (gitRead !== undefined) {
    gitRead.isAgain = true

    return
  }

  const reading = { isAgain: true }
  gitRead = reading

  try {
    while (reading.isAgain) {
      reading.isAgain = false
      const next = await readGit($)
      const seen = JSON.stringify(next)

      if (seen !== seenGit) {
        seenGit = seen
        await update($, git, () => next)
      }
    }
  } finally {
    gitRead = undefined
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
    quietly($, 'expand', $.command.register({ name: EXPAND, description: 'Make the prompt taller, or back to its height', immediate: true })),
    quietly($, 'git', hasGit ? syncGit($) : update($, git, () => null)),
  ])

  // Files change between tool calls too, from an editor or a terminal of the person's own.
  if (hasGit) {
    gitTimer ??= $.clock.every(GIT_MS, () => {
      void quietly($, 'git', syncGit($))
    })
  }
}

// Another session opened in the same process (`/resume`, `/clear`): the mod stays loaded, but the
// values it draws from are the new session's, all unset. What it last wrote is forgotten, so that
// everything is written again rather than taken for already there.
const switchSession = async ($: EngineInterface, id: string) => {
  const isSwitch = session !== undefined && session !== id
  session = id

  if (!isSwitch) {
    return
  }

  seenGit = undefined
  seenPrompt = undefined
  seenBox = undefined
  seenPlain = undefined
  seenEffort = undefined
  seenReading = undefined
  seenBelieved = undefined
  seenMode = undefined
  await boot($)
}

export const register: Register = (on, options) => {
  const minRows = minRowsOf(options.minLines)
  const expandedRows = expandedRowsOf(options.expandedLines, minRows)
  hasGit = options.git !== false

  // Only the fullscreen terminal lets a site draw outside itself, and only there is the box laid out
  // as the block expects.
  const overlays = (surface: RenderSurface, viewport: RenderViewport | undefined) =>
    surface === 'terminal' &&
    viewport?.isFullscreen === true &&
    viewport.columns >= MIN_OVERLAID_COLUMNS

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void boot($)

    return started
  })

  on('classic.SessionStart', ($, e, next) => {
    void quietly($, 'session', switchSession($, e.session_id))
    void quietly($, 'session', adoptSession($, e.transcript_path))
    void quietly($, 'model', syncModel($))
    void quietly($, 'usage', syncUsage($))
    void quietly($, 'cursor', syncBox($))

    return next(e)
  })

  on('classic.UserPromptSubmit', ($, e, next) => {
    void quietly($, 'session', adoptSession($, e.transcript_path))
    void quietly($, 'model', syncModel($))

    if (e.agent_id === undefined && e.permission_mode !== undefined) {
      void quietly($, 'label', judgeLabel($, e.permission_mode))
    }

    // A prompt that was composed tall is sent, and the box goes back to its height.
    if (e.agent_id === undefined) {
      void quietly($, 'expand', update($, isExpanded, () => false))
    }

    return next(e)
  })

  on('classic.PostToolUse', ($, e, next) => {
    const level = effortLevel(e.effort?.level)

    if (e.agent_id === undefined && level !== null) {
      void quietly($, 'effort', setEffort($, level))
    }

    // A tool call may have changed files, an agent's as well as the session's own.
    if (hasGit) {
      void quietly($, 'git', syncGit($))
    }

    return next(e)
  })

  // A model that takes no effort reports none here, which clears the one shown.
  on('classic.Stop', ($, e, next) => {
    void quietly($, 'effort', setEffort($, effortLevel(e.effort?.level)))
    void quietly($, 'session', adoptSession($, e.transcript_path))

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

  // `/expand`, which a key can be bound to as `command:expand`.
  on('command.run', { command: EXPAND }, async $ => {
    await update($, isExpanded, held => !held)

    return {}
  })

  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const asked = effortLevel(e.args)
    const known = asked === null ? (await readAnnounced($).catch(() => [])).length : 0
    const ran = await next(e)
    void quietly($, 'effort', asked === null ? adoptAnnounced($, known) : setEffort($, asked))

    return ran
  })

  // Every keystroke passes here with the draft it leaves: where the cursor is.
  on('prompt.edit', async ($, e, next) => {
    const edited = await next(e)
    edits += 1
    void quietly($, 'cursor', setPrompt($, { text: edited.text, cursor: edited.cursor }))

    return edited
  })

  on('ui.status', ($, e, next) => {
    notePin($, next.origin.plugin, e.text !== undefined && e.text !== '')

    return next(e)
  })

  // The band above the prompt tells how tall the prompt stands. Nothing is drawn there.
  on('ui.render', { component: 'AbovePrompt' }, ($, e, next) => {
    if (e.viewport !== undefined) {
      noteBand($, e.props.maxRows, e.viewport.rows)
      noteGutter($, e.props.view.agentId !== undefined || e.props.bodyColumns < e.viewport.columns - DOCKED)
    }

    return next(e)
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

    const [vim, id, level, at, spent, typed, answer, offered, repository, expanded] = await Promise.all([
      read($, isVim),
      read($, model),
      read($, effort),
      read($, input),
      read($, usage),
      read($, command),
      read($, echo),
      read($, menu),
      read($, git),
      read($, isExpanded),
    ])
    const width = e.viewport?.columns ?? WIDE
    const label = editorMode(e.props.hint, vim)
    // The badge names the command line while it is open, as a vim status line does.
    const shown = typed === null ? label : 'COMMAND'
    publishMode($, label)

    if (e.props.isDraft) {
      watchBox($, vim && !isInserting(label) ? FAST_POLL_MS : POLL_MS)
    }

    if (e.surface !== 'terminal' || !overlays(e.surface, e.viewport)) {
      return StatusRow($.ui.resolve(e), fitLeft({ columns: width, mode: shown, model: id, effort: level }), fitLine(width, shown, typed, answer), offered)
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
      reading: measured,
      usage: spent,
      isNumbered: options.lineNumbers !== false && plain,
      minRows: plain ? (expanded ? expandedRows : minRows) : 1,
      isBelieved: believed,
      command: typed,
      echo: answer,
      menu: offered,
      git: repository,
    })

    marked = block.read

    return StatusBlock($.ui.resolve(e), block)
  })

  on('ui.render', { component: 'SessionMode' }, async ($, e) => {
    const width = e.viewport?.columns ?? WIDE
    const [at, spent, repository] = await Promise.all([read($, input), read($, usage), read($, git)])
    const { cursor, usage: used, git: branch } = fitRight(width, e.props.modes, at, spent, repository)
    const note = [cursor, branch, used].filter(text => text !== '').join(' · ')

    // The block has the cursor, the git state and the usage; the engine's own labels keep this site.
    return StatusNote($.ui.resolve(e), overlays(e.surface, e.viewport) ? e.props.modes.join(' & ') : note)
  })
}
