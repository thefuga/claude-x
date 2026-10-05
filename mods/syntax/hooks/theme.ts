import type { PromptDecoration } from 'claude-code'

import type { Kind } from './markdown'

type Style = Omit<PromptDecoration, 'start' | 'end'>

// Gruvbox, as the status line's theme. Inside tmux Claude Code draws in 256 colors unless
// CLAUDE_CODE_TMUX_TRUECOLOR is set, so a teal is a step off #83a598 to round to one.

// A mark of the markup and a comment: a gray off the ramp, which the palette's own #928374 rounds away from.
const MUTED = '#8a8a8a'

// What each part of a draft's markdown, and of the code in its fences, is painted in. A part inside
// another is painted after it, so a mark names every style its surroundings may have set.
export const syntax: Record<Kind, Style> = {
  heading: { color: '#fabd2f', bold: true },
  marker: { color: MUTED, bold: false, italic: false, underline: false },
  strong: { color: '#fe8019', bold: true },
  emphasis: { color: '#d3869b', italic: true },
  raw: { color: '#8ec07c' },
  link: { color: '#7fa598' },
  url: { color: '#7fa598', underline: true },
  list: { color: '#fe8019', bold: true },
  quote: { color: '#a89984', italic: true },
  tag: { color: '#7fa598' },
  language: { color: '#d3869b', italic: true },
  comment: { color: MUTED, italic: true },
  string: { color: '#b8bb26' },
  number: { color: '#d3869b' },
  keyword: { color: '#fb4934' },
  constant: { color: '#d3869b' },
  call: { color: '#8ec07c' },
  property: { color: '#7fa598' },
}
