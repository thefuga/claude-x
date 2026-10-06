import { atom, read, update } from 'claude-code'
import type { EngineInterface, ProcessRunResult, Register, Timer } from 'claude-code'

import type { FieldState, List, Note, Reference } from '../types'
import { referencesOf, typedAt, typedKey, withIssue } from './draft'
import type { Typed } from './draft'
import { GH_ENV, ORIGIN, SAID, TOP_LEVEL, contextOf, failureOf, issuesOf, listArgv, slugOf, unrunOf, viewArgv, viewedOf } from './github'
import type { Issue } from './github'
import { matchesOf } from './matches'
import { IssueList, NEXT, PREVIOUS, fieldKey, isField } from './view'

// How often the draft is read: a sent prompt, a history recall or a click moves it with no event.
const POLL_MS = 250
// How often the list's field asks whether it still has the keyboard, and how long it is left
// undrawn to hand the keys back.
const WATCH_MS = 100
const FIELD_DOWN_MS = 80
// How long a listing serves before the next reference lists again; how long git and gh may take,
// fetching an issue as its prompt is sent included: the prompt waits for it.
const LISTED_MS = 5 * 60_000
const GIT_TIMEOUT_MS = 3000
const LIST_TIMEOUT_MS = 15_000
const VIEW_TIMEOUT_MS = 5000
// How long before an issue the draft names that could not be loaded is asked for again.
const RETRY_MS = 60_000
// Whose prompts the issues they name are fetched for: the person's, at the terminal or remotely.
const PERSON = new Set(['composer', 'bridge'])

const FIRST_FIELD: FieldState = { drawn: 0, isDown: false, value: '' }
const LISTING: Note = { text: 'listing the open issues…', isWarning: false }
const NONE_OPEN: Note = { text: 'no open issues', isWarning: false }

const list = atom({ plugin: 'issues', key: 'list' } as const, null)
const field = atom({ plugin: 'issues', key: 'field' } as const, FIRST_FIELD)
const references = atom({ plugin: 'issues', key: 'references' } as const, [])

type Repository = { slug: string; root: string }

// The session's folder as a GitHub repository, or why it is none; a reason that may not hold next
// time (git missing, or slow) is asked again.
type Found = { repository: Repository } | { note: Note; isFinal: boolean }

let found: { root: string; answer: Promise<Found> } | undefined
// The open issues as last listed, for which repository and when; a listing under way; and why the
// last one failed.
let listed: { slug: string; issues: Issue[]; at: number } | undefined
let listing: Promise<void> | undefined
let failure: Note | undefined
// The reference typed at the cursor, what the list is filtered by (its words, or what is typed in
// the list's field), the issues that answer and the one picked.
let typed: Typed | null = null
let filter = ''
let matched: Issue[] = []
let picked = 0
// A reference Escape closed the list over: it stays closed until the reference changes.
let dismissed: string | null = null
// The field while it holds the keys: the timer that asks after them, and the times in a row it was
// told no.
let held: { watch: Timer; denied: number } | undefined
let poll: Timer | undefined
let seen: string | undefined
// The issues the draft names, each as loaded and when (null where gh had none), for which
// repository, and those being loaded; the numbers the draft names now, and what was last published
// of them.
let loaded = new Map<number, { issue: Issue | null; at: number }>()
let loadedSlug: string | undefined
const loading = new Set<number>()
let named: number[] = []
let published: string | undefined

// Nothing here is worth failing a hook over.
const quietly = async ($: EngineInterface, label: string, work: Promise<unknown>) => {
  try {
    await work
  } catch (error) {
    $.ui.log(`${label}: ${String(error)}`, { to: 'debug' })
  }
}

const warning = (text: string): Note => ({ text, isWarning: true })

// One command; why it could not run, where it could not, in place of what it printed.
const ran = async ($: EngineInterface, argv: readonly string[], cwd: string, timeoutMs: number): Promise<ProcessRunResult | { error: unknown }> => {
  try {
    return await $.process.run(argv, { cwd, env: GH_ENV, timeoutMs })
  } catch (error) {
    return { error }
  }
}

