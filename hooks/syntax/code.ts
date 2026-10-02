// The code a draft holds, colored by the language it is said to be in: comments, strings, numbers,
// the language's own words and the names that are called. A mod's module has no parser to load (no
// WebAssembly, no package), so this is one pattern run over the text with no grammar behind it:
// what it cannot tell apart it leaves uncolored.

export type TokenKind = 'comment' | 'string' | 'number' | 'keyword' | 'constant' | 'call' | 'property'

export type Token = { start: number; end: number; kind: TokenKind }

// A language as far as it is told apart here: what is tried at each place, in this order, then its
// names against the words it keeps for itself. A name that touches one of `joins` is a part of
// something longer (a member, a flag, a path) and is no word of the language's, whatever it spells.
type Language = {
  comments?: readonly string[]
  properties?: readonly string[]
  strings?: readonly string[]
  variables?: readonly string[]
  keywords?: string
  constants?: string
  joins?: { before: string; after: string }
  isCaseless?: boolean
}

type Grammar = {
  pattern: RegExp
  keywords: ReadonlySet<string>
  constants: ReadonlySet<string>
  joins: { before: string; after: string }
  isCaseless: boolean
}

const SLASHES = String.raw`\/\/[^\n]*`
const BLOCK = String.raw`\/\*[\s\S]*?\*\/`
// A `#` that starts a word: `$#`, `${#name}` and `a#b` are not comments.
const HASH = String.raw`(?<=^|\s)#[^\n]*`
const DASHES = String.raw`--[^\n]*`
const DOUBLE = String.raw`"(?:\\.|[^"\\\n])*"`
const SINGLE = String.raw`'(?:\\.|[^'\\\n])*'`
// Strings that run over lines: a template, a raw string, a triple-quoted one, a shell's quotes.
const TEMPLATE = String.raw`\x60(?:\\[\s\S]|[^\x60\\])*\x60`
const RAW = String.raw`\x60[^\x60]*\x60`
const TRIPLE = String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''`
const LONG_DOUBLE = String.raw`"(?:\\[\s\S]|[^"\\])*"`
const LONG_SINGLE = String.raw`'[^']*'`
// One character between quotes, which is what tells a Rust character from a lifetime.
const CHARACTER = String.raw`'(?:\\[^'\n]+|[^'\\\n])'`
const NUMBER = String.raw`\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)\b`
// A name, and the bracket after it when it is called (`!` first for a Rust macro).
const NAME = String.raw`(?<word>[A-Za-z_]\w*)(?<call>!?[ \t]*\()?`

const MEMBER = { before: '.$', after: '' }
const ARGUMENT = { before: '-./$', after: '-./=' }

const group = (name: string, sources: readonly string[] | undefined) =>
  sources === undefined || sources.length === 0 ? [] : [`(?<${name}>${sources.join('|')})`]

const words = (list: string | undefined) => new Set(list?.split(' ') ?? [])

const grammar = ({ comments, properties, strings, variables, keywords, constants, joins, isCaseless }: Language): Grammar => ({
  pattern: new RegExp(
    [
      ...group('comment', comments),
      ...group('property', properties),
      ...group('string', strings),
      ...group('variable', variables),
      `(?<number>${NUMBER})`,
      NAME,
    ].join('|'),
    'gm',
  ),
  keywords: words(keywords),
  constants: words(constants),
  joins: joins ?? MEMBER,
  isCaseless: isCaseless === true,
})

const SCRIPT = grammar({
  comments: [SLASHES, BLOCK],
  strings: [DOUBLE, SINGLE, TEMPLATE],
  keywords:
    'as async await break case catch class const continue debugger declare default delete do else enum export extends finally for from function if implements import in instanceof interface keyof let namespace new of private protected public readonly return satisfies static super switch this throw try type typeof var void while yield',
  constants: 'true false null undefined NaN Infinity',
})

const GO = grammar({
  comments: [SLASHES, BLOCK],
  strings: [DOUBLE, SINGLE, RAW],
  keywords:
    'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var',
  constants: 'true false nil iota',
})

const RUST = grammar({
  comments: [SLASHES, BLOCK],
  strings: [LONG_DOUBLE, CHARACTER],
  keywords:
    'as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while',
  constants: 'true false None Some Ok Err',
})

const PYTHON = grammar({
  comments: [String.raw`#[^\n]*`],
  strings: [TRIPLE, DOUBLE, SINGLE],
  keywords:
    'and as assert async await break case class continue def del elif else except finally for from global if import in is lambda match nonlocal not or pass raise return self try while with yield',
  constants: 'True False None',
})

const SHELL = grammar({
  comments: [HASH],
  strings: [LONG_DOUBLE, LONG_SINGLE],
  variables: [String.raw`\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9@#?*!$-]`],
  keywords:
    'alias case declare do done elif else esac exit export fi for function if in local readonly return set source then unset until while',
  joins: ARGUMENT,
})

