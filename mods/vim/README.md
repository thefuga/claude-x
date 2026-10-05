# vim

A command line as in vim for Claude Code: `:w` and `:e` keep a draft per session, `:q` quits, and
any other name runs that slash command, with Tab completion. Its commands, their `!` and their
wording are those of [opencode.vim](https://github.com/thefuga/opencode.vim).

## Install

```sh
claude plugin marketplace add thefuga/claude-x
claude plugin install vim@claude-x
```

## Works with

- [statusline](../statusline/README.md): the line is drawn in its bar, after the mode's badge,
  with the completions just above it, so install the two together. Without it the line still
  runs commands, but nothing shows what is typed or what it answers.
- [syntax](../syntax/README.md): a draft loaded back with `:e` is colored at the next typed key.

## Opening it

Open it with Claude Code's own chord for the area above the prompt, Ctrl+X Tab, from insert or
normal mode. To open it with Ctrl+X `:` as well, bind that to the same action in
`~/.claude/keybindings.json`:

```json
{ "context": "Chat", "bindings": { "ctrl+x :": "abovePrompt:focus" } }
```

A bare `:` cannot open it. Claude Code's key bindings do not know the vim editor's mode, so the
binding would take every `:` typed in insert mode as well.

Enter runs the line and Escape leaves it; either way the keys go back to the prompt,
in the mode it was in. What a command answers stands in the same row for a few seconds.

## Commands

| Command | What it does |
| --- | --- |
| `:w` | Saves the draft. With an empty prompt, clears the saved one. |
| `:e`, `:e!` | Loads the saved draft back. Refused while the prompt has changes that were not saved; `!` drops them. |
| `:q`, `:q!` | Quits Claude Code. Refused while the draft has unsaved changes or a turn is running; `!` quits anyway, and ends the turn first. |
| `:wq`, `:x` | Saves the draft and quits. |
| `:h` | Lists these in the transcript. |
| `:<name> [args]` | Runs the slash command `/<name>`, once Claude is idle. |

`:write`, `:edit`, `:quit`, `:qa` and `:help` are the long names. `:expand` runs the statusline
mod's `/expand`, which makes the prompt box taller until the next prompt is sent.

## Completion

Tab completes a command's name, as in opencode.vim. It opens a menu, just above the line, of the
names that start with what is typed (the line's own first, then Claude Code's), and moves down it;
Shift+Tab moves up, and so do Down and Up. Typing narrows the menu. Enter takes the picked name into
the line, and the next Enter runs it. Only the name is completed, not what follows it. Escape
leaves the line, menu and all.

## Drafts

A draft belongs to its session. It is put back in the prompt when the session is opened again
(`claude --resume`, `claude -c`, `/resume`), and dropped when a prompt is sent. A session nothing
was sent in cannot be opened again, so until then its draft is kept for the folder it runs in, and
the next new session there starts with it. Nothing is saved without `:w`.

## Limits

The line is typed into a field nobody sees. A mod's field can take the keyboard in one place only,
the band above the prompt, so the field stands there in a box of no height, and what is typed in
it is drawn in the statusline mod's bar. That has its limits:

- The line is edited at its end. The field takes typing and Backspace; Left, Right, Home and End
  do nothing in it.
- After Escape the line stays for up to a fifth of a second. Claude Code raises nothing when the
  keys go back to the prompt, so the mod asks ten times a second whether the field still has them.
- A draft is the prompt's text. A pasted image, or a paste long enough to be folded, comes back as
  its placeholder.
- The menu covers the rows above the bar while it is up: the bottom of the prompt box. It has as
  many rows as there are under the box's top rule, eight at the most, so a one-row draft shows two.
- No command sends the prompt: a mod cannot press Enter.
