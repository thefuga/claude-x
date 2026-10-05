# syntax

Colors the draft in Claude Code's prompt box as it is typed, as opencode.vim does: headings,
emphasis, code spans, links, lists and quotes, and the code inside a fence by the language it
names. In shell mode the draft is a command and is colored as one.

The colors are Claude Code's own theme colors, so they follow whatever `/theme` picks, light or
dark.

There is no tree-sitter in a mod, so the colors come from a scanner of its own (`hooks/markdown.ts`,
`hooks/code.ts`). A draft longer than 20,000 characters is left plain.

## Install

```sh
claude plugin marketplace add thefuga/claude-x
claude plugin install syntax@claude-x
```

It has no options: disable it (`claude plugin disable syntax@claude-x`) to leave the draft plain.

## Works with

- [statusline](../statusline/README.md): the editor's mode is read from it, which is how a shell
  command is told from markdown. Without it every draft is markdown.
- [vim](../vim/README.md): a draft it loads back with `:e` is colored at the next typed key.

## Known issues

### The draft's colors blink off

The colors
disappear from the whole draft when its text changes by anything other than a typed key, and come
back at the next typed character. The text itself is never touched.

It happens on:

- a new line from a key bound to `chat:newline` in `~/.claude/keybindings.json`, such as an Enter
  rebound to add a line instead of sending;
- an edit in the vim editor's normal mode: `x`, `dd`, `p`, `u`;
- a history recall or a completion;
- a draft the vim mod loads back with `:e`.

Typing, pasting, backspace, moving the cursor and a visual selection keep the colors. So does a new
line from Ctrl+J, in a terminal that sends it as a plain line feed.

Claude Code lets a mod paint the draft only in its answer to `prompt.edit`, which it raises for the
keys its text field handles itself. The cases above change the draft without raising it, and Claude
Code drops the colors it held for the old text. The mod cannot paint again on its own: the one call
that paints a whole draft (`$.prompt.fill` with `replace`) also moves the cursor to the draft's end,
and can overwrite a character typed in the meantime. Seen on Claude Code 2.1.288; the fix is the
engine's to make.
