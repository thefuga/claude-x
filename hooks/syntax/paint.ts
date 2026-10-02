import type { PromptDecoration } from 'claude-code'

import { syntax } from '../statusline/theme'
import { lex } from './code'
import { scan } from './markdown'

// A draft longer than this is left as the engine draws it: every key would have it read again.
export const MAX_PAINTED = 20_000

// The runs the engine paints over a draft: its markdown, or in shell mode the command it is.
export const paint = (text: string, isShell: boolean): PromptDecoration[] => {
  if (text.length > MAX_PAINTED) {
    return []
  }

  const spans = isShell ? lex(text, 'sh') : scan(text)

  return spans.map(({ start, end, kind }) => ({ start, end, ...syntax[kind] }))
}
