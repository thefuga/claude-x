import type { Register } from 'claude-code'

// What stands in for the word. The engine draws its own word again for an empty one, so the running
// line takes a space; the closing line reads `<word> for 3s`, so it takes a plain verb.
const BLANK = ' '
const CLOSED = 'Worked'

export const register: Register = on => {
  // The line that runs while a turn does (`Sauteing… (12s · ↓ 300 tokens)`): the word and its
  // ellipsis go, and the engine still draws the time, tokens and thinking after them. A message that
  // stands in for the word (a task's own `Running tests`) says what the turn is doing, so it stays.
  on('ui.render', { component: 'Spinner' }, ($, e, next) =>
    e.props.message === null ? next({ ...e, props: { ...e.props, word: BLANK, suffix: '' } }) : next(e),
  )

  // The line that closes a turn (`Baked for 3s`).
  on('ui.render', { component: 'TurnDuration' }, ($, e, next) => next({ ...e, props: { ...e.props, word: CLOSED } }))
}
