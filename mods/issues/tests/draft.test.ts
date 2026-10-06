import { describe, expect, test } from 'claude-code/testing'

import { referencesOf, typedAt, typedKey, withIssue } from '../hooks/draft'
import { matchesOf } from '../hooks/matches'

// Cases from opencode.vim's own tests of its `@#` autocomplete.
describe('the reference typed at the cursor', () => {
  test('starts at an @# at the start of the draft or after a space, and keeps a stop typed after it out', () => {
    expect(typedAt('@#', 2)).toEqual({ start: 0, end: 2, query: '' })
    expect(typedAt('read @#160', 10)).toEqual({ start: 5, end: 10, query: '160' })
    expect(typedAt('read @#render,', 14)).toEqual({ start: 5, end: 13, query: 'render' })
    expect(typedAt('fix\n@#tab', 9)).toEqual({ start: 4, end: 9, query: 'tab' })
    expect(typedAt('see @#a/b-c_d.e', 15)?.query).toBe('a/b-c_d.e')
  })

  test('is none past a space or a stop, in an address, after a bracket, or in a plain mention', () => {
    expect(typedAt('read @#render,next', 18)).toBeNull()
    expect(typedAt('read @#160 now', 14)).toBeNull()
    expect(typedAt('email@#160', 10)).toBeNull()
    expect(typedAt('read(@#160', 10)).toBeNull()
    expect(typedAt('see @README.md', 14)).toBeNull()
    expect(typedAt('see @#160', 4), 'the cursor before it').toBeNull()
  })

  test('is told apart by where it starts and what it reads', () => {
    expect(typedKey({ start: 4, end: 9, query: 'tab' })).toBe('4:tab')
  })

  test("becomes @#N when picked, the draft's other text kept and a space after it unless one follows", () => {
    expect(withIssue('See @#render, then continue', { start: 4, end: 12, query: 'render' }, 161)).toBe('See @#161, then continue')
    expect(withIssue('See @#render then continue', { start: 4, end: 12, query: 'render' }, 161)).toBe('See @#161 then continue')
    expect(withIssue('See @#render', { start: 4, end: 12, query: 'render' }, 161)).toBe('See @#161 ')
    expect(withIssue('@#', { start: 0, end: 2, query: '' }, 7)).toBe('@#7 ')
  })
})

describe("the issues a prompt names", () => {
  test('are the @#N that stand alone, each once, in the order first named', () => {
    const text = '@#12, repeat @#12; owner/repo#34 https://github.com/owner/repo/issues/35 x@#36 @#37suffix (@#38) @#0 and @#5.'

    expect(referencesOf(text)).toEqual([12, 38, 5])
    expect(referencesOf('nothing here, #12 alone or @12')).toEqual([])
  })
})

describe('the issues that answer what is typed', () => {
  const ISSUES = [
    { number: 215, title: 'Show detected prompt references in a compact composer strip' },
    { number: 195, title: "slash autocomplete doesn't show skills" },
    { number: 161, title: 'Render the footer with the session tabs' },
    { number: 140, title: 'Rendering glitch in the compact popup' },
    { number: 16, title: 'Prefer the native renderer' },
  ]
  const numbers = (query: string) => matchesOf(ISSUES, query).map(({ number }) => number)

  test('are all of them, in the order listed, for nothing typed', () => {
    expect(numbers('')).toEqual([215, 195, 161, 140, 16])
  })

  test("by digits, are the numbers that start with them, the exact one first", () => {
    expect(numbers('1')).toEqual([195, 161, 140, 16])
    expect(numbers('16')).toEqual([16, 161])
    expect(numbers('9')).toEqual([])
  })

  test("by words, are the titles that start with them, then a word's start, then anywhere, then their letters in order", () => {
    expect(numbers('ren')).toEqual([161, 140, 16, 215])
    expect(numbers('REN'), 'whatever the case').toEqual([161, 140, 16, 215])
    expect(numbers('dtctd')).toEqual([215])
    expect(numbers('zzz')).toEqual([])
  })
})
