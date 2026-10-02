import { describe, expect, test } from 'claude-code/testing'

import { lex } from '../hooks/syntax/code'
import { scan } from '../hooks/syntax/markdown'
import { MAX_PAINTED, paint } from '../hooks/syntax/paint'

// What a draft's spans cover, each under its kind, in the order they are painted.
const spans = (text: string) => scan(text).map(({ start, end, kind }) => `${kind} ${text.slice(start, end)}`)
const tokens = (language: string, source: string) =>
  lex(source, language).map(({ start, end, kind }) => `${kind} ${source.slice(start, end)}`)

describe('markdown', () => {
  test('tells a heading, emphasis, a code span and a link apart, each with its marks', () => {
    expect(spans('# Fix the **wrap** bug')).toEqual(['heading # Fix the **wrap** bug', 'marker #', 'strong **wrap**', 'marker **', 'marker **'])
    expect(spans('see `wrapLine` in [wrap.ts](hooks/wrap.ts) and _keep_ it')).toEqual([
      'raw `wrapLine`',
      'marker `',
      'marker `',
      'marker [wrap.ts](hooks/wrap.ts)',
      'link wrap.ts',
      'url hooks/wrap.ts',
      'emphasis _keep_',
      'marker _',
      'marker _',
    ])
    expect(spans('Olá *coração* e **não**')).toEqual(['emphasis *coração*', 'marker *', 'marker *', 'strong **não**', 'marker **', 'marker **'])
    expect(spans('**Note:** keep it')).toEqual(['strong **Note:**', 'marker **', 'marker **'])
    expect(spans('#hashtag, ####### seven and plain words')).toEqual([])
  })

  test('reads what emphasis holds, and paints its marks last', () => {
    expect(spans('**bold with `code` and _more_**')).toEqual([
      'strong **bold with `code` and _more_**',
      'raw `code`',
      'marker `',
      'marker `',
      'emphasis _more_',
      'marker _',
      'marker _',
      'marker **',
      'marker **',
    ])
  })

  test('leaves globs, products, names with underscores and escaped marks alone', () => {
    expect(spans('update src/*.ts, lib/*.ts and src/**/x/** then x*y*z, 2 * 3 * 4 and *.tsx')).toEqual([])
    expect(spans('f(*args, **kwargs) and g(*a, **k), rm -rf * && ls *')).toEqual([])
    expect(spans('snake_case_name, a_b_c and \\*not this\\*')).toEqual([])
  })

  test('marks list items, tasks, quotes and rules', () => {
    expect(spans('- [ ] rows carry `line`\n  1. second\n* third\n---\n> quoted **text**')).toEqual([
      'list -',
      'list [ ]',
      'raw `line`',
      'marker `',
      'marker `',
      'list 1.',
      'list *',
      'marker ---',
      'quote > quoted **text**',
      'marker > ',
      'strong **text**',
      'marker **',
      'marker **',
    ])
  })

  test('colors addresses and tags, an address without the stop that follows it', () => {
    expect(spans('<context>\nsee https://example.com/a?b=1. And (https://x.y/z) too\n</context>')).toEqual([
      'tag <context>',
      'url https://example.com/a?b=1',
      'url https://x.y/z',
      'tag </context>',
    ])
    expect(spans('a < b && c > d')).toEqual([])
  })

  test('colors the code in a fence by the language the fence names', () => {
    expect(spans('```ts\nconst rows = wrap("a b", 4) // two rows\n```\n*after*')).toEqual([
      'marker ```',
      'language ts',
      'keyword const',
      'call wrap',
      'string "a b"',
      'number 4',
      'comment // two rows',
      'marker ```',
      'emphasis *after*',
      'marker *',
      'marker *',
    ])
    expect(spans('```py\nx = """two\nlines"""'), 'a fence left open, and a string over two lines').toEqual([
      'marker ```',
      'language py',
      'string """two\nlines"""',
    ])
  })

  test('paints no code in a fence that names no language it knows, and reads no markdown there', () => {
    expect(spans('```\n# not a heading, "nor a string"\n```')).toEqual(['marker ```', 'marker ```'])
    expect(spans('~~~text\n**plain**\n~~~~')).toEqual(['marker ~~~', 'language text', 'marker ~~~~'])
    expect(spans('run ```npm test``` first'), 'code set in three backticks on one line').toEqual([
      'raw ```npm test```',
      'marker ```',
      'marker ```',
    ])
  })
})

describe('code', () => {
  test('tells comments, strings, numbers, a language\'s words and calls apart', () => {
    expect(tokens('ts', 'export const f = async (x: number) => { await run(`a${x}`) /* c */; return null }')).toEqual([
      'keyword export',
      'keyword const',
      'keyword async',
      'keyword await',
      'call run',
      'string `a${x}`',
      'comment /* c */',
      'keyword return',
      'constant null',
    ])
    expect(tokens('go', 'func main() { fmt.Println(`raw`, 0x1f, nil) }')).toEqual([
      'keyword func',
      'call main',
      'call Println',
      'string `raw`',
      'number 0x1f',
      'constant nil',
    ])
    expect(tokens('SQL', "select id FROM users where name = 'x' -- c")).toEqual([
      'keyword select',
      'keyword FROM',
      'keyword where',
      "string 'x'",
      'comment -- c',
    ])
  })

  test('takes a name that is part of something longer for no word of the language', () => {
    expect(tokens('ts', 'obj.default.catch(() => x.type)')).toEqual(['call catch'])
    expect(tokens('sh', 'git push --set-upstream origin main && export FOO="$HOME/x" # done\nfor f in *.ts; do echo ${f#a}; done')).toEqual([
      'keyword export',
      'string "$HOME/x"',
      'comment # done',
      'keyword for',
      'keyword in',
      'keyword do',
      'constant ${f#a}',
      'keyword done',
    ])
    expect(tokens('rust', "fn f<'a>(x: &'a str) -> char { println!(\"{}\", x); 'c' }")).toEqual([
      'keyword fn',
      'call println',
      'string "{}"',
      "string 'c'",
    ])
  })

  test('names the keys of data', () => {
    expect(tokens('json', '{ "name": "x", "n": 1.5e3, "ok": true }')).toEqual([
      'property "name"',
      'string "x"',
      'property "n"',
      'number 1.5e3',
      'property "ok"',
      'constant true',
    ])
    expect(tokens('yaml', 'name: open-claude\nitems:\n  - key: "v" # c\nurl: http://x')).toEqual([
      'property name',
      'property items',
      'property key',
      'string "v"',
      'comment # c',
      'property url',
    ])
  })

  test('lexes nothing in a language it does not know', () => {
    expect(tokens('brainfuck', 'const x = "1"')).toEqual([])
    expect(tokens('', 'const x = "1"')).toEqual([])
  })
})

describe('paint', () => {
  test('gives each span the style of its kind, an inner one after the one it is in', () => {
    expect(paint('# a', false)).toEqual([
      { start: 0, end: 3, color: '#fabd2f', bold: true },
      { start: 0, end: 1, color: '#8a8a8a', bold: false, italic: false, underline: false },
    ])
  })

  test('reads a draft in shell mode as a command, not as markdown', () => {
    expect(paint('ls *.ts # all of *them*', true)).toEqual([{ start: 8, end: 23, color: '#8a8a8a', italic: true }])
  })

  test('paints nothing over a draft too long to read at every key', () => {
    expect(paint(`# ${'a'.repeat(MAX_PAINTED)}`, false)).toEqual([])
  })
})
