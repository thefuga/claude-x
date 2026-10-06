// What kind of file an attachment is, as the glyph on its chip shows it. `paste` is a long paste
// folded into the draft; `unknown` a file whose name tells nothing and that is too big to look into.
// The last five are a GitHub issue or pull request the draft names with `@#N`, by its state.
export type FileType =
  | 'text'
  | 'code'
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'document'
  | 'spreadsheet'
  | 'slides'
  | 'archive'
  | 'binary'
  | 'folder'
  | 'paste'
  | 'unknown'
  | 'issue'
  | 'issue-closed'
  | 'pull'
  | 'pull-merged'
  | 'pull-closed'

// One attachment of the draft as its chip shows it: what kind it is, its path (a pasted text's name
// where there is none), the facts after it, and the placeholder or mention the × takes out of the
// draft, with where it starts.
export type Chip = { type: FileType; name: string; facts: string[]; mark: string; at: number }

// An issue the draft names with `@#N`, as the issues mod loaded it: the value this mod reads from
// that one, as it declares it.
export type IssueReference = { number: number; title: string; state: string; isPull: boolean }

// These outlive a reload of the mod, so a value whose shape changes takes a new key.
declare module 'claude-code' {
  interface PluginState {
    attachments: {
      // The draft's attachments, in the order they stand in it.
      chips: Chip[]
    }
    // Read from the issues mod, which keeps them; nothing is kept here.
    issues: {
      references: IssueReference[]
    }
  }
}
