import { describe, expect, test } from 'claude-code/testing'

import { NEXT, PREVIOUS, commandOf, completionsOf, draftKey, fieldKey, isField, keptDraft } from '../hooks/commands'

const NATIVES = [
  { name: 'compact', description: 'Free up context' },
  { name: 'config', description: 'Open settings' },
  { name: 'help', description: 'Show help' },
  { name: 'Wiki', description: 'A skill' },
]
const names = (typed: string) => completionsOf(typed, NATIVES).map(({ name }) => name)

describe('commands', () => {
  test('knows vim\'s names for saving, loading and quitting, each with its `!`', () => {
    expect(commandOf('w')).toEqual({ kind: 'save' })
    expect(commandOf('write')).toEqual({ kind: 'save' })
    expect(commandOf('e')).toEqual({ kind: 'reload', isForced: false })
    expect(commandOf('edit!')).toEqual({ kind: 'reload', isForced: true })
    expect(commandOf('q')).toEqual({ kind: 'quit', isForced: false, isSaving: false })
    expect(commandOf('qa!')).toEqual({ kind: 'quit', isForced: true, isSaving: false })
    expect(commandOf('wq')).toEqual({ kind: 'quit', isForced: false, isSaving: true })
    expect(commandOf('x!')).toEqual({ kind: 'quit', isForced: true, isSaving: true })
    expect(commandOf('h')).toEqual({ kind: 'help' })
  })

  test('lets go of a colon and of the space around a line, and asks nothing of an empty one', () => {
    expect(commandOf('  :w  ')).toEqual({ kind: 'save' })
    expect(commandOf(': q!')).toEqual({ kind: 'quit', isForced: true, isSaving: false })
    expect(commandOf('')).toEqual({ kind: 'none' })
    expect(commandOf(' : ')).toEqual({ kind: 'none' })
  })

  test('takes any other name for a slash command, with what follows it as typed', () => {
    expect(commandOf('compact')).toEqual({ kind: 'other', command: 'compact', args: '' })
    expect(commandOf('model  opus  [1m]')).toEqual({ kind: 'other', command: 'model', args: 'opus  [1m]' })
    expect(commandOf('W')).toEqual({ kind: 'other', command: 'W', args: '' })
  })

  test('refuses arguments to a command of its own', () => {
    expect(commandOf('w notes.md')).toEqual({ kind: 'refused', reason: 'command does not accept arguments: :w' })
    expect(commandOf('q! now')).toEqual({ kind: 'refused', reason: 'command does not accept arguments: :q!' })
  })

  test('keeps a draft for its session, and for the folder until a prompt was sent in it', () => {
    expect(draftKey(true, 'abc', '/home/me/repo')).toBe('draft:session:abc')
    expect(draftKey(false, 'abc', '/home/me/repo')).toBe('draft:home:/home/me/repo')
    expect(keptDraft('fix the bar')).toBe('fix the bar')
    expect(keptDraft(undefined)).toBe('')
    expect(keptDraft({ text: 'old shape' })).toBe('')
  })

  test('keys each field by how many were taken down before it, apart from the elements beside it', () => {
    expect(fieldKey(0)).toBe('command:0')
    expect(isField(fieldKey(7))).toBe(true)
    expect(isField(NEXT)).toBe(false)
    expect(isField(PREVIOUS)).toBe(false)
    expect(isField('measure')).toBe(false)
    expect(isField(undefined)).toBe(false)
  })

  test("completes a name from its start, the line's own commands ahead of Claude Code's", () => {
    expect(names('co')).toEqual(['compact', 'config'])
    expect(names('w')).toEqual(['w', 'write', 'wq', 'wq!', 'Wiki'])
    expect(names(':Q')).toEqual(['q', 'quit', 'qa', 'qall', 'q!', 'quit!', 'qa!', 'qall!'])
    expect(names(''), "the line's twenty names, and Claude Code's but the one they hide").toHaveLength(23)
    expect(completionsOf('w', NATIVES)[0]).toEqual({ name: 'w', description: 'Save the draft for this session' })
  })

  test("lists no command of Claude Code's that one of the line's own names hides, and nothing past the name", () => {
    expect(names('hel')).toEqual(['help'])
    expect(completionsOf('hel', NATIVES)[0]?.description).toBe('List these commands')
    expect(names('compact ')).toEqual([])
    expect(names('model op')).toEqual([])
  })
})