const firstLine = (stdout: string) => stdout.trim().split(/\r?\n/)[0] ?? ''

// The repository is told by its git origin, as opencode.vim tells it: there is no other to name.
const detect = async ($: EngineInterface, root: string): Promise<Found> => {
  const top = await ran($, TOP_LEVEL, root, GIT_TIMEOUT_MS)

  if ('error' in top) {
    return { note: warning(SAID.noRepository), isFinal: false }
  }

  if (top.exitCode !== 0 || firstLine(top.stdout) === '') {
    return { note: warning(SAID.noRepository), isFinal: true }
  }

  const topLevel = firstLine(top.stdout)
  const origin = await ran($, ORIGIN, topLevel, GIT_TIMEOUT_MS)

  if ('error' in origin) {
    return { note: warning(SAID.noOrigin), isFinal: false }
  }

  const slug = origin.exitCode === 0 ? slugOf(firstLine(origin.stdout)) : null

  if (slug === null) {
    return { note: warning(origin.exitCode === 0 && firstLine(origin.stdout) !== '' ? SAID.notGitHub : SAID.noOrigin), isFinal: true }
  }

  return { repository: { slug, root: topLevel } }
}

// The repository of the session's folder, found once for each folder the session is in.
const repositoryOf = async ($: EngineInterface) => {
  const root = await $.session.root()
  const asked = found?.root === root ? found : { root, answer: detect($, root) }
  found = asked
  const answer = await asked.answer

  if ('isFinal' in answer && !answer.isFinal && found === asked) {
    found = undefined
  }

  return answer
}

const listIssues = async ($: EngineInterface) => {
  const answer = await repositoryOf($)

  if (!('repository' in answer)) {
    listed = undefined
    failure = answer.note

    return
  }

  const { slug, root } = answer.repository
  const now = await $.clock.now()

  if (listed?.slug === slug && now - listed.at < LISTED_MS) {
    return
  }

  const result = await ran($, listArgv(slug), root, LIST_TIMEOUT_MS)
  const issues = 'error' in result || result.exitCode !== 0 ? null : issuesOf(result.stdout)

  if (issues !== null) {
    listed = { slug, issues, at: now }
    failure = undefined

    return
  }

  // A listing that fails leaves the one before it on show, where there is one for this repository.
  if (listed?.slug !== slug) {
    listed = undefined
  }

  failure = warning('error' in result ? unrunOf(result.error) : result.exitCode !== 0 ? failureOf(result.stderr) : SAID.unreadable)
}

// The open issues are listed once for a while, and filtered as the person types: a reference typed
// after that lists them again, as does one typed after a listing failed.
const ensureListed = async ($: EngineInterface) => {
  listing ??= listIssues($).finally(() => {
    listing = undefined
  })
  await listing
  await show($)
}

const noteOf = (): Note | null => {
  if (listed === undefined) {
    return listing === undefined && failure !== undefined ? failure : LISTING
  }

  if (listed.issues.length === 0) {
    return NONE_OPEN
  }

  return matched.length === 0 ? { text: `no open issue answers ${filter}`, isWarning: false } : null
}

// What the list shows, for the drawing to read; nothing while no reference is typed.
const show = async ($: EngineInterface) => {
  if (typed === null) {
    matched = []
    await update($, list, () => null)

    return
  }

  const issues = listed?.issues ?? []
  matched = matchesOf(issues, filter)
  picked = Math.max(0, Math.min(picked, matched.length - 1))
  const shown: List = {
    query: filter,
    isFocused: held !== undefined,
    rows: matched.map(({ number, title, labels }) => ({ number, title, labels })),
    picked,
    open: issues.length,
    repository: listed?.slug ?? null,
    note: noteOf(),
  }

  await update($, list, () => shown)
}

