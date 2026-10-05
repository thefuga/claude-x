# syntax

Colors the draft in Claude Code's prompt box as it is typed, as opencode.vim does: headings,
emphasis, code spans, links, lists and quotes, and the code inside a fence by the language it
names. In shell mode the draft is a command and is colored as one; the mode is read from the
[statusline](../statusline) mod, and without it every draft is markdown.

There is no tree-sitter in a mod, so the colors come from a scanner of its own (`hooks/markdown.ts`,
`hooks/code.ts`). A draft longer than 20,000 characters is left plain.

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
