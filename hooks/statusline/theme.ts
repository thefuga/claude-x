// Gruvbox, as in the mock. Inside tmux Claude Code draws in 256 colors unless CLAUDE_CODE_TMUX_TRUECOLOR
// is set, so `NORMAL` is a step off #83a598 to round to a teal, and the fills are plain grays, which
// land on the gray ramp instead of the cube's reds.
const BADGES: Record<string, string> = {
  NORMAL: '#7fa598',
  INSERT: '#b8bb26',
  VISUAL: '#d3869b',
  SHELL: '#fb4934',
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
  bar: '#4e4e4e',
  tab: { text: '#ebdbb2', background: '#3a3a3a' },
}

// `VISUAL LINE` and `VISUAL BLOCK` take the color of `VISUAL`.
export const badgeColor = (mode: string) => BADGES[mode.split(' ')[0] ?? ''] ?? theme.badge.other

export const permissionColor = (label: string) => PERMISSIONS[label] ?? theme.permission