// The draft as it stands after an edit, or as read: the list follows the reference at the cursor.
const follow = async ($: EngineInterface, text: string, cursor: number) => {
  if (held !== undefined) {
    return
  }

  const now = typedAt(text, cursor)

  if (now === null || typedKey(now) === dismissed) {
    dismissed = now === null ? null : dismissed

    if (typed !== null) {
      typed = null
      await show($)
    }

    return
  }

  if (typed !== null && typedKey(typed) === typedKey(now) && typed.end === now.end) {
    return
  }

  const isNew = typed === null || typed.start !== now.start
  dismissed = null
  typed = now
  filter = now.query
  picked = 0
  // The field holds what is typed after `@#`, for the keys to carry on from where it is.
  await update($, field, kept => (kept.value === now.query ? kept : { ...kept, value: now.query }))
  await show($)

  if (isNew) {
    void quietly($, 'list', ensureListed($))
  }
}

const referenceOf = ({ number, title, state, url }: Issue): Reference => ({ number, title, state, isPull: /\/pull\/\d+\/?$/.test(url) })

// The issues the draft names, as far as they are loaded, for the attachments mod to draw.
const publish = async ($: EngineInterface) => {
  const shown = named.flatMap(number => {
    const issue = loaded.get(number)?.issue

    return issue === null || issue === undefined ? [] : [referenceOf(issue)]
  })
  const json = JSON.stringify(shown)

  if (json !== published) {
    published = json
    await update($, references, () => shown)
  }
}

// One issue the draft names: the copy listed for the list where it has one, else as gh has it, else
// none.
const loadOne = async ($: EngineInterface, { slug, root }: Repository, number: number, now: number) => {
  const kept = listed?.slug === slug ? listed.issues.find(issue => issue.number === number) : undefined

  if (kept !== undefined) {
    loaded.set(number, { issue: kept, at: now })

    return
  }

  const result = await ran($, viewArgv(slug, number), root, VIEW_TIMEOUT_MS)
  loaded.set(number, { issue: 'error' in result || result.exitCode !== 0 ? null : viewedOf(result.stdout, number), at: now })
}

// Loads the issues the draft names that are not loaded, or not for a while; one that could not be
// loaded is asked for again a minute on.
const loadNamed = async ($: EngineInterface) => {
  const answer = await repositoryOf($)

  if (!('repository' in answer)) {
    return
  }

  if (loadedSlug !== answer.repository.slug) {
    loaded = new Map()
    loadedSlug = answer.repository.slug
  }

  const now = await $.clock.now()
  const due = named.filter(number => {
    const kept = loaded.get(number)

    return !loading.has(number) && (kept === undefined || now - kept.at >= (kept.issue === null ? RETRY_MS : LISTED_MS))
  })

  if (due.length === 0) {
    return
  }

  due.forEach(number => loading.add(number))

  try {
    await Promise.all(due.map(number => loadOne($, answer.repository, number, now)))
  } finally {
    due.forEach(number => loading.delete(number))
  }

  await publish($)
}

// The issues the draft names, the one still being typed at the cursor left out until it is done.
const track = async ($: EngineInterface, text: string, cursor: number) => {
  const typing = typedAt(text, cursor)
  named = referencesOf(typing === null ? text : `${text.slice(0, typing.start)} ${text.slice(typing.end)}`)
  await publish($)
  void quietly($, 'references', loadNamed($))
}

// The draft as it stands: the list follows the reference at the cursor, and the issues it names are
// loaded.
const observe = ($: EngineInterface, text: string, cursor: number) => Promise.all([follow($, text, cursor), track($, text, cursor)])

const sync = async ($: EngineInterface) => {
  const { text, cursor } = await $.prompt.read()
  const draft = `${cursor}\n${text}`

  if (draft !== seen) {
    seen = draft
    await observe($, text, cursor)
  }
}

// The focus chord moved the keys into the list's field. One typed in a field nobody saw taking the
// keys (the mod was loaded again under it) holds them as the first does.
const holdKeys = async ($: EngineInterface, requestId: string, key: string) => {
  if (held !== undefined || typed === null) {
    return
  }

  held = {
    denied: 0,
    watch: $.clock.every(WATCH_MS, () => {
      void quietly($, 'list', watchKeys($, requestId, key))
    }),
  }
  await show($)
}

