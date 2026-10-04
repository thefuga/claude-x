# open-claude

A Claude Code mod that puts a vim-style status line under the prompt box, numbers the draft's lines,
colors its markdown, and adds a `:` command line.

```
──────────────────────────────────────────────────────────────────────────────────────────
1 Refactor the status line
2 and add tests
──────────────────────────────────────────────────────────────────────────────────────────
 NORMAL  Auto · Claude Opus 5.5 · max     main +94 -64  19.7K (2%) · $0.13  Ln 2, Col 13 · 100%

```

The prompt box stays as Claude Code draws it. The bar takes the footer's first row, over Claude
Code's own permission mark, which it names after the badge; a blank row under it keeps it off the
screen's last row.

## Run it

```sh
claude --plugin-dir .
```

Claude Code watches the folder and reloads the mod on every save. It also writes its API types to
`.claude-plugin/types/`, which `tsconfig.json` extends.

```sh
claude plugin validate .   # what the engine will accept
tsc -p .                   # types
claude plugin test .       # tests/
```

## Getting the look

- **Fullscreen renderer** (`/tui fullscreen`). Only there can a mod draw outside its own rows. Under
  the default renderer, or below 64 columns, the status line keeps to the two rows under the prompt.
- **True color in tmux.** Inside tmux Claude Code rounds every color to the 256-color palette. Start
  it with `CLAUDE_CODE_TMUX_TRUECOLOR=1` (and tmux's `RGB` terminal feature on) to get the exact ones.
- **Theme.** `/theme` → "Open Claude" (`themes/gruvbox.json`) recolors the plan, accept-edits and
  shell-mode accents, and dims the prompt's rules to the bar's gray.
- **Vim editor.** `/config` → Editor mode → vim gives the badge its `NORMAL` and `VISUAL`.

The options, in `/config` or under `pluginConfigs."open-claude@inline".options` in the settings:

| Option | Default | What it does |
| --- | --- | --- |
| `lineNumbers` | on | Numbers the draft's lines over the prompt box's two-cell gutter. |
| `minLines` | 1 | Keeps the prompt box at least this many rows tall. |
| `expandedLines` | 100 | How tall `:expand` makes the box; the default is as tall as Claude Code lets it grow. |
| `syntax` | on | Colors the draft's markdown as it is typed. |
| `commandLine` | on | The `:` command line and the drafts it saves. |
| `git` | on | The branch and the lines changed, before the usage. |

## What each segment reads

| Segment | Source |
| --- | --- |
| Editor mode | The `-- INSERT --` / `-- VISUAL --` marker of Claude Code's vim editor; `NORMAL` without one. The default editor has no modes, so it reads `INSERT`. After a leading `!` it reads `SHELL` (`SHELL NORMAL`, `SHELL VISUAL` in the vim editor's other modes). |
| Permission mode | How wide Claude Code draws its own mark for it: see "The permission mode" below. `Manual`, `Accept edits`, `Plan`, `Auto` or `Bypass`. |
| Model | `$.session.model()`, then the `PostModelSwitch` hook event. |
| Effort | `/effort <level>`, the `/effort` picker, and what each tool call and turn end report. A new session shows none until one of those, unless `effortLevel` is set. |
| Cursor | The draft each `prompt.edit` leaves, and `$.prompt.read()` on a timer while the box holds one. The percentage is vim's: how far down the draft the cursor's line is. |
| Usage | `session.measure`: context tokens, how full the window is, and the session's cost. Claude Code's own labels (`focus`, `memory paused`) stand before it. |
| Git | Before the usage: the branch HEAD is on (`detached@<commit>` on none) after a Nerd Font icon, and the lines added and deleted in the tracked files since the last commit, staged or not (`git diff --numstat HEAD`), a count of zero left out. Read every five seconds and after each tool call, with opencode.vim's commands; nothing outside a repository. The `git` option turns it off. |

Segments drop out as the terminal narrows: the provider first, then `Claude`, the effort and the model.
On the right the usage goes first, then the git counts, then the branch is cut short; they take at
most half the bar.

## Layout

- `hooks/register.tsx`: the hooks, and every call on `$`. The engine reads what a mod uses off this
  file, so `$` cannot be passed to a function another file exports.
- `hooks/statusline/`: what is drawn (`view.tsx`, `theme.ts`), how it is worded and fitted
  (`format.ts`), how the prompt box wraps a draft (`wrap.ts`), and the strip that measures the
  footer's first row (`measure.tsx`).
