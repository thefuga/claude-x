# statusline

A vim-style status bar for Claude Code's footer. It also numbers the draft's lines and keeps the
prompt box taller.

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

Where the [vim](../vim) mod is installed, its command line opens in the bar after the badge, and
its completions stand just above it. The [syntax](../syntax) mod reads the editor's mode from here
to color a shell command as one.

## Getting the look

- **Fullscreen renderer** (`/tui fullscreen`). Only there can a mod draw outside its own rows. Under
  the default renderer, or below 64 columns, the status line keeps to the two rows under the prompt.
- **True color in tmux.** Inside tmux Claude Code rounds every color to the 256-color palette. Start
  it with `CLAUDE_CODE_TMUX_TRUECOLOR=1` (and tmux's `RGB` terminal feature on) to get the exact ones.
- **Theme.** `/theme` → "Open Claude" (`themes/gruvbox.json`) recolors the plan, accept-edits and
  shell-mode accents, and dims the prompt's rules to the bar's gray.
- **Vim editor.** `/config` → Editor mode → vim gives the badge its `NORMAL` and `VISUAL`.

The options, in `/config` or under `pluginConfigs."statusline@<marketplace>".options` in the settings
(`statusline@inline` when loaded from a folder):

| Option | Default | What it does |
| --- | --- | --- |
| `lineNumbers` | on | Numbers the draft's lines over the prompt box's two-cell gutter. |
| `minLines` | 1 | Keeps the prompt box at least this many rows tall. |
| `expandedLines` | 100 | How tall `/expand` makes the box; the default is as tall as Claude Code lets it grow. |
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

## A taller prompt

`/expand` is opencode.vim's compose toggle (`:expand` in the vim mod's command line). It makes the
box stand as tall as Claude Code lets it until a prompt is sent, which puts it back, or until it is
run again. That is half the screen less five rows: 15 on a 40-row screen, 45 on a 100-row one. The
`expandedLines` option stops it lower (never below `minLines`). As with `minLines`, the rows added
are drawn by the mod, not lines of the draft, and only in the fullscreen renderer. Bind a key to it:

```json
{ "context": "Chat", "bindings": { "ctrl+x x": "command:expand" } }
```

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
- **A taller box.** Claude Code has no setting for the box's height, so `minLines` and `/expand`
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

## Not there yet

- Line numbers: the gutter is two cells wide, so past 99 only the last two digits show.
- Claude Code's own hints in the footer's first row (`esc to interrupt`, `← for agents`) are covered
  by the bar.
- A session's first frames show Claude Code's mark at the head of the bar, until it has been measured.
- With a pane docked beside the transcript the footer is narrower than the terminal, which the
  footer does not allow for.
- Session tabs: Claude Code has no call that lists sessions.