// Escape hands the keys back to the prompt and raises nothing. The engine refuses to move the ring
// of a site that does not hold the keyboard, so asking it to keep the ring where it is tells; two
// refusals in a row, since a ring on the move is refused too.
const watchKeys = async ($: EngineInterface, requestId: string, key: string) => {
  const answer = await $.ui.focus({ requestId, key }).catch((error: unknown) => ({ deny: String(error) }))

  if (held === undefined) {
    return
  }

  held.denied = answer.deny === undefined ? 0 : held.denied + 1

  if (held.denied >= 2) {
    await letKeysGo($, true)
  }
}

// The field hands the keys back to the prompt: a field that is not drawn can hold no keyboard, so it
// is left out of one drawing, and the one drawn after it is another field. After Escape the list
// stays closed over the reference until it changes.
const letKeysGo = async ($: EngineInterface, isDismissed: boolean) => {
  held?.watch.cancel()
  held = undefined

  if (isDismissed && typed !== null) {
    dismissed = typedKey(typed)
    typed = null
  }

  filter = typed?.query ?? ''
  picked = 0
  await update($, field, ({ drawn }) => ({ drawn: drawn + 1, isDown: true, value: filter }))
  $.clock.after(FIELD_DOWN_MS, () => {
    void quietly($, 'list', update($, field, kept => ({ ...kept, isDown: false })))
  })
  await show($)
}

const typeFilter = async ($: EngineInterface, requestId: string, key: string, text: string) => {
  await holdKeys($, requestId, key)
  filter = text
  picked = 0
  await show($)
}

// Down or Tab, Up or Shift+Tab in the field: the pick moves, round the ends.
const step = async ($: EngineInterface, by: number) => {
  if (matched.length > 0) {
    picked = (picked + by + matched.length) % matched.length
    await show($)
  }
}

// The reference at the cursor becomes `@#N`. The keys go back to the prompt first; Claude Code puts
// the cursor at the end of a draft a mod fills in.
const take = async ($: EngineInterface, number: number) => {
  const reference = typed

  if (reference === null) {
    return
  }

  // A draft read before the new one lands opens no list over the reference.
  dismissed = typedKey(reference)
  typed = null
  await letKeysGo($, false)
  const { text, cursor } = await $.prompt.read()
  const at = typedAt(text, cursor) ?? (text.startsWith(`@#${reference.query}`, reference.start) ? reference : null)

  if (at !== null) {
    await $.prompt.fill({ text: withIssue(text, at, number), mode: 'replace' })
  }
}

// Enter in the field takes the picked issue; with none, digits typed there are taken as the number
// of an issue the list does not have (a closed one), and anything else hands the keys back.
const submitFilter = async ($: EngineInterface) => {
  const number = matched[picked]?.number ?? (/^[1-9]\d*$/.test(filter) ? Number(filter) : null)

  if (number === null) {
    await letKeysGo($, false)
  } else {
    await take($, number)
  }
}

// One issue a prompt names, as gh has it now; the copy listed for the list, or loaded for the
// draft's chips, where gh cannot answer, and otherwise why not.
const fetchIssue = async ($: EngineInterface, { slug, root }: Repository, number: number): Promise<Issue | Note> => {
  const result = await ran($, viewArgv(slug, number), root, VIEW_TIMEOUT_MS)
  const issue = 'error' in result || result.exitCode !== 0 ? null : viewedOf(result.stdout, number)
  const kept = (listed?.slug === slug ? listed.issues.find(listedIssue => listedIssue.number === number) : undefined) ?? (loadedSlug === slug ? loaded.get(number)?.issue ?? undefined : undefined)

  if (issue !== null || kept !== undefined) {
    return issue ?? (kept as Issue)
  }

  return warning('error' in result ? unrunOf(result.error) : result.exitCode !== 0 ? failureOf(result.stderr) : SAID.unreadable)
}

const isIssue = (value: Issue | Note): value is Issue => 'number' in value

