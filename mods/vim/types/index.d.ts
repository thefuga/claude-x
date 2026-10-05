// What the command line said last: a command's answer, or why it would not run.
export type Echo = { text: string; isWarning: boolean }

// The command line's field: how many were taken down before it, which is what the one drawn now is
// keyed by, whether it is left undrawn for the moment, and the text it was last drawn holding (a
// completion taken into it).
export type FieldState = { drawn: number; isDown: boolean; value: string }

// A command the line can complete to, and what the menu says of it.
export type MenuItem = { name: string; description: string }

// The completions on show: a window of them, the one picked in it, and how many there are in all.
export type Menu = { items: MenuItem[]; picked: number; total: number }

// These outlive a reload of the mod, so a value whose shape changes takes a new key. The statusline
// mod reads `command`, `echo` and `menu` to draw the line in its bar.
declare module 'claude-code' {
  interface PluginState {
    vim: {
      // What is typed in the command line while it is open, and what it said last.
      command: string | null
      echo: Echo | null
      commandField: FieldState
      menu: Menu | null
    }
  }
}
