import { describe, expect, test } from 'claude-code/testing'

import { SAID, contextOf, failureOf, issueOf, issuesOf, listArgv, slugOf, unrunOf, viewArgv, viewedOf } from '../hooks/github'

// One issue as `gh issue list --json …` prints it.
const RAW = {
  assignees: [{ id: 'U_1', login: 'octocat', name: 'The Octocat' }],
  author: { id: 'U_2', is_bot: false, login: 'thefuga', name: 'Erick' },
  body: 'The footer should show the tabs.\r\n\r\n- one\r\n- two',
  createdAt: '2026-09-01T10:00:00Z',
  labels: [{ id: 'L_1', name: 'enhancement', description: '', color: 'a2eeef' }],
  number: 161,
  state: 'OPEN',
  title: 'Render the footer with the session tabs',
  updatedAt: '2026-09-03T16:30:44Z',
  url: 'https://github.com/thefuga/opencode.vim/issues/161',
}

describe('the repository', () => {
  test('is the owner and name of a github.com origin, over HTTPS or SSH', () => {
    expect(slugOf('https://github.com/thefuga/opencode.vim')).toBe('thefuga/opencode.vim')
    expect(slugOf('https://github.com/thefuga/claude-x.git')).toBe('thefuga/claude-x')
    expect(slugOf('git@github.com:thefuga/claude-x.git')).toBe('thefuga/claude-x')
    expect(slugOf('ssh://git@github.com/thefuga/claude-x.git\n')).toBe('thefuga/claude-x')
  })

  test('is none on any other host, or for a path that is not owner and name', () => {
    expect(slugOf('git@gitlab.com:thefuga/claude-x.git')).toBeNull()
    expect(slugOf('https://github.com/thefuga')).toBeNull()
    expect(slugOf('https://github.com/the fuga/x')).toBeNull()
    expect(slugOf('')).toBeNull()
  })
})

describe('what gh is asked', () => {
  test('lists the open issues once, and fetches one by its number', () => {
    const fields = 'number,title,state,body,labels,assignees,author,createdAt,updatedAt,url'

    expect(listArgv('o/r')).toEqual(['gh', 'issue', 'list', '--repo', 'o/r', '--state', 'open', '--limit', '100', '--json', fields])
    expect(viewArgv('o/r', 7)).toEqual(['gh', 'issue', 'view', '7', '--repo', 'o/r', '--json', fields])
  })
})

describe('what gh prints', () => {
  test('is read as issues: labels and assignees by name, the author by login', () => {
    expect(issueOf(RAW)).toEqual({
      number: 161,
      title: 'Render the footer with the session tabs',
      state: 'OPEN',
      body: 'The footer should show the tabs.\r\n\r\n- one\r\n- two',
      labels: ['enhancement'],
      assignees: ['octocat'],
      author: 'thefuga',
      createdAt: '2026-09-01T10:00:00Z',
      updatedAt: '2026-09-03T16:30:44Z',
      url: 'https://github.com/thefuga/opencode.vim/issues/161',
    })
    expect(issuesOf(JSON.stringify([RAW, { ...RAW, number: 7, labels: [], author: null }]))?.map(issue => [issue.number, issue.author])).toEqual([
      [161, 'thefuga'],
      [7, null],
    ])
  })

  test('that is not a list of whole issues is read as none', () => {
    expect(issuesOf('not json')).toBeNull()
    expect(issuesOf(JSON.stringify({ number: 1 }))).toBeNull()
    expect(issuesOf(JSON.stringify([RAW, { ...RAW, title: '' }]))).toBeNull()
    expect(issuesOf('[]')).toEqual([])
    expect(viewedOf(JSON.stringify(RAW), 161)?.number).toBe(161)
    expect(viewedOf(JSON.stringify(RAW), 162), 'another issue than the one asked for').toBeNull()
  })

  test('on failure, says why in one line, a logged-out gh told apart and any token blanked', () => {
    expect(failureOf('To get started with GitHub CLI, please run:  gh auth login')).toBe(SAID.loggedOut)
    expect(failureOf('\nGraphQL: Could not resolve to a Repository with the name x/y. (repository)\n')).toBe(
      'gh: GraphQL: Could not resolve to a Repository with the name x/y. (repository)',
    )
    expect(failureOf('HTTP 502 for ghp_abcdefABCDEF123456 on api.github.com')).toBe('gh: HTTP 502 for [redacted] on api.github.com')
    expect(failureOf('')).toBe('gh failed')
    expect(unrunOf(new Error('spawn gh ENOENT'))).toBe(SAID.noGh)
    expect(unrunOf(new Error('the command timed out after 15000 ms'))).toBe(SAID.slow)
  })
})

describe('an issue for the model', () => {
  test('is named as the prompt names it, then written as the file opencode.vim attaches', () => {
    const issue = issueOf(RAW)

    expect(issue === null ? '' : contextOf(issue, 'thefuga/opencode.vim')).toBe(
      [
        '@#161 in the prompt is this GitHub issue of thefuga/opencode.vim, its comments left out:',
        '',
        '---',
        'kind: "github-issue"',
        'github_reference: "thefuga/opencode.vim#161"',
        'repository: "thefuga/opencode.vim"',
        'number: 161',
        'canonical_url: "https://github.com/thefuga/opencode.vim/issues/161"',
        'title: "Render the footer with the session tabs"',
        'state: "OPEN"',
        'author: "thefuga"',
        'labels: ["enhancement"]',
        'assignees: ["octocat"]',
        'created_at: "2026-09-01T10:00:00Z"',
        'updated_at: "2026-09-03T16:30:44Z"',
        '---',
        '',
        'The footer should show the tabs.\n\n- one\n- two',
      ].join('\n'),
    )
  })

  test('quotes a title as YAML reads it, and says so where there is no description', () => {
    const issue = issueOf({ ...RAW, title: `Say "hi"${String.fromCharCode(0x2028)}twice`, body: '', author: null, createdAt: '' })
    const written = issue === null ? '' : contextOf(issue, 'o/r')

    expect(written).toContain('title: "Say \\"hi\\"\\u2028twice"')
    expect(written).toContain('author: null')
    expect(written).toContain('created_at: null')
    expect(written.endsWith('---\n\n(no description)')).toBe(true)
  })
})
