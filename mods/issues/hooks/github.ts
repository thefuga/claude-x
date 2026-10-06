// The repository's GitHub issues as opencode.vim gets them (its `github-issues.ts`): the
// repository from the git origin, the open issues from one `gh issue list`, one issue from
// `gh issue view`, and an issue written out for the model as the Markdown file opencode.vim
// attaches. What is run, and when, is the hooks' business; here the commands are written and what
// they print is read.

// One issue as gh prints it, the comments left out as opencode.vim leaves them out.
export type Issue = {
  number: number
  title: string
  state: string
  body: string
  labels: string[]
  assignees: string[]
  author: string | null
  createdAt: string | null
  updatedAt: string
  url: string
}

// The most open issues listed: the list is fetched once and filtered as the person types.
export const LIST_LIMIT = 100
const FIELDS = ['number', 'title', 'state', 'body', 'labels', 'assignees', 'author', 'createdAt', 'updatedAt', 'url'].join(',')

// What git and gh are run with: nothing asked of a terminal, no pager, no colors, no update notice.
export const GH_ENV = {
  GH_PROMPT_DISABLED: '1',
  GH_NO_UPDATE_NOTIFIER: '1',
  GIT_TERMINAL_PROMPT: '0',
  GH_PAGER: 'cat',
  PAGER: 'cat',
  NO_COLOR: '1',
}

export const TOP_LEVEL = ['git', 'rev-parse', '--show-toplevel']
export const ORIGIN = ['git', 'config', '--get', 'remote.origin.url']

export const listArgv = (slug: string) => ['gh', 'issue', 'list', '--repo', slug, '--state', 'open', '--limit', String(LIST_LIMIT), '--json', FIELDS]

export const viewArgv = (slug: string, number: number) => ['gh', 'issue', 'view', String(number), '--repo', slug, '--json', FIELDS]

// Why there are no issues to list, in the words the list says it with.
export const SAID = {
  noRepository: 'not in a git repository',
  noOrigin: 'this repository has no origin remote',
  notGitHub: 'origin is not a github.com repository',
  noGh: 'gh is not installed: cli.github.com',
  loggedOut: 'gh is not logged in: run gh auth login',
  slow: 'GitHub did not answer in time',
  unreadable: 'gh printed something that is not a list of issues',
}

const NAME = /^[A-Za-z0-9_.-]+$/

// `OWNER/REPO` of a github.com remote, over HTTPS or SSH, as opencode.vim takes them; null for any
// other host.
export const slugOf = (remote: string): string | null => {
  const value = remote.trim()
  const found =
    /^https:\/\/github\.com\/([^/]+)\/([^/#]+?)\/?$/i.exec(value) ??
    /^git@github\.com:([^/]+)\/([^/#]+?)\/?$/i.exec(value) ??
    /^ssh:\/\/(?:git@)?github\.com\/([^/]+)\/([^/#]+?)\/?$/i.exec(value)
  const owner = found?.[1]?.trim() ?? ''
  const name = found?.[2]?.trim().replace(/\.git$/i, '') ?? ''

  return NAME.test(owner) && NAME.test(name) ? `${owner}/${name}` : null
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

// A person as gh names one: by login, or by name where there is no login.
const login = (value: unknown) => (typeof value === 'string' ? value.trim() : text(record(value).login) || text(record(value).name)) || null

const names = (value: unknown, field: 'name' | 'login') =>
  Array.isArray(value) ? value.map(item => (typeof item === 'string' ? item.trim() : text(record(item)[field]))).filter(name => name !== '') : []

// One issue of gh's JSON; null for one missing what every issue has.
export const issueOf = (value: unknown): Issue | null => {
  const raw = record(value)
  const number = Number(raw.number)
  const title = text(raw.title)
  const state = text(raw.state).toUpperCase()
  const updatedAt = text(raw.updatedAt)
  const url = text(raw.url)

  if (!Number.isSafeInteger(number) || number <= 0 || title === '' || state === '' || updatedAt === '' || url === '') {
    return null
  }

  return {
    number,
    title,
    state,
    body: typeof raw.body === 'string' ? raw.body : '',
    labels: names(raw.labels, 'name'),
    assignees: names(raw.assignees, 'login'),
    author: login(raw.author),
    createdAt: text(raw.createdAt) || null,
    updatedAt,
    url,
  }
}

const parsed = (stdout: string): unknown => {
  try {
    return JSON.parse(stdout)
  } catch {
    return undefined
  }
}

// What `gh issue list` printed, or null where it is not a list of issues.
export const issuesOf = (stdout: string): Issue[] | null => {
  const value = parsed(stdout)
  const issues = Array.isArray(value) ? value.map(issueOf) : null

  return issues === null || issues.some(issue => issue === null) ? null : (issues as Issue[])
}

// What `gh issue view` printed, or null where it is not that issue.
export const viewedOf = (stdout: string, number: number): Issue | null => {
  const issue = issueOf(parsed(stdout))

  return issue?.number === number ? issue : null
}

// What gh said when it failed, as one short line with any credential in it blanked.
export const failureOf = (stderr: string) => {
  if (/auth|authenticate|login|token|credential/i.test(stderr)) {
    return SAID.loggedOut
  }

  const line =
    stderr
      .replace(/\bgh[pousr]_[A-Za-z0-9_]+\b/g, '[redacted]')
      .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s,;]+/gi, '$1[redacted]')
      .split(/\r?\n/)
      .map(row => row.trim())
      .find(row => row !== '') ?? ''

  return line === '' ? 'gh failed' : `gh: ${line.slice(0, 120)}`
}

// Why gh could not be run at all: not there, or too slow.
export const unrunOf = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)

  return /time|killed/i.test(message) ? SAID.slow : /ENOENT|not found|no such file|spawn/i.test(message) ? SAID.noGh : `gh could not run: ${message.slice(0, 120)}`
}

// JSON's quoting is YAML's, but for the two line separators JSON leaves bare.
const SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028, 0x2029)}]`, 'g')

const quoted = (value: string) => JSON.stringify(value).replace(SEPARATORS, char => `\\u${char.charCodeAt(0).toString(16)}`)

const quotedOrNull = (value: string | null) => (value === null ? 'null' : quoted(value))

const list = (values: string[]) => `[${values.map(quoted).join(', ')}]`

// An issue for the model to read beside the prompt: what it is named in the prompt, then the file
// opencode.vim attaches, YAML front matter and the body as written.
export const contextOf = (issue: Issue, slug: string) =>
  [
    `@#${issue.number} in the prompt is this GitHub issue of ${slug}, its comments left out:`,
    '',
    '---',
    `kind: ${quoted('github-issue')}`,
    `github_reference: ${quoted(`${slug}#${issue.number}`)}`,
    `repository: ${quoted(slug)}`,
    `number: ${issue.number}`,
    `canonical_url: ${quoted(`https://github.com/${slug}/issues/${issue.number}`)}`,
    `title: ${quoted(issue.title)}`,
    `state: ${quoted(issue.state)}`,
    `author: ${quotedOrNull(issue.author)}`,
    `labels: ${list(issue.labels)}`,
    `assignees: ${list(issue.assignees)}`,
    `created_at: ${quotedOrNull(issue.createdAt)}`,
    `updated_at: ${quoted(issue.updatedAt)}`,
    '---',
    '',
    issue.body.replace(/\r\n?/g, '\n') || '(no description)',
  ].join('\n')
