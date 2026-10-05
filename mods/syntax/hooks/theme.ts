import type { PromptDecoration } from 'claude-code'

import type { Kind } from './markdown'

type Style = Omit<PromptDecoration, 'start' | 'end'>

// Every color is a key of Claude Code's theme, so the draft follows whatever theme is picked in
// `/theme`, light or dark. The keys are chosen for their color in the built-in themes as much as for
// their meaning: a heading in `warning` is yellow, not a warning.

// What each part of a draft's markdown, and of the code in its fences, is painted in. A part inside
// another is painted after it, so a mark names every style its surroundings may have set.
export const syntax: Record<Kind, Style> = {
  heading: { color: 'warning', bold: true },
  marker: { color: 'subtle', bold: false, italic: false, underline: false },
  strong: { color: 'claude', bold: true },
  emphasis: { color: 'autoAccept', italic: true },
  raw: { color: 'success' },
  link: { color: 'suggestion' },
  url: { color: 'suggestion', underline: true },
  list: { color: 'claude', bold: true },
  quote: { color: 'subtle', italic: true },
  tag: { color: 'suggestion' },
  language: { color: 'autoAccept', italic: true },
  comment: { color: 'inactive', italic: true },
  string: { color: 'success' },
  number: { color: 'permission' },
  keyword: { color: 'error' },
  constant: { color: 'permission' },
  call: { color: 'suggestion' },
  property: { color: 'suggestion' },
}