// The issues a prompt names, each as the model reads it beside the prompt. As in opencode.vim, an
// issue that goes with it is not announced; a toast says which could not.
const contextFor = async ($: EngineInterface, numbers: number[]) => {
  const answer = await repositoryOf($)

  if (!('repository' in answer)) {
    $.ui.toast(`${numbers.map(number => `@#${number}`).join(', ')} not attached: ${answer.note.text}`)

    return []
  }

  const fetched = await Promise.all(numbers.map(async number => ({ number, got: await fetchIssue($, answer.repository, number) })))
  const issues = fetched.flatMap(({ got }) => (isIssue(got) ? [got] : []))
  const missed = fetched.flatMap(({ number, got }) => (isIssue(got) ? [] : [`could not attach @#${number}: ${got.text}`]))

  if (missed.length > 0) {
    $.ui.toast(missed.join(' · '))
  }

  return issues.map(issue => contextOf(issue, answer.repository.slug))
}

// The mod was loaded, or loaded again: a list or a field it left up before is taken down, and the
// draft is followed from here.
const boot = async ($: EngineInterface) => {
  held?.watch.cancel()
  held = undefined
  typed = null
  dismissed = null
  seen = undefined
  named = []
  published = undefined
  await update($, list, () => null)
  await update($, references, () => [])
  await update($, field, ({ drawn }) => ({ drawn: drawn + 1, isDown: false, value: '' }))
  poll ??= $.clock.every(POLL_MS, () => {
    void quietly($, 'draft', sync($))
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    void quietly($, 'start', boot($))

    return started
  })

  // Each key that types or moves the cursor: the list follows at once, without waiting for a read.
  on('prompt.edit', async ($, e, next) => {
    const edited = await next(e)
    seen = `${edited.cursor}\n${edited.text}`
    void quietly($, 'draft', observe($, edited.text, edited.cursor))

    return edited
  })

  // A prompt that is sent takes the list with it, and the issues it names go to the model beside it.
  on('prompt.submit', async ($, e, next) => {
    typed = null
    named = []
    void quietly($, 'list', Promise.all([show($), publish($)]))
    const numbers = PERSON.has(e.origin.kind) ? referencesOf(e.text) : []

    if (numbers.length === 0) {
      return next(e)
    }

    const blocks = await contextFor($, numbers).catch((error: unknown) => {
      $.ui.log(`attach: ${String(error)}`, { to: 'debug' })

      return []
    })

    return next(blocks.length === 0 ? e : { ...e, context: [...(e.context ?? []), ...blocks] })
  })

  // The list stands first in the band above the prompt, over whatever else is drawn there, and gives
  // way to a survey.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const beneath = await next(e)

    if (e.surface !== 'terminal' || e.props.hasSurvey) {
      return beneath
    }

    const shown = await read($, list)

    if (shown === null) {
      return beneath
    }

    const { drawn, isDown, value } = await read($, field)
    const table = $.ui.resolve(e)
    const { Box } = table
    const { requestId } = e
    const key = fieldKey(drawn)
    const keys = isDown
      ? null
      : {
          key,
          value,
          onInput: (text: string) => {
            void quietly($, 'list', typeFilter($, requestId, key, text))
          },
          onSubmit: () => {
            void quietly($, 'list', submitFilter($))
          },
        }

    const pick = (number: number) => {
      void quietly($, 'list', take($, number))
    }

    return (
      <Box flexDirection="column">
        {IssueList(table, shown, keys, e.props.bodyColumns, e.props.maxRows, pick)}
        {beneath}
      </Box>
    )
  })

  // The keys moving into the field is the list taking them. Tab, Shift+Tab and the arrows in the
  // field move the ring onto an element beside it: the pick moves instead, and the ring is kept on
  // the field by not passing the move on.
  on('ui.focus', async ($, e, next) => {
    if (e.component === 'AbovePrompt' && e.plugin === 'issues' && e.origin.kind === 'person' && (e.element === NEXT || e.element === PREVIOUS)) {
      void quietly($, 'list', step($, e.element === NEXT ? 1 : -1))

      return {}
    }

    const moved = await next(e)

    if (e.component === 'AbovePrompt' && e.plugin === 'issues' && isField(e.element) && e.element !== undefined && moved.deny === undefined) {
      void quietly($, 'list', holdKeys($, e.requestId, e.element))
    }

    return moved
  })
}