- `hooks/syntax/`: the colors of a draft: its markdown (`markdown.ts`), the code in its fences
  (`code.ts`), and the runs the engine paints from them (`paint.ts`).
- `hooks/commandline/`: the command line's commands and where a draft is kept (`commands.ts`).
- `themes/`: the theme the mod ships.
- `types/index.d.ts`: the values the mod keeps in `$.state`. They outlive a reload, so a value whose
  shape changes takes a new key.
- `tests/`: the formatting, the wrapping, and the footer sites mounted through the mod.

## How the footer holds together

The engine gives a mod two sites in the footer and none in the prompt box, which it draws itself: a
rule, the draft's rows, a rule. Everything is drawn from the left-hand site, the footer's first row,
and each piece rests on something the mod works out:

- **Where.** The engine keeps its permission mark at the head of that row and lays the mod's tree
  out after it, so the tree does not know where its left edge is. It asks for more room than the
  row has instead, which pins its right edge two cells short of the screen's, and every piece is
  placed from there: the bar in the row itself, the blank row under it, and the line numbers up
  over the prompt box's gutter.
- **How many rows.** The band above the prompt is told how many rows it may take, which is what the
  prompt leaves of half the screen. The mod draws nothing there, but reads the number, and the rows
  of the box follow from it.
- **Which line each row shows.** The mod lays the draft out the way the box does (`wrap.ts`, a port
  of the wrapping Claude Code uses), so that each number lands on the row its line starts on.
- **A taller box.** Claude Code has no setting for the box's height, so `minLines` and `:expand`
  add rows of the footer's own under the draft: the box's rule is blanked and drawn again under them.
- **Rows other mods pin.** A status line another mod pins (`$.ui.status`) takes a row between the
  box and the footer. The mod watches for those and places the numbers above them.

When any of that does not add up, less is drawn rather than something wrong. A draft the layout has
no rules for (an emoji, CJK, a tab) is not numbered. And while Claude Code takes the footer's first
row back for a line of its own (`Press Ctrl-C again to exit`, a paste it offers to expand), it
draws none of the mod's tree, so the footer is Claude Code's own until the line is gone.

### The permission mode

Claude Code tells a mod nothing of the permission mode: no call reads it, no event follows
shift+tab, and the hint a mod is handed has the mode cut out of it. What the mod can see is how much
of the row the engine's mark takes, since the mod's own tree gets the rest. A strip of no height in
that tree (`measure.tsx`, a `Client`) reports how wide it was laid out; each mode's mark has its own
width, so the width names the mode, and the bar draws its name over the mark.

Two marks a cell apart can be left the same room once the row has rounded its cells, so at each
terminal width the mod asks for the few cells more that leave every mark a room of its own
(`tuningOf`). A width that fits no mode, or a mode the engine's own line contradicts, is not
named: the mark keeps its slot at the head of the bar instead.

The reading rests on how one version of Claude Code lays its footer out, so it is believed per
version: on the ones it was checked on (`VERIFIED` in `format.ts`), and on any other once a prompt
has gone out under the mode the bar read at the time (the one moment the engine names the mode, in
`UserPromptSubmit`). A version it once read wrong on stays unnamed, and shows the mark.

None of this is a documented layout. If a Claude Code update moves the prompt, the bar may land in
the wrong place until the mod is fixed for it.

## The command line

