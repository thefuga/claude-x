// The working copy's git state for the footer: the branch, and the lines added and deleted in the
// tracked files since the last commit, staged or not. Ported from opencode.vim's workspace footer
// (`workspace-git.ts`): the same commands, run the same way, read the same way.

import type { Git } from '../../types'

// What git is run with: nothing asked of a terminal, no lock taken that would get in the way of
// the person's own git, and output that does not change with their locale or colors.
export const GIT_ENV = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_PAGER: 'cat',
  PAGER: 'cat',
  LC_ALL: 'C',
  LANG: 'C',
  LANGUAGE: 'C',
  NO_COLOR: '1',
}

const git = (...args: string[]) => ['git', '--no-pager', '-c', 'color.ui=false', ...args]

export const BRANCH = git('symbolic-ref', '--quiet', '--short', 'HEAD')
// A HEAD on no branch is named by its commit.
export const COMMIT = git('rev-parse', '--verify', '--short=12', 'HEAD')
export const DIFFSTAT = git('diff', '--numstat', '--no-ext-diff', '--no-textconv', '--find-renames', '--ignore-submodules=all', 'HEAD', '--')

// One line of output, as a name is printed: nothing else in it, and nothing around it.
export const singleLine = (stdout: string) => {
  const normalized = stdout.replace(/\r\n/g, '\n')
  const line = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized

  return line === '' || line.includes('\n') || line !== line.trim() || /[\u0000-\u001f\u007f]/.test(line) ? null : line
}

// The branch HEAD is on, or `detached@` and the commit when it is on none; null when neither reads
// as one: no repository, or no commit to name.
export const branchOf = (onBranch: string | null, onCommit: string | null) => {
  if (onBranch !== null) {
    return singleLine(onBranch)
  }

  const sha = onCommit === null ? null : singleLine(onCommit)

  return sha !== null && /^[0-9a-f]{4,40}$/i.test(sha) ? `detached@${sha.toLowerCase()}` : null
}

// The lines added and deleted, summed over `git diff --numstat`; a binary file counts none. Output
// that does not read as numstat counts nothing, rather than something wrong.
export const diffstatOf = (stdout: string): Pick<Git, 'additions' | 'deletions'> => {
  const body = stdout.replace(/\r\n/g, '\n').replace(/\n$/, '')
  const counted = { additions: 0, deletions: 0 }

  if (body === '') {
    return counted
  }

  for (const line of body.split('\n')) {
    const [added = '', deleted = '', ...path] = line.split('\t')

    if (path.join('\t') === '') {
      return { additions: 0, deletions: 0 }
    }

    if (added === '-' && deleted === '-') {
      continue
    }

    if (!/^(0|[1-9]\d*)$/.test(added) || !/^(0|[1-9]\d*)$/.test(deleted)) {
      return { additions: 0, deletions: 0 }
    }

    counted.additions += Number(added)
    counted.deletions += Number(deleted)
  }

  return counted
}
