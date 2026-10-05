// Every color is a key of Claude Code's theme, so the bar follows whatever theme is picked in
// `/theme`, light or dark. The keys are chosen for their color in the built-in themes as much as for
// their meaning.
const BADGES: Record<string, string> = {
  NORMAL: 'suggestion',
  INSERT: 'success',
  VISUAL: 'autoAccept',
  SHELL: 'bashBorder',
  COMMAND: 'warning',
}

// The permission modes, in the colors Claude Code's own mark takes for them.
const PERMISSIONS: Record<string, string> = {
  Plan: 'planMode',
  Auto: 'warning',
  'Accept edits': 'autoAccept',
  Bypass: 'error',
}

export const theme = {
  badge: { text: 'inverseText', other: 'inactive' },
  permission: 'text',
  effort: 'claude',
  // What the command line says when it will not do as asked.
  warning: 'error',
  // The branch and the lines added and deleted.
  git: { branch: 'inactive', added: 'success', deleted: 'error' },
  // The completions over the command line, and the picked one.
  menu: { background: 'userMessageBackground', text: 'text', description: 'inactive', picked: 'selectionBg', pickedText: 'text' },
}

// `VISUAL LINE` and `VISUAL BLOCK` take the color of `VISUAL`.
export const badgeColor = (mode: string) => BADGES[mode.split(' ')[0] ?? ''] ?? theme.badge.other

export const permissionColor = (label: string) => PERMISSIONS[label] ?? theme.permission
