import { describe, expect, test } from 'claude-code/testing'

import {
  MARK_SLOT,
  NO_USAGE,
  ORIGIN,
  PERMISSIONS,
  PLACEHOLDER,
  UNPLACED,
  announcedEfforts,
  boxRowsOf,
  draftOf,
  editorMode,
  effortLevel,
  fitBlock,
  fitLeft,
  fitRight,
  fitTabRow,
  formatTokens,
  gutterLabel,
  isBelieved,
  isInserting,
  lineOf,
  locate,
  minRowsOf,
  modelName,
  permissionOf,
  pickTitle,
  placeholderOf,
  providerName,
  readingOf,
  rowCap,
  sharesMark,
  standsIn,
  transcriptPath,
  truncate,
  tuningOf,
  verdictsOf,
  windowStart,
} from '../hooks/statusline/format'

const USAGE = { tokens: 19_700, percent: 2, usd: 0.13 }
const PLACED = { rows: 2, under: 0, isAligned: true, isPlaced: true }
const OPEN = { text: null, isDim: false, fillFrom: null, gap: null }
// Two rows, the cursor at the end of the second, the engine painting the text.
const DRAFT = draftOf('fix the\nstatus line', 19, true)
// At 120 columns the engine leaves the measuring strip 101 cells beside its mark for auto mode.
const AUTO = { columns: 101, of: 120 }
const BLOCK = {
  columns: 120,
  height: 40,
  hint: '',
  mode: 'INSERT',
  model: 'claude-opus-5-5[1m]',
  effort: 'max',
  draft: DRAFT,
  box: PLACED,
  suggestion: null,
  reading: AUTO,
  title: 'Update Claude Code mods',
  usage: USAGE,
  isFilled: true,
  isNumbered: true,
  minRows: 1,
  isRelabelled: true,
  isBelieved: true,
  command: null,
  echo: null,
}
const rowsOf = (block: Parameters<typeof fitBlock>[0]) => fitBlock(block).rows ?? []

