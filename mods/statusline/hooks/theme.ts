// Gruvbox, as in the mock. Inside tmux Claude Code draws in 256 colors unless CLAUDE_CODE_TMUX_TRUECOLOR
// is set, so `NORMAL` is a step off #83a598 to round to a teal, and the menu's background is a plain
// gray, which lands on the gray ramp instead of the cube's reds.
const BADGES: Record<string, string> = {
  NORMAL: '#7fa598',
  INSERT: '#b8bb26',
  VISUAL: '#d3869b',
  SHELL: '#fb4934',
  COMMAND: '#fabd2f',
}

// The permission modes, in the colors Claude Code's own mark takes under the mod's theme.
const PERMISSIONS: Record<string, string> = {
  Plan: '#8ec07c',
  Auto: '#fabd2f',
  'Accept edits': '#d3869b',
  Bypass: '#fb4934',
}

export const theme = {
  badge: { text: '#282828', other: '#a89984' },
  permission: '#ebdbb2',
  effort: '#fe8019',
  // What the command line says when it will not do as asked.
  warning: '#fb4934',
  // The branch and the lines added and deleted, as opencode.vim colors them.
  git: { branch: '#a89984', added: '#b8bb26', deleted: '#fb4934' },
  // The completions over the command line: a gray of the ramp, and the picked one in normal mode's teal.
  menu: { background: '#3a3a3a', text: '#ebdbb2', description: '#a89984', picked: '#7fa598', pickedText: '#282828' },
}

// `VISUAL LINE` and `VISUAL BLOCK` take the color of `VISUAL`.
export const badgeColor = (mode: string) => BADGES[mode.split(' ')[0] ?? ''] ?? theme.badge.other

export const permissionColor = (label: string) => PERMISSIONS[label] ?? theme.permission