A command line as in vim, in the bar after the mode's badge (the `commandLine` option, on by
default). Its
commands, their `!` and their wording are those of [opencode.vim](https://github.com/thefuga/opencode.vim).

Open it with Claude Code's own chord for the area above the prompt, Ctrl+X Tab, from insert or
normal mode. To open it with Ctrl+X `:` as well, bind that to the same action in
`~/.claude/keybindings.json`:

```json
{ "context": "Chat", "bindings": { "ctrl+x :": "abovePrompt:focus" } }
```

A bare `:` cannot open it. Claude Code's key bindings do not know the vim editor's mode, so the
binding would take every `:` typed in insert mode as well.

Enter runs the line and Escape leaves it; either way the keys go back to the prompt, in the mode it
was in. What a command answers stands in the same row for a few seconds.

Tab completes a command's name, as in opencode.vim. It opens a menu, just above the line, of the
names that start with what is typed (the line's own first, then Claude Code's), and moves down it;
Shift+Tab moves up, and so do Down and Up. Typing narrows the menu. Enter takes the picked name into
the line, and the next Enter runs it. Only the name is completed, not what follows it. Escape
leaves the line, menu and all.

| Command | What it does |
| --- | --- |
| `:w` | Saves the draft. With an empty prompt, clears the saved one. |
| `:e`, `:e!` | Loads the saved draft back. Refused while the prompt has changes that were not saved; `!` drops them. |
| `:q`, `:q!` | Quits Claude Code. Refused while the draft has unsaved changes or a turn is running; `!` quits anyway, and ends the turn first. |
| `:wq`, `:x` | Saves the draft and quits. |
| `:expand` | Makes the prompt box taller, or puts it back. See below. |
| `:h` | Lists these in the transcript. |
| `:<name> [args]` | Runs the slash command `/<name>`, once Claude is idle. |

`:write`, `:edit`, `:quit`, `:qa` and `:help` are the long names.

`:expand` is opencode.vim's compose toggle. It makes the box stand as tall as Claude Code lets it
until a prompt is sent, which puts it back, or until it is run again. That is half the screen less
five rows: 15 on a 40-row screen, 45 on a 100-row one. The `expandedLines` option stops it lower
(never below `minLines`). As with `minLines`, the rows added are drawn by the mod, not
lines of the draft, and only in the fullscreen renderer. The mod also adds a `/expand` command that
does the same thing, so a key can be bound to it:

```json
{ "context": "Chat", "bindings": { "ctrl+x x": "command:expand" } }
```

A draft belongs to its session. It is put back in the prompt when the session is opened again
(`claude --resume`, `claude -c`, `/resume`), and dropped when a prompt is sent. A session nothing
was sent in cannot be opened again, so until then its draft is kept for the folder it runs in, and
the next new session there starts with it. Nothing is saved without `:w`.

The line is typed into a field nobody sees. A mod's field can take the keyboard in one place only,
the band above the prompt, so the field stands there in a box of no height, and what is typed in
it is drawn in the footer. That has its limits:

- The line is edited at its end. The field takes typing and Backspace; Left, Right, Home and End
  do nothing in it.
- After Escape the line stays for up to a fifth of a second. Claude Code raises nothing when the
  keys go back to the prompt, so the mod asks ten times a second whether the field still has them.
- A draft is the prompt's text. A pasted image, or a paste long enough to be folded, comes back as
  its placeholder.
- The menu covers the rows above the bar while it is up: the bottom of the prompt box. It has as
  many rows as there are under the box's top rule, eight at the most, so a one-row draft shows two.
- No command sends the prompt: a mod cannot press Enter.

## Known issues

### The draft's colors blink off

The mod colors the draft's markdown as it is typed (the `syntax` option, on by default). The colors
disappear from the whole draft when its text changes by anything other than a typed key, and come
back at the next typed character. The text itself is never touched.

It happens on:

- a new line from a key bound to `chat:newline` in `~/.claude/keybindings.json`, such as an Enter
  rebound to add a line instead of sending;
- an edit in the vim editor's normal mode: `x`, `dd`, `p`, `u`;
- a history recall or a completion.

Typing, pasting, backspace, moving the cursor and a visual selection keep the colors. So does a new
line from Ctrl+J, in a terminal that sends it as a plain line feed.

Claude Code lets a mod paint the draft only in its answer to `prompt.edit`, which it raises for the
keys its text field handles itself. The cases above change the draft without raising it, and Claude
Code drops the colors it held for the old text. The mod cannot paint again on its own: the one call
that paints a whole draft (`$.prompt.fill` with `replace`) also moves the cursor to the draft's end,
and can overwrite a character typed in the meantime. Seen on Claude Code 2.1.288; the fix is the
engine's to make.

## Not there yet

- Line numbers: the gutter is two cells wide, so past 99 only the last two digits show.
- Claude Code's own hints in the footer's first row (`esc to interrupt`, `← for agents`) are covered
  by the bar.
- A session's first frames show Claude Code's mark at the head of the bar, until it has been measured.
- With a pane docked beside the transcript the footer is narrower than the terminal, which the
  footer does not allow for.
- Vim editing of its own: the badge follows Claude Code's editor, and nothing of `space leader`.
- Session tabs: Claude Code has no call that lists sessions.
