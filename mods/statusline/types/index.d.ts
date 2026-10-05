export type Cursor = { line: number; column: number; percent: number }

// The prompt box: where the cursor is, and the draft itself (`offset` is the cursor's place in it)
// unless it is too long to lay out.
export type Draft = Cursor & { text: string | null; offset: number }

// How the prompt box stands, as last checked: the rows the engine draws the draft in, the rows
// other plugins have pinned between it and the footer, and whether the draft as laid out here takes
// those same rows.
export type Box = { rows: number | null; under: number; isAligned: boolean }

// How wide the engine laid out the strip that measures the footer's first row, and the width of the
// terminal it was drawn for.
export type Reading = { columns: number; of: number }

export type Usage = { tokens: number | null; percent: number | null; usd: number | null }

// The working copy's git state: the branch HEAD is on (`detached@<commit>` on none), and the lines
// added and deleted in the tracked files since the last commit.
export type Git = { branch: string; additions: number; deletions: number }

// The vim mod's command line, as that mod declares it: what it said last, a command's answer or why
// it would not run, and the completions on show.
export type Echo = { text: string; isWarning: boolean }

// A command the line can complete to, and what the menu says of it.
export type MenuItem = { name: string; description: string }

// The completions on show: a window of them, the one picked in it, and how many there are in all.
export type Menu = { items: MenuItem[]; picked: number; total: number }

// These outlive a reload of the mod, so a value whose shape changes takes a new key: `input` was
// `draft` while it held the cursor alone.
declare module 'claude-code' {
  interface PluginState {
    statusline: {
      input: Draft
      // The editor's mode as the badge names it, which the syntax mod reads.
      mode: string
      box: Box
      isBoxPlain: boolean
      pins: string[]
      reading: Reading | null
      isLabelBelieved: boolean
      model: string
      effort: string | null
      isVim: boolean
      transcript: string | null
      usage: Usage
      git: Git | null
      // Whether `:expand` stands the box at its expanded height.
      isExpanded: boolean
    }
    // Read where the vim mod is installed; only that mod writes them.
    vim: {
      command: string | null
      echo: Echo | null
      menu: Menu | null
    }
  }
}
