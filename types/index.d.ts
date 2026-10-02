export type Cursor = { line: number; column: number; percent: number }

// The prompt box: where the cursor is, and the draft itself (`offset` is the cursor's place in it)
// unless it is too long to lay out. `isDecorated` says the engine is painting the typed text on the
// block's fill, which it does from one keystroke until the draft next changes without one.
export type Draft = Cursor & { text: string | null; offset: number; isDecorated: boolean }

// How the prompt box stands, as last checked: the rows the engine draws the draft in, the rows
// other plugins have pinned between it and the footer, whether the draft as laid out here takes
// those same rows, and whether the rows around it are the ones known of.
export type Box = { rows: number | null; under: number; isAligned: boolean; isPlaced: boolean }

// How wide the engine laid out the strip that measures the footer's first row, and the width of the
// terminal it was drawn for.
export type Reading = { columns: number; of: number }

export type Usage = { tokens: number | null; percent: number | null; usd: number | null }

// These outlive a reload of the mod, so a value whose shape changes takes a new key: `input` was
// `draft` while it held the cursor alone.
declare module 'claude-code' {
  interface PluginState {
    'open-claude': {
      input: Draft
      editor: string
      box: Box
      isBoxPlain: boolean
      pins: string[]
      suggestion: string | null
      reading: Reading | null
      isLabelBelieved: boolean
      model: string
      effort: string | null
      isVim: boolean
      title: string | null
      transcript: string | null
      usage: Usage
    }
  }
}
