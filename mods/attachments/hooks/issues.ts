// A GitHub issue or pull request the draft names with `@#N`, as its chip shows it. What the issue
// is comes from the issues mod, which loads it and keeps it in its state; here it is only told by
// its state and named.

import type { Chip, FileType, IssueReference } from '../types'
import { MAX_PATH } from './files'

// The glyph an issue's chip has: GitHub's mark for what it is and how it stands.
export const issueTypeOf = ({ state, isPull }: IssueReference): FileType => {
  if (!isPull) {
    return state === 'OPEN' ? 'issue' : 'issue-closed'
  }

  return state === 'OPEN' ? 'pull' : state === 'MERGED' ? 'pull-merged' : 'pull-closed'
}

// `#N` and its title, cut to the width a path has on a chip.
export const issueNameOf = ({ number, title }: IssueReference) => {
  const chars = [...`#${number} ${title}`]

  return chars.length <= MAX_PATH ? chars.join('') : `${chars.slice(0, MAX_PATH - 1).join('')}…`
}

// The chip of an issue the draft names once the issues mod has loaded it. Its state is said once it
// is no longer open.
export const issueChipOf = (reference: IssueReference, mark: string, at: number): Chip => ({
  type: issueTypeOf(reference),
  name: issueNameOf(reference),
  facts: reference.state === 'OPEN' ? [] : [reference.state.toLowerCase()],
  mark,
  at,
})