describe('format', () => {
  test('names a model from its id', () => {
    expect(modelName('claude-opus-5-5[1m]')).toBe('Claude Opus 5.5')
    expect(modelName('claude-haiku-4-5-20251001')).toBe('Claude Haiku 4.5')
    expect(modelName('claude-sonnet-4-20250514')).toBe('Claude Sonnet 4')
    expect(modelName('us.anthropic.claude-opus-4-1-20250805-v1:0')).toBe('Claude Opus 4.1')
    expect(modelName('claude-3-5-sonnet-20241022')).toBe('Claude 3.5 Sonnet')
    expect(modelName('claude-opus-5-5[1m]', true)).toBe('Opus 5.5')
    expect(modelName('gateway-deployment[1m]')).toBe('gateway-deployment')
  })

  test('names the provider an id is spelled for', () => {
    expect(providerName('claude-opus-5-5[1m]')).toBe('Anthropic')
    expect(providerName('us.anthropic.claude-opus-4-1-20250805-v1:0')).toBe('Bedrock')
    expect(providerName('claude-opus-4-1@20250805')).toBe('Vertex AI')
  })

  test('takes only the levels Claude Code has as an effort', () => {
    expect(effortLevel(' MAX ')).toBe('max')
    expect(effortLevel('auto')).toBe(null)
    expect(effortLevel(undefined)).toBe(null)
    expect(
      announcedEfforts(
        [
          '"content":"<local-command-stdout>Set effort level to high',
          '"content":"<local-command-stdout>Set effort level to auto',
          '"content":"<local-command-stdout>Set effort level to max',
          '',
        ].join('\n'),
      ),
    ).toEqual(['high', 'max'])
  })

  test('counts tokens as the status line reads', () => {
    expect(formatTokens(842)).toBe('842')
    expect(formatTokens(19_700)).toBe('19.7K')
    expect(formatTokens(999_949)).toBe('999.9K')
    expect(formatTokens(1_200_000)).toBe('1.2M')
  })

  test('locates the cursor by line and column', () => {
    expect(locate('', 0)).toEqual({ line: 1, column: 1, percent: 100 })
    expect(locate('abc def', 3)).toEqual({ line: 1, column: 4, percent: 100 })
    expect(locate('abc def\nline2', 5)).toEqual({ line: 1, column: 6, percent: 50 })
    expect(locate('abc def\nline2\n', 14)).toEqual({ line: 3, column: 1, percent: 100 })
    expect(locate('añ🙂b', 4)).toEqual({ line: 1, column: 4, percent: 100 })
  })

  test('keeps the draft with its cursor, unless it is too long to lay out', () => {
    expect(draftOf('', 0, false)).toEqual(ORIGIN)
    expect(DRAFT).toEqual({ line: 2, column: 12, percent: 100, text: 'fix the\nstatus line', offset: 19, isDecorated: true })
    expect(draftOf('x'.repeat(9000), 9000, true)).toMatchObject({ column: 9001, text: null })
  })

  test('reads the rows of the box off the room the band above it is left', () => {
    expect(boxRowsOf(40, 14, 0)).toBe(1)
    expect(boxRowsOf(40, 10, 0)).toBe(5)
    expect(boxRowsOf(40, 9, 1), 'a row pinned under the box').toBe(5)
    expect(boxRowsOf(30, 0, 0), 'a band left no rows: the taller of the two it may mean').toBe(10)
    expect(boxRowsOf(14, 2, 0), 'too small a screen to tell').toBe(null)
    expect([rowCap(45, 0), rowCap(30, 0), rowCap(30, 1), rowCap(14, 0)]).toEqual([17, 10, 9, 3])
  })

  // At 24 rows the box is at its tallest with seven rows, and the band is left none from there on.
  test('tells whether a draft stands in the rows the engine draws', () => {
    expect([1, 2, 3, 4, 5, 6].map(rows => standsIn(24, 7 - rows, 0, rows))).toEqual([true, true, true, true, true, true])
    expect(standsIn(24, 0, 0, 7), 'at its tallest').toBe(true)
    expect(standsIn(24, 0, 0, 9), 'scrolled').toBe(true)
    expect(standsIn(24, 0, 0, 5)).toBe(false)
    expect(standsIn(24, 5, 0, 1), 'a row the layout here knows nothing of').toBe(false)
    expect(standsIn(14, 0, 0, 3)).toBe(false)
  })

  test('reads the editor mode off the hint', () => {
    expect(editorMode('? for shortcuts', false)).toBe('INSERT')
    expect(editorMode('', true)).toBe('NORMAL')
    expect(editorMode('-- INSERT -- ← for agents', true)).toBe('INSERT')
    expect(editorMode('-- VISUAL LINE --', true)).toBe('VISUAL LINE')
    expect(editorMode('! for shell mode', false)).toBe('SHELL')
  })

  test('reads shell mode after the marker of the vim editor', () => {
    expect(editorMode('-- INSERT -- ! for shell mode', true)).toBe('SHELL')
    expect(editorMode('! for shell mode', true)).toBe('SHELL NORMAL')
    expect(editorMode('-- VISUAL -- ! for shell mode', true)).toBe('SHELL VISUAL')
    expect(['INSERT', 'SHELL', 'NORMAL', 'SHELL NORMAL', 'VISUAL LINE'].map(isInserting)).toEqual([true, true, false, false, false])
  })

  test('picks the session title: the given name over the generated one, the last of each', () => {
    const generated = '{"type":"ai-title","aiTitle":"First guess","sessionId":"s"}'
    const regenerated = '{"type":"ai-title","aiTitle":"Update Claude Code mods","sessionId":"s"}'
    const given = '{"type":"custom-title","customTitle":"Status line","sessionId":"s"}'

    expect(pickTitle('')).toBe(null)
    expect(pickTitle('not json\n')).toBe(null)
    expect(pickTitle([generated, regenerated, ''].join('\n'))).toBe('Update Claude Code mods')
    expect(pickTitle([generated, given, regenerated].join('\n'))).toBe('Status line')
  })

  test('truncates on a glyph and marks the cut', () => {
    expect(truncate('Update Claude Code mods', 24)).toBe('Update Claude Code mods')
    expect(truncate('Update Claude Code mods', 17)).toBe('Update Claude Co…')
    expect(truncate('Update Claude 🙂🙂🙂', 15)).toBe('Update Claude…')
  })

  test('spells where a transcript is kept', () => {
    expect(transcriptPath('/home/me/.claude', '/home/me/git-repos/open-claude', 'abc')).toBe(
      '/home/me/.claude/projects/-home-me-git-repos-open-claude/abc.jsonl',
    )
  })

  test('drops what does not fit, the provider first', () => {
    const facts = { mode: 'NORMAL', model: 'claude-opus-5-5[1m]', effort: 'max', title: 'Update Claude Code mods' }
    const wide = { mode: 'NORMAL', permission: '', model: 'Claude Opus 5.5', provider: 'Anthropic', effort: 'max' }

    expect(fitLeft({ ...facts, columns: 170 })).toEqual({ ...wide, title: 'Update Claude Code mods' })
    expect(fitLeft({ ...facts, columns: 84 })).toEqual({ ...wide, provider: '', title: 'Update Claude Code mods' })
    expect(fitLeft({ ...facts, columns: 66 })).toMatchObject({ model: 'Opus 5.5', provider: '', effort: 'max' })
    expect(fitLeft({ ...facts, columns: 48 })).toMatchObject({ model: 'Opus 5.5', effort: '', title: 'Update Claude…' })
    expect(fitLeft({ ...facts, columns: 36 })).toMatchObject({ model: '', effort: '', title: 'Update…' })
  })

  test('shows no model, effort or title it does not know', () => {
    expect(fitLeft({ columns: 170, mode: 'INSERT', model: '', effort: null, title: null })).toEqual({
      mode: 'INSERT',
      permission: '',
      model: '',
      provider: '',
      effort: '',
      title: 'New session',
    })
  })

  test('shortens the cursor and usage with the width', () => {
    const cursor = { line: 2, column: 7, percent: 67 }
    const usage = { tokens: 19_700, percent: 2, usd: 0.13 }

    expect(fitRight(170, [], cursor, usage)).toEqual({ cursor: 'Ln 2, Col 7 · 67%', usage: '19.7K (2%) · $0.13' })
    expect(fitRight(170, ['focus', 'memory paused'], cursor, usage).cursor).toBe(
      'focus & memory paused · Ln 2, Col 7 · 67%',
    )
    expect(fitRight(90, ['focus'], cursor, usage).cursor).toBe('Ln 2, Col 7 · 67%')
    expect(fitRight(70, [], cursor, usage)).toEqual({ cursor: '2:7 · 67%', usage: '19.7K (2%)' })
    expect(fitRight(46, [], cursor, usage)).toEqual({ cursor: '2:7', usage: '2%' })
    expect(fitRight(170, [], ORIGIN, NO_USAGE).usage).toBe('0 (0%)')
  })

  // What the strip was seen to be left beside each mark, at the widths the mod asks for no more room.
  test('reads the permission mode off the cells the strip is left', () => {
    expect([151, 149, 147].map(columns => permissionOf(170, { columns, of: 170 })?.label)).toEqual(['Plan', 'Manual', 'Accept edits'])
    expect([82, 80].map(columns => permissionOf(100, { columns, of: 100 })?.mode)).toEqual(['plan', 'default'])
    expect(permissionOf(120, AUTO)).toMatchObject({ mode: 'auto', label: 'Auto', cells: 15 })
    expect(permissionOf(170, { columns: 140, of: 170 }), 'a mark of no mode known').toBe(null)
    expect(permissionOf(170, AUTO), 'a strip laid out for another width').toBe(null)
    expect(permissionOf(170, null)).toBe(null)
  })

  test('asks for the room that leaves every mark cells of its own, at every width', () => {
    const widths = Array.from({ length: 337 }, (_, index) => 64 + index)
    const told = (columns: number) =>
      Array.from({ length: columns }, (_, strip) => permissionOf(columns, { columns: strip, of: columns })?.mode ?? []).flat()

    expect([tuningOf(100), tuningOf(170), tuningOf(120), tuningOf(65)]).toEqual([0, 0, 4, 5])
    expect(widths.filter(columns => told(columns).join() !== PERMISSIONS.map(({ mode }) => mode).reverse().join())).toEqual([])
  })

  test('takes a posting of the strip for what it is', () => {
    expect(readingOf({ columns: 101, of: 120 })).toEqual(AUTO)
    expect(readingOf({ columns: '101', of: 120 })).toBe(null)
    expect(readingOf(null)).toBe(null)
    expect(readingOf('101/120')).toBe(null)
  })

  test('believes the label on a version it was checked on, or one it has read right on', () => {
    const verdicts = verdictsOf({ '2.1.287': false, '2.2.0': true, '2.3.0': 'yes' })

    expect(verdicts).toEqual({ '2.1.287': false, '2.2.0': true })
    expect(verdictsOf(undefined)).toEqual({})
    expect([isBelieved('2.1.287', {}), isBelieved('2.2.0', {}), isBelieved('2.2.0', verdicts), isBelieved('2.1.287', verdicts)]).toEqual([
      true,
      false,
      true,
      false,
    ])
    expect([sharesMark('auto', 'dontAsk'), sharesMark('auto', 'plan')]).toEqual([true, false])
  })

  test('fits the bar to the whole width, with a copy of the mark the strip measured for the row under it', () => {
    expect(fitBlock({ ...BLOCK, mode: 'NORMAL' })).toMatchObject({
      columns: 120,
      tuning: 4,
      bar: { mode: 'NORMAL', permission: '', model: 'Claude Opus 5.5', provider: 'Anthropic', effort: 'max', cursor: 'Ln 2, Col 12 · 100%' },
      slot: 0,
      mark: '⏵⏵ auto mode on',
      label: 'Auto',
      usage: '19.7K (2%) · $0.13',
      isMeasured: true,
      read: 'auto',
    })
  })

  test("leaves the engine's own mark a slot where the mode is not known for sure", () => {
    const slotted = { mark: '', slot: MARK_SLOT }

    expect(fitBlock({ ...BLOCK, reading: null })).toMatchObject({ ...slotted, read: null })
    expect(fitBlock({ ...BLOCK, reading: { columns: 90, of: 120 } }), 'a mark of no mode known').toMatchObject(slotted)
    expect(fitBlock({ ...BLOCK, isBelieved: false }), 'a version the label has yet to read right on').toMatchObject({
      ...slotted,
      read: 'auto',
    })
    expect(fitBlock({ ...BLOCK, hint: '? for shortcuts · ← for agents' }), 'a line only the manual mode has').toMatchObject(slotted)
    expect(fitBlock({ ...BLOCK, reading: { columns: 100, of: 120 }, hint: '(shift+tab to cycle)' }), 'a key no manual mode names').toMatchObject(
      slotted,
    )
    expect(fitBlock({ ...BLOCK, reading: { columns: 100, of: 120 }, hint: '? for shortcuts' }).mark).toBe('⏸ manual mode on')
  })

  test('fills each row of the draft from the end of its text, leaving the cursor its cell', () => {
    expect(rowsOf(BLOCK)).toEqual([
      { text: null, isDim: false, fillFrom: 7, gap: null },
      { text: null, isDim: false, fillFrom: 11, gap: 11 },
    ])
    expect(rowsOf({ ...BLOCK, draft: draftOf('fix the   ', 10, true), box: { ...PLACED, rows: 1 } })).toEqual([
      { text: null, isDim: false, fillFrom: 7, gap: 10 },
    ])
  })

  test('draws the text itself where the engine no longer colors it', () => {
    const plain = { ...DRAFT, isDecorated: false }

    expect(rowsOf({ ...BLOCK, draft: plain }).map(row => row.text)).toEqual(['fix the', 'status line'])
    expect(rowsOf({ ...BLOCK, mode: 'NORMAL', draft: { ...DRAFT, offset: 8 } })[1]).toEqual({
      text: 'status line',
      isDim: false,
      fillFrom: 11,
      gap: null,
    })
    expect(rowsOf({ ...BLOCK, mode: 'SHELL NORMAL' }).map(row => row.text)).toEqual(['fix the', 'status line'])
    expect(rowsOf({ ...BLOCK, mode: 'VISUAL', draft: plain }).map(row => row.text)).toEqual([null, null])
    expect(rowsOf({ ...BLOCK, mode: 'SHELL VISUAL', draft: plain }).map(row => row.text)).toEqual([null, null])
  })

  test('draws the empty box whole, with what the engine offers in it', () => {
    const empty = { ...BLOCK, draft: ORIGIN, box: { ...PLACED, rows: 1 } }

    expect(rowsOf(empty)).toEqual([{ text: PLACEHOLDER, isDim: true, fillFrom: PLACEHOLDER.length, gap: null }])
    expect(rowsOf({ ...empty, suggestion: 'run the tests' })[0]).toMatchObject({ text: 'run the tests', fillFrom: 13 })
    expect(rowsOf({ ...empty, suggestion: 'run the tests 🙂' })[0]?.text, 'cells that cannot be counted').toBe(PLACEHOLDER)
    expect(rowsOf({ ...empty, columns: 64, reading: null })[0]?.text).toBe(truncate(PLACEHOLDER, 60))
    expect(rowsOf({ ...empty, mode: 'NORMAL' })[0]?.text, 'the keys of the mode it is in').toBe('Ask anything…  (i insert)')
    expect(rowsOf({ ...empty, mode: 'SHELL', suggestion: 'run the tests' })[0]?.text).toBe(
      'Run a shell command…  (backspace leaves shell mode)',
    )
    expect(placeholderOf('SHELL NORMAL')).toBe('Run a shell command…  (i insert)')
    expect(PLACEHOLDER).toBe('Ask anything…  (? shortcuts · / commands · @ files)')
  })

  test('fills nothing it is not sure of', () => {
    const tall = draftOf(Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n'), 0, true)
    const odd = draftOf('ok 🙂\nyes', 0, true)

    expect(rowsOf({ ...BLOCK, box: { ...PLACED, isAligned: false } }), 'rows the engine does not agree on').toEqual([OPEN, OPEN])
    expect(rowsOf({ ...BLOCK, draft: odd, box: { ...PLACED, isAligned: false } }), 'an emoji').toEqual([OPEN, OPEN])
    expect(rowsOf({ ...BLOCK, height: 30, draft: tall, box: { ...PLACED, rows: 10 } }), 'a scrolled box').toEqual(
      Array.from({ length: 10 }, () => OPEN),
    )
    expect(rowsOf({ ...BLOCK, isFilled: false }), 'the option off').toEqual([OPEN, OPEN])
  })

  test('counts the rows the engine draws when it counts more, and stands above rows pinned under the box', () => {
    expect(rowsOf({ ...BLOCK, box: { ...PLACED, rows: 3, isAligned: false } })).toHaveLength(3)
    expect(fitBlock({ ...BLOCK, box: { ...PLACED, under: 2 } }).under).toBe(2)
  })

  test('leaves the prompt box alone where the rows around it are not the known ones', () => {
    const unplaced = fitBlock({ ...BLOCK, box: { ...PLACED, isPlaced: false } })

    expect(unplaced.rows).toBe(null)
    expect(unplaced.bar).toMatchObject({ mode: 'INSERT', cursor: 'Ln 2, Col 12 · 100%' })
  })

  test("numbers each row of the box that starts a line, the cursor's line apart", () => {
    // At 64 columns a row of the box takes 60 cells: the first line here takes two rows.
    const wrapped = draftOf(`${'word '.repeat(13)}\nnext`, 0, false)

    expect(fitBlock(BLOCK).numbers).toEqual([
      { label: '1 ', isCurrent: false },
      { label: '2 ', isCurrent: true },
    ])
    expect(fitBlock({ ...BLOCK, columns: 64, draft: wrapped }).numbers).toEqual([
      { label: '1 ', isCurrent: true },
      null,
      { label: '2 ', isCurrent: false },
    ])
    expect(fitBlock({ ...BLOCK, draft: ORIGIN }).numbers, 'the empty box has its one line').toEqual([{ label: '1 ', isCurrent: true }])
    expect(fitBlock({ ...BLOCK, box: UNPLACED }).numbers, 'before the rows were ever checked').toHaveLength(2)
  })

  test('fits a number to the two cells of the gutter', () => {
    expect([1, 9, 10, 99, 100, 105, 1234].map(gutterLabel)).toEqual(['1 ', '9 ', '10', '99', '00', '05', '34'])
  })

  // At 30 rows of screen the box shows ten rows of a draft and keeps the cursor's in the middle.
  test('numbers the rows a box too short for its draft shows', () => {
    const lines = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n')
    const labels = (offset: number) =>
      fitBlock({ ...BLOCK, height: 30, draft: draftOf(lines, offset, false) }).numbers?.map(number => number?.label)

    expect(labels(0)).toEqual(['1 ', '2 ', '3 ', '4 ', '5 ', '6 ', '7 ', '8 ', '9 ', '10'])
    expect(labels(lines.indexOf('line 10'))).toEqual(['5 ', '6 ', '7 ', '8 ', '9 ', '10', '11', '12', '13', '14'])
    expect(labels(lines.length)).toEqual(['11', '12', '13', '14', '15', '16', '17', '18', '19', '20'])
    expect([windowStart(0, 20, 10), windowStart(9, 20, 10), windowStart(19, 20, 10), windowStart(3, 8, 10)]).toEqual([0, 4, 10, 0])
  })

  test('numbers nothing it is not sure of', () => {
    const counted = (rows: number) => fitBlock({ ...BLOCK, box: { ...PLACED, rows, isAligned: false } }).numbers

    expect(fitBlock({ ...BLOCK, isNumbered: false }).numbers, 'the option off, or a box that does not stand plain').toBe(null)
    expect(fitBlock({ ...BLOCK, draft: draftOf('ok 🙂\nyes', 0, false) }).numbers, 'an emoji').toBe(null)
    expect(fitBlock({ ...BLOCK, draft: draftOf('x'.repeat(9000), 0, false) }).numbers, 'a draft too long to lay out').toBe(null)
    expect(counted(1), 'the engine has room for fewer rows than were laid out').toBe(null)
    expect(counted(5), 'room taken by what else stands under the prompt').toHaveLength(2)
  })

  // At 40 rows of screen the box shows fifteen rows at most; at 16, three.
  test('pads a box that is to stand taller than its draft', () => {
    const tall = draftOf(Array.from({ length: 6 }, (_, index) => `line ${index + 1}`).join('\n'), 0, false)
    const padded = { ...BLOCK, minRows: 5 }

    expect(fitBlock(BLOCK).pad, 'nothing asked for').toBe(0)
    expect(fitBlock(padded).pad, 'two rows of draft').toBe(3)
    expect(fitBlock({ ...padded, draft: ORIGIN }).pad).toBe(4)
    expect(fitBlock({ ...padded, draft: tall }).pad, 'a draft past the least').toBe(0)
    expect(fitBlock({ ...padded, height: 16 }).pad, 'no taller than the box may grow').toBe(1)
    expect(fitBlock({ ...padded, reading: null }).pad, "the engine's mark would stand in the rows added").toBe(0)
    expect(fitBlock({ ...padded, box: { ...PLACED, under: 1 } }).pad, "another plugin's row under the box").toBe(0)
    expect(fitBlock({ ...padded, draft: draftOf('ok 🙂', 0, false) }).pad, 'rows that cannot be counted').toBe(0)
    expect([5, 5.8, 0, -3, '5', undefined].map(minRowsOf)).toEqual([5, 5, 1, 1, 1, 1])
  })

  test('fits the tab row: the tab at one end, the usage at the other', () => {
    expect(fitTabRow(120, 'Update Claude Code mods', [], USAGE)).toEqual({
      columns: 120,
      title: 'Update Claude Code mods',
      note: '19.7K (2%) · $0.13',
    })
    expect(fitTabRow(120, null, ['focus', 'memory paused'], USAGE)).toMatchObject({
      title: 'New session',
      note: 'focus & memory paused · 19.7K (2%) · $0.13',
    })
    expect(fitTabRow(100, null, ['focus'], NO_USAGE).note).toBe('0 (0%)')
    expect(fitTabRow(64, 'A session with quite a long title to it', [], USAGE).title).toBe('A session with quite a…')
  })

  test("words the footer's last row for the command line: what is typed after a colon, or the last answer", () => {
    expect(lineOf('w', null, 40)).toEqual({ text: ':w', hasCursor: true, isWarning: false })
    expect(lineOf('', { text: 'draft saved', isWarning: false }, 40), 'an open line stands over an answer').toEqual({
      text: ':',
      hasCursor: true,
      isWarning: false,
    })
    expect(lineOf(null, { text: 'unknown command: :foo', isWarning: true }, 40)).toEqual({
      text: 'unknown command: :foo',
      hasCursor: false,
      isWarning: true,
    })
    expect(lineOf(null, null, 40)).toBe(null)
    expect(lineOf('model claude-opus-5-5', null, 12)?.text, 'the end of a line too long for its room, and a cell for its cursor').toBe('…e-opus-5-5')
    expect(lineOf(null, { text: 'no write since last change', isWarning: true }, 12)?.text).toBe('no write si…')
  })

  test('gives the command line the row under the bar, up to the usage', () => {
    expect(fitBlock(BLOCK).line).toBe(null)
    expect(fitBlock({ ...BLOCK, command: 'wq' }).line).toEqual({ text: ':wq', hasCursor: true, isWarning: false })
    expect(fitBlock({ ...BLOCK, columns: 64, command: 'x'.repeat(80) }).line?.text).toHaveLength(64 - '19.7K (2%)'.length - 5)
  })
})
