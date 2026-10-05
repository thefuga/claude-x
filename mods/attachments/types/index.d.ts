// What kind of file an attachment is, as the glyph on its chip shows it. `paste` is a long paste
// folded into the draft; `unknown` a file whose name tells nothing and that is too big to look into.
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

// One attachment of the draft as its chip shows it: what kind it is, its path (a pasted text's name
// where there is none), the facts after it, and the placeholder or mention the × takes out of the
// draft, with where it starts.
export type Chip = { type: FileType; name: string; facts: string[]; mark: string; at: number }

// These outlive a reload of the mod, so a value whose shape changes takes a new key.
declare module 'claude-code' {
  interface PluginState {
    attachments: {
      // The draft's attachments, in the order they stand in it.
      chips: Chip[]
    }
  }
}