const JSON_LIKE = grammar({
  comments: [SLASHES, BLOCK],
  properties: [String.raw`"(?:\\.|[^"\\\n])*"(?=[ \t]*:)`],
  strings: [DOUBLE],
  constants: 'true false null',
})

const YAML = grammar({
  comments: [HASH],
  properties: [String.raw`(?<=^[ \t]*(?:-[ \t]+)*)[\w.-]+(?=[ \t]*:(?:[ \t]|$))`],
  strings: [DOUBLE, SINGLE],
  constants: 'true false null',
  joins: ARGUMENT,
})

const TOML = grammar({
  comments: [HASH],
  properties: [String.raw`(?<=^[ \t]*)[\w.-]+(?=[ \t]*=)`],
  strings: [TRIPLE, DOUBLE, SINGLE],
  constants: 'true false',
  joins: ARGUMENT,
})

const SQL = grammar({
  comments: [DASHES, BLOCK],
  strings: [LONG_SINGLE, DOUBLE],
  keywords:
    'all alter and as asc begin between by case commit create cross delete desc distinct drop else end exists foreign from full group having in index inner insert into is join key left like limit not offset on or order outer primary references returning right rollback select set table then union update values view when where with',
  constants: 'true false null',
  isCaseless: true,
})

const RUBY = grammar({
  comments: [HASH],
  strings: [DOUBLE, SINGLE],
  keywords:
    'alias and begin break case class def do else elsif end ensure for if in module next not or redo require rescue retry return self super then undef unless until when while yield',
  constants: 'true false nil',
})

const LUA = grammar({
  comments: [DASHES],
  strings: [DOUBLE, SINGLE],
  keywords: 'and break do else elseif end for function goto if in local not or repeat return then until while',
  constants: 'true false nil',
})

// C and what is written like it: one list of the words those languages share.
const BRACES = grammar({
  comments: [SLASHES, BLOCK],
  strings: [DOUBLE, SINGLE],
  keywords:
    'abstract auto bool break case catch char class const continue default do double else enum extends final finally float for fun func if implements import in int interface let long namespace new override package private protected public return short signed sizeof static struct super switch template this throw throws try typedef typename unsigned using val var virtual void volatile while',
  constants: 'true false null nullptr nil NULL',
})

// The names a fence gives a language, each to the grammar that reads it.
const GRAMMARS: Record<string, Grammar> = {
  ts: SCRIPT,
  tsx: SCRIPT,
  typescript: SCRIPT,
  js: SCRIPT,
  jsx: SCRIPT,
  javascript: SCRIPT,
  mjs: SCRIPT,
  cjs: SCRIPT,
  go: GO,
  golang: GO,
  rs: RUST,
  rust: RUST,
  py: PYTHON,
  python: PYTHON,
  sh: SHELL,
  bash: SHELL,
  zsh: SHELL,
  shell: SHELL,
  console: SHELL,
  json: JSON_LIKE,
  jsonc: JSON_LIKE,
  json5: JSON_LIKE,
  yaml: YAML,
  yml: YAML,
  toml: TOML,
  sql: SQL,
  rb: RUBY,
  ruby: RUBY,
  lua: LUA,
  c: BRACES,
  h: BRACES,
  cpp: BRACES,
  'c++': BRACES,
  cc: BRACES,
  java: BRACES,
  cs: BRACES,
  csharp: BRACES,
  kt: BRACES,
  kotlin: BRACES,
  swift: BRACES,
  php: BRACES,
  dart: BRACES,
  scala: BRACES,
}

const touches = (characters: string, neighbor: string) => neighbor !== '' && characters.includes(neighbor)

const named = (known: Grammar, word: string, isJoined: boolean, isCalled: boolean): TokenKind | null => {
  const name = known.isCaseless ? word.toLowerCase() : word

  if (!isJoined && known.keywords.has(name)) {
    return 'keyword'
  }

  if (!isJoined && known.constants.has(name)) {
    return 'constant'
  }

  return isCalled ? 'call' : null
}

// The tokens of `source` in `language`, a fence's name for it; none for a language not known here.
export const lex = (source: string, language: string): Token[] => {
  const known = GRAMMARS[language.toLowerCase()]

  if (known === undefined) {
    return []
  }

  return [...source.matchAll(known.pattern)].flatMap((match): Token[] => {
    const { comment, property, string, variable, number, word, call } = match.groups ?? {}
    const start = match.index
    const whole = (kind: TokenKind) => [{ start, end: start + match[0].length, kind }]

    if (comment !== undefined) {
      return whole('comment')
    }

    if (property !== undefined) {
      return whole('property')
    }

    if (string !== undefined) {
      return whole('string')
    }

    if (variable !== undefined) {
      return whole('constant')
    }

    if (number !== undefined) {
      return whole('number')
    }

    if (word === undefined) {
      return []
    }

    const end = start + word.length
    const isJoined = touches(known.joins.before, source.charAt(start - 1)) || touches(known.joins.after, source.charAt(end))
    const kind = named(known, word, isJoined, call !== undefined)

    return kind === null ? [] : [{ start, end, kind }]
  })
}
