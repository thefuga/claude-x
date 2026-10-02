// The command line's commands, as vim names them and as opencode.vim has them (its `commands.ts` is
// where the names, the `!` and the wording come from): the draft saved, loaded back, the session
// quit, and by any other name a slash command of Claude Code's. What each one does is the hooks'
// business; here a typed line is only told apart.

export type Action =
  | { kind: 'save' }
  | { kind: 'reload'; isForced: boolean }
  | { kind: 'quit'; isForced: boolean; isSaving: boolean }
  | { kind: 'help' }
  // A name that is none of the command line's own: a slash command, if Claude Code has one by it.
  | { kind: 'other'; command: string; args: string }
  | { kind: 'refused'; reason: string }
  | { kind: 'none' }

type Entry = { names: readonly string[]; action: Action }

const OWN: readonly Entry[] = [
  { names: ['w', 'write'], action: { kind: 'save' } },
  { names: ['e', 'edit'], action: { kind: 'reload', isForced: false } },
  { names: ['e!', 'edit!'], action: { kind: 'reload', isForced: true } },
  // One session to a window, so quitting all of them is quitting this one.
  { names: ['q', 'quit', 'qa', 'qall'], action: { kind: 'quit', isForced: false, isSaving: false } },
  { names: ['q!', 'quit!', 'qa!', 'qall!'], action: { kind: 'quit', isForced: true, isSaving: false } },
  { names: ['wq', 'x'], action: { kind: 'quit', isForced: false, isSaving: true } },
  { names: ['wq!', 'x!'], action: { kind: 'quit', isForced: true, isSaving: true } },
  { names: ['h', 'help'], action: { kind: 'help' } },
]

export const SAID = {
  saved: 'draft saved',
  cleared: 'draft cleared',
  unsavedReload: 'no write since last change (add ! to override)',
  unsavedQuit: 'no write since last change (:q! to override)',
  running: (command: string) => `session is running (:${command}! to override)`,
  unknown: (command: string) => `unknown command: :${command}`,
  noArguments: (command: string) => `command does not accept arguments: :${command}`,
}

export const HELP = [
  ':w           save the draft for this session',
  ':e   :e!     load the saved draft; ! drops what was typed since',
  ':q   :q!     quit Claude Code; ! leaves an unsaved draft or a running turn behind',
  ':wq  :x      save the draft and quit',
  ':<command>   run a slash command, as /<command> does',
]

// What a typed line asks for. The colon is the line's own mark and is not typed, but one typed
// anyway is let go.
export const commandOf = (typed: string): Action => {
  const line = typed.trim().replace(/^:\s*/, '')
  const [command = ''] = line.split(/\s+/, 1)
  const args = line.slice(command.length).trim()
  const own = OWN.find(({ names }) => names.includes(command))

  if (command === '') {
    return { kind: 'none' }
  }

  if (own === undefined) {
    return { kind: 'other', command, args }
  }

  return args === '' ? own.action : { kind: 'refused', reason: SAID.noArguments(command) }
}

// The field the line is typed in is drawn under a new key each time the line closes. The engine
// keeps what was typed in a field by its key, and a line left with Escape would open on it.
export const fieldKey = (drawn: number) => `command:${drawn}`

export const isField = (key: string | undefined) => key?.startsWith('command:') === true

// A draft is its session's, as in opencode.vim. A session nothing was sent in cannot be opened
// again, so until then the draft is kept for the folder the session runs in: the plugin's `home`.
export const draftKey = (isStarted: boolean, sessionId: string, root: string) =>
  isStarted ? `draft:session:${sessionId}` : `draft:home:${root}`

// What the store keeps under a draft's key, or the empty draft where it keeps none.
export const keptDraft = (kept: unknown) => (typeof kept === 'string' ? kept : '')
