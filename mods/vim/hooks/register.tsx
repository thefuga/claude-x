import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { FieldState, MenuItem } from '../types'
import { HELP, NEXT, PREVIOUS, SAID, commandOf, completionsOf, draftKey, fieldKey, isField, keptDraft } from './commands'
import { CommandField } from './view'

// The slash command that quits.
const EXIT = 'exit'
// How often an open command line asks whether it still has the keyboard, how long its field is
// left undrawn to hand the keys back, and how long an answer stays in the bar.
const WATCH_MS = 100
const FIELD_DOWN_MS = 80
const ECHO_MS = 3000
// How long after Enter a completion is given to the field: the engine empties it once the submit
// has been answered. And how many completions are kept for the menu around the picked one.
const FIELD_VALUE_MS = 30
const MENU_KEPT = 16
// A prompt box is bound a moment after its session starts: how long a saved draft waits for one.
const BOX_WAITS = [0, 100, 400, 1500]

const FIRST_FIELD: FieldState = { drawn: 0, isDown: false, value: '' }

const command = atom({ plugin: 'vim', key: 'command' } as const, null)
const echo = atom({ plugin: 'vim', key: 'echo' } as const, null)
const field = atom({ plugin: 'vim', key: 'commandField' } as const, FIRST_FIELD)
const menu = atom({ plugin: 'vim', key: 'menu' } as const, null)

// The open command line: the timer that asks after its keyboard, the times in a row it was told no,
// what is typed in it, and the text its field was last given.
let line: { watch: Timer; denied: number; typed: string; given: string } | undefined
// The completions while they are up, and Claude Code's commands as fetched for this line.
let completion: { items: MenuItem[]; picked: number } | undefined
let natives: MenuItem[] | undefined
let answered: Timer | undefined
// The turn of the main loop that is running, by the id it started under.
let turn: string | undefined
// Whether a prompt was sent in this session: until one is, its draft is kept for its folder.
let isStarted = false

// Nothing here is worth failing a hook over.
const quietly = async ($: EngineInterface, label: string, work: Promise<unknown>) => {
  try {
    await work
  } catch (error) {
    $.ui.log(`${label}: ${String(error)}`, { to: 'debug' })
  }
}

// What the command line answers stands in the statusline mod's bar, as vim's messages do, for a while.
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

// The box takes a draft whole. A fill is no keystroke, so the syntax mod colors it at the next one.
const fillDraft = ($: EngineInterface, text: string) => $.prompt.fill({ text, mode: 'replace' })

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

  if (!isForced && turn !== undefined) {
    await say($, SAID.running(isSaving ? 'wq' : 'q'), true)

    return
  }

  if (isSaving) {
    await saveDraft($)
  }

  if (turn !== undefined) {
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
    // The mod loaded again under a running session: a session that only starts is not counted yet.
    quietly($, 'draft', $.session.turns().then(turns => {
      isStarted = isStarted || turns > 0
    })),
    quietly($, 'command', closeStaleLine($)),
  ])
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void boot($)

    return started
  })

  on('classic.SessionStart', ($, e, next) => {
    void quietly($, 'draft', adoptDraft($, e.session_id, e.source))

    return next(e)
  })

  on('classic.UserPromptSubmit', ($, e, next) => {
    if (e.agent_id === undefined) {
      void quietly($, 'draft', forgetDraft($))
    }

    return next(e)
  })

  // The main loop's turn, which a forced quit ends; a subagent's run raises no `turn.start`.
  on('turn.start', ($, e, next) => {
    turn = e.turnId

    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    if (e.agentId === undefined) {
      turn = undefined
    }

    return next(e)
  })

  // The band above the prompt is where the command line's field is: unseen, under whatever else is
  // drawn there, until the person's focus chord (`abovePrompt:focus`) moves the keys into it.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)

    if (e.surface !== 'terminal') {
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
}
