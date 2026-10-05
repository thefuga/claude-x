# claude-code.vim

Erick Fuga's Claude Code mods, as a plugin marketplace. Each mod is its own plugin under `mods/`,
installed and turned on or off by itself.

| Mod | What it does |
| --- | --- |
| [statusline](mods/statusline) | A vim-style status bar in the footer: editor mode, permission mode, model, effort, git state, usage and cursor. Numbers the draft's lines and keeps the prompt box taller (`minLines`, `/expand`). |
| [syntax](mods/syntax) | Colors the draft as it is typed: its markdown, the code in its fences, and in shell mode the command. |
| [vim](mods/vim) | A vim command line: `:w` and `:e` keep a draft per session, `:q` quits, any other name runs that slash command, with Tab completion. Drawn in statusline's bar. |

They work alone, and better together: `vim` draws its line in `statusline`'s bar, and `syntax`
reads the editor's mode from `statusline` to color a shell command. A mod reads another's state
and never writes it, so none of them depends on another being installed.

## Install

```sh
claude plugin marketplace add thefuga/claude-code.vim
claude plugin install statusline@claude-code-vim
claude plugin install syntax@claude-code-vim
claude plugin install vim@claude-code-vim
```

`claude plugin marketplace update claude-code-vim` takes up new versions.

## Work on them

Load the folders straight from a clone, with every change reloaded in every open session, by
naming them in `~/.claude/settings.json` (separated by `:`):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "/path/to/claude-code.vim/mods/statusline:/path/to/claude-code.vim/mods/syntax:/path/to/claude-code.vim/mods/vim"
  }
}
```

Loaded that way a mod is `<name>@inline`, which is what its options are kept under in
`pluginConfigs`. Claude Code writes its API types to each mod's `.claude-plugin/types/` when it
loads it, which the mod's `tsconfig.json` extends. In each mod's folder:

```sh
claude plugin validate .   # what the engine will accept
tsc -p .                   # types
claude plugin test .       # tests/
```

`claude plugin validate .` at the root checks the marketplace.

Each mod keeps `hooks/register.ts(x)`, which holds the hooks and every call on `$` (the engine reads
what a mod uses off that file, so `$` cannot be passed to a function another file exports), beside
the plain modules it uses; `types/index.d.ts`, the values it keeps in `$.state` and those it reads
of another mod (they outlive a reload, so a value whose shape changes takes a new key); and
`tests/`.
