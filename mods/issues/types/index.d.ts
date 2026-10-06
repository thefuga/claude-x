// One open issue as a row of the list shows it.
export type Row = { number: number; title: string; labels: string[] }

// What the list says in place of its rows: that the issues are on their way, that none answers, or
// why there are none to list.
export type Note = { text: string; isWarning: boolean }

// The list above the prompt while an `@#` reference is typed: what it is filtered by, whether its
// field holds the keys, the issues that answer, best first, and the one picked among them, how many
// are open in which repository, and a note where there are no rows.
export type List = {
  query: string
  isFocused: boolean
  rows: Row[]
  picked: number
  open: number
  repository: string | null
  note: Note | null
}

// The list's field: how many were taken down before it, which is what the one drawn now is keyed
// by, whether it is left undrawn for the moment, and the text it was last drawn holding.
export type FieldState = { drawn: number; isDown: boolean; value: string }

// An issue the draft names with `@#N`, once it is loaded: its title, its state as gh says it
// (`OPEN`, `CLOSED`, `MERGED`), and whether it is a pull request, which `gh issue view` answers for
// too. The attachments mod draws each as a chip.
export type Reference = { number: number; title: string; state: string; isPull: boolean }

// These outlive a reload of the mod, so a value whose shape changes takes a new key. The
// attachments mod reads `references`.
declare module 'claude-code' {
  interface PluginState {
    issues: {
      list: List | null
      field: FieldState
      // The issues the draft names, in the order it first names them, as far as they are loaded.
      references: Reference[]
    }
  }
}
