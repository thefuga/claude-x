import { describe, expect, test } from 'claude-code/testing'

import { marksOf, withoutMark } from '../hooks/draft'

describe('draft', () => {
  test('finds the pasted pictures, the pasted texts and the mentions, in the order they stand', () => {
    const draft = '[Image #1] [Image #12][Pasted text #3 +30 lines] see @README.md and @"my notes.md" at @src/app.ts#L10-20'

    expect(marksOf(draft)).toEqual([
      { kind: 'image', text: '[Image #1]', at: 0, number: 1 },
      { kind: 'image', text: '[Image #12]', at: draft.indexOf('[Image #12]'), number: 12 },
      { kind: 'paste', text: '[Pasted text #3 +30 lines]', at: draft.indexOf('[Pasted'), number: 3, lines: 30 },
      { kind: 'mention', text: '@README.md', at: draft.indexOf('@README'), name: 'README.md', path: 'README.md', bare: null },
      { kind: 'mention', text: '@"my notes.md"', at: draft.indexOf('@"'), name: 'my notes.md', path: 'my notes.md', bare: null },
      { kind: 'mention', text: '@src/app.ts#L10-20', at: draft.indexOf('@src'), name: 'src/app.ts#L10-20', path: 'src/app.ts', bare: null },
    ])
  })

  test('takes a paste folded without its count, and one of a single line', () => {
    expect(marksOf('[Pasted text #4][Pasted text #5 +1 line]')).toEqual([
      { kind: 'paste', text: '[Pasted text #4]', at: 0, number: 4, lines: null },
      { kind: 'paste', text: '[Pasted text #5 +1 line]', at: 16, number: 5, lines: 1 },
    ])
  })

  test('opens a mention only at the start or after a space, and tries one that ends a sentence without its stop', () => {
    expect(marksOf('mail me@example.com')).toEqual([])
    expect(marksOf('@docs first')[0]).toMatchObject({ at: 0, name: 'docs', bare: null })
    expect(marksOf('read @./src/app.ts, then @docs.')).toEqual([
      { kind: 'mention', text: '@./src/app.ts,', at: 5, name: './src/app.ts,', path: './src/app.ts,', bare: { text: '@./src/app.ts', name: './src/app.ts', path: './src/app.ts' } },
      { kind: 'mention', text: '@docs.', at: 25, name: 'docs.', path: 'docs.', bare: { text: '@docs', name: 'docs', path: 'docs' } },
    ])
  })

  test('finds an issue the draft names, @#N standing alone, as the issues mod reads it', () => {
    const draft = 'fix @#320, then (@#12) and me@#5, @#7a and @#rel'

    expect(marksOf(draft).map(({ kind, text }) => [kind, text])).toEqual([
      ['issue', '@#320'],
      ['issue', '@#12'],
      ['mention', '@#7a'],
      ['mention', '@#rel'],
    ])
    expect(marksOf('@#320')).toEqual([{ kind: 'issue', text: '@#320', at: 0, number: 320 }])
    expect(withoutMark('fix @#320 and @#12', '@#320', 4)).toBe('fix and @#12')
  })

  test('takes an attachment out with the space after it, or before it where none follows', () => {
    expect(withoutMark('see @a.md and @b.md', '@a.md', 4)).toBe('see and @b.md')
    expect(withoutMark('see @a.md', '@a.md', 4)).toBe('see')
    expect(withoutMark('[Image #1][Pasted text #2]', '[Image #1]', 0)).toBe('[Pasted text #2]')
    expect(withoutMark('@a.md', '@a.md', 0)).toBe('')
  })

  test('finds an attachment that moved since it was read, and leaves a draft without it alone', () => {
    expect(withoutMark('new words @a.md', '@a.md', 0)).toBe('new words')
    expect(withoutMark('@a.md and @a.md', '@a.md', 10)).toBe('@a.md and')
    expect(withoutMark('nothing here', '[Image #1]', 0)).toBe(null)
  })
})
