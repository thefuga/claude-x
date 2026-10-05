import { describe, expect, test } from 'claude-code/testing'

import { branchOf, diffstatOf, singleLine } from '../hooks/git'

describe('git', () => {
  test('reads the branch HEAD is on, or the commit it stands at', () => {
    expect(branchOf('main\n', null)).toBe('main')
    expect(branchOf('feat/footer-git\n', null)).toBe('feat/footer-git')
    expect(branchOf(null, '4DB9B98AB1C2\n')).toBe('detached@4db9b98ab1c2')
    expect(branchOf(null, null)).toBe(null)
    expect(branchOf(null, 'fatal: not a git repository\n')).toBe(null)
  })

  test('takes one clean line for a name, and nothing else', () => {
    expect(singleLine('main\r\n')).toBe('main')
    expect(singleLine('')).toBe(null)
    expect(singleLine('main\nother\n')).toBe(null)
    expect(singleLine(' main\n')).toBe(null)
    expect(singleLine('ma\u0007in\n')).toBe(null)
  })

  test('sums the lines added and deleted, a binary file counting none', () => {
    expect(diffstatOf('3\t1\tnotes.txt\n10\t0\tsrc/a.ts\n-\t-\tlogo.png\n')).toEqual({ additions: 13, deletions: 1 })
    expect(diffstatOf('2\t2\told name => new name\n')).toEqual({ additions: 2, deletions: 2 })
    expect(diffstatOf('')).toEqual({ additions: 0, deletions: 0 })
  })

  test('counts nothing where the output does not read as numstat', () => {
    expect(diffstatOf('warning: something\n')).toEqual({ additions: 0, deletions: 0 })
    expect(diffstatOf('3\t1\n')).toEqual({ additions: 0, deletions: 0 })
    expect(diffstatOf('-\t4\tbroken\n')).toEqual({ additions: 0, deletions: 0 })
  })
})
