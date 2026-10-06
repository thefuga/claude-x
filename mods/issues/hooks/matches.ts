// Which open issues answer what is typed after `@#`, best first, as opencode.vim ranks them: digits
// match an issue's number from its start, the exact one first; anything else matches its title.

type Ranked = { number: number; title: string }

// How well a title answers the words typed: from its start, from a word's start, anywhere in it, or
// with their letters in order; undefined when it does not.
const rankOf = (title: string, query: string) => {
  const haystack = title.toLowerCase()

  if (haystack.startsWith(query)) {
    return 0
  }

  if (haystack.split(/[^\p{L}\p{N}]+/u).some(word => word.startsWith(query))) {
    return 1
  }

  if (haystack.includes(query)) {
    return 2
  }

  let from = 0

  for (const char of query) {
    const at = haystack.indexOf(char, from)

    if (at < 0) {
      return undefined
    }

    from = at + 1
  }

  return 3
}

// The issues that answer `query`, the list's own order kept among equals: gh lists the most
// recently opened first.
export const matchesOf = <T extends Ranked>(issues: readonly T[], query: string): T[] => {
  const needle = query.trim().toLowerCase()

  if (needle === '') {
    return [...issues]
  }

  if (/^\d+$/.test(needle)) {
    const numbered = issues.filter(({ number }) => String(number).startsWith(needle))

    return [...numbered.filter(({ number }) => String(number) === needle), ...numbered.filter(({ number }) => String(number) !== needle)]
  }

  return issues
    .map((issue, index) => ({ issue, index, rank: rankOf(issue.title, needle) }))
    .filter((entry): entry is { issue: T; index: number; rank: number } => entry.rank !== undefined)
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ issue }) => issue)
}
