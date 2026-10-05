// The editor's mode as the statusline mod's badge names it: `INSERT`, `NORMAL`, `SHELL`,
// `SHELL NORMAL`… In shell mode the draft is colored as a command.
export type Mode = string

// The value this mod reads from the statusline mod, as that mod declares it. Nothing is kept here.
declare module 'claude-code' {
  interface PluginState {
    statusline: {
      mode: Mode
    }
  }
}
