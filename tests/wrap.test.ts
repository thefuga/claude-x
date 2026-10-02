import { describe, expect, test } from 'claude-code/testing'

import { cursorIn, layOut } from '../hooks/statusline/wrap'

const a = (count: number) => 'a'.repeat(count)
const b = (count: number) => 'b'.repeat(count)
const texts = (text: string, width: number) => layOut(text, width)?.map(row => row.text)

// Each case is one the prompt box itself was seen to draw this way.
describe('wrap', () => {
  test('wraps on words and keeps the space at a break on the row it ends', () => {
    expect(texts('hello', 96)).toEqual(['hello'])
    expect(texts('The quick brown fox jumps', 10)).toEqual(['The quick ', 'brown fox ', 'jumps'])
    expect(texts('one\n\ntwo three', 5)).toEqual(['one', '', 'two ', 'three'])
  })

  test('does not show the space a full row pushed to the next one', () => {
    expect(layOut(`${a(90)} ${b(5)} ccc`, 96)).toEqual([
      { text: `${a(90)} ${b(5)}`, start: 0, hidden: 0, line: 1 },
      { text: 'ccc', start: 96, hidden: 1, line: 1 },
    ])
    expect(texts(`${a(96)} b`, 96)).toEqual([a(96), 'b'])
    expect(texts(`${a(95)}  b`, 96)).toEqual([`${a(95)} `, 'b'])
    expect(layOut(`${a(56)} `, 56)).toEqual([
      { text: a(56), start: 0, hidden: 0, line: 1 },
      { text: '', start: 56, hidden: 1, line: 1 },
    ])
  })

  test('cuts a word longer than a row, after the space that led to it', () => {
    expect(texts('x'.repeat(230), 96)?.map(text => text.length)).toEqual([96, 96, 38])
    expect(texts(`${a(56)} ${b(60)}`, 56)).toEqual([a(56), b(55), b(5)])
    expect(texts(`${a(20)} ${b(100)} tail`, 56)?.map(text => text.length)).toEqual([21, 56, 49])
  })

  test('places the cursor in the row it is drawn in', () => {
    const rows = layOut(`${a(90)} ${b(5)} ccc`, 96) ?? []

    expect(cursorIn(rows, 0)).toEqual({ row: 0, column: 0 })
    expect(cursorIn(rows, 100)).toEqual({ row: 1, column: 3 })
    expect(cursorIn(layOut(`${a(56)} `, 56) ?? [], 57)).toEqual({ row: 1, column: 0 })
    expect(cursorIn(layOut('one\n\ntwo', 20) ?? [], 4)).toEqual({ row: 1, column: 0 })
  })

  test('says which line each row shows', () => {
    expect(layOut('one\n\ntwo three', 5)?.map(row => row.line)).toEqual([1, 2, 3, 3])
    expect(layOut('', 40)).toEqual([{ text: '', start: 0, hidden: 0, line: 1 }])
  })

  test('lays out the letters and marks of Latin, Greek and Cyrillic text', () => {
    expect(texts('Olá, coração — não é só “isso”…', 12)).toEqual(['Olá, coração', '— não é só ', '“isso”…'])
    expect(texts('αβγ → жщ │ ≤', 40)).toEqual(['αβγ → жщ │ ≤'])
  })

  test('lays out nothing it has no rules for', () => {
    expect(layOut('a\tb', 40)).toBe(null)
    expect(layOut('ok 🙂', 40)).toBe(null)
    expect(layOut('日本語', 40)).toBe(null)
    expect(layOut('é', 40)).toBe(null)
    expect(layOut('x'.repeat(8001), 40)).toBe(null)
  })
})
