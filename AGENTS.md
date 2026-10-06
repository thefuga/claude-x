# AGENTS.md

## Commands

- Each mod is checked in its own folder (`mods/<name>`): `claude plugin validate .`, `tsc -p .` and `claude plugin test .`. Run `claude plugin validate .` at the root after touching `.claude-plugin/marketplace.json`.
- `tsc` needs the engine's types, which Claude Code writes to each mod's `.claude-plugin/types/` (git-ignored) when it loads the mod. If they are missing, load the mod once (`claude --plugin-dir mods/<name>`).
- There is no build step, no `package.json` and no lockfile: Claude Code loads the TypeScript sources directly.

## Layout

- The repo is a Claude Code plugin marketplace (`claude-x`). `.claude-plugin/marketplace.json` lists one plugin per folder under `mods/`, by relative path. A new mod gets a folder there, an entry in the marketplace, a section in the README with a GIF of the mod alone, and a README of its own.
- A mod is `.claude-plugin/plugin.json` (name, version, description, options as `userConfig`), `hooks/hooks.json` (the module to load), `hooks/register.ts(x)`, plain modules beside it in `hooks/`, `types/index.d.ts`, `tests/` and `README.md`.
- READMEs: the root `README.md` is a map (what the repo is, a section per mod with its GIF in `docs/<mod>.gif` and links, install). Each mod's README opens with what it does, then `## Install` and `## Works with`; the root sections link to its headings by anchor, so keep those headings stable.

## Live Loading

- The owner's sessions load the mods straight from this clone (`CLAUDE_CODE_PLUGIN_DIRS` names the `mods/*` folders), and a save reloads the mod in every open session. Keep each mod loadable between saves; for a risky change, work on a copy and load it with `--plugin-dir`, which wins over a folder of the same plugin name.
- Loaded that way a mod is `<name>@inline`, the key its options sit under in `pluginConfigs` (installed from the marketplace it is `<name>@claude-x`).
- `claude plugin test` checks the tree a hook returns, never how the terminal lays it out. To see a change render, run a second Claude Code in a private tmux server and read the screen. Those sessions run as the owner: they land in `/resume` and the prompt history, so send as few prompts as possible, and never send keys into `/config` or other pickers.

## Engine Rules

- Every call on `$` lives in `hooks/register.ts(x)`: the engine reads what a mod uses off that file, so `$` cannot be passed to a function another file exports.
- `$.state` outlives a reload; a value whose shape changes takes a new key. A `ui.render` hook may read state but not write it: write on the next tick (`$.clock.after(0, …)`) or from an event.
- Mods talk through state only. Any mod reads another's, only its owner writes it, so none depends on another being installed. Today `statusline` owns `mode` (read by `syntax`), `vim` owns `command`, `echo` and `menu` (read and drawn by `statusline`), `attachments` owns `chips` (read by none), and `issues` owns `list` and `field` (read by none) and `references` (read and drawn by `attachments`). Declare a value read from another mod in the reader's `types/index.d.ts` too.
- Colors are keys of Claude Code's theme (`success`, `warning`, `suggestion`, `inactive`…), never hex values, so the mods follow any theme. Element colors and `prompt.edit` decorations both take them.
- A contract file (`types/index.d.ts`) exports types and nothing else (`export {}` fails validation).
- Tests play another mod with an inline plugin: `test(name, { plugins: [...] }, body)`; the inline plugin's `register` closes over nothing of the test file. The test's `$` has no `state`: read state through an inline plugin that draws it.

## TUI Gotchas

- The prompt box is Claude Code's own; a mod draws only from the footer sites (`PromptHint`, `SessionMode`) and the band above the prompt (`AbovePrompt`). Absolute boxes from the footer are clipped at the box's top rule, and the band cannot draw below itself, so the notice row between them is out of reach.
- Box sizes, the permission mark's width and the band's `bodyColumns` are read off undocumented layout and change between Claude Code versions (2.1.289 told the band 5 columns short of the screen). `VERIFIED` in `mods/statusline/hooks/format.ts` lists the versions the permission reading was checked on; add one only after checking it.
- An absolute box with a background that reaches the screen's last cell is not drawn at all.
- `prompt.edit` decorations drop whenever the draft changes without a keystroke (a rebound Enter, vim normal-mode edits) and only the next keystroke can paint again; `$.prompt.fill` with `replace` repaints but moves the cursor to the end.
- A paste raises no `prompt.edit` when it becomes a placeholder (`[Image #N]`, `[Pasted text #N +L lines]`), so a mod that follows the draft reads it on a timer. A pasted picture is saved at once as `<temp>/claude-<uid>/<project>/<session>/images/<N>.<format>` (undocumented, seen on 2.1.289); a pasted text stays in memory until it is sent. Removing the placeholder from the draft removes the attachment.
- A mod's `Image` is drawn with the kitty graphics protocol only, and Claude Code turns that off inside tmux; there, a picture can only be a `Raster` of half-blocks.
- No key that picks from a list reaches a mod in the prompt box: Up, Down, Ctrl+N and Ctrl+P walk the history and raise no `prompt.edit`, Tab raises none, and neither does a move that cannot move (Right at the draft's end). A list is picked from in the band, after the focus chord (Ctrl+X Tab); of the band's `autoFocus` fields the first in the tree takes it, which is why `issues` draws its list before what is beneath.
- A Button's `action` is pressed from the prompt by a chord bound to that action in any context (Ctrl+X b, `app:cycleDiffBase`, tried), but by a single modified key only where Global or an active context binds it: Ctrl+N bound in `Footer` presses nothing.
- A mod cannot add to Claude Code's own `@` menu: a `#` after `@` closes it, and an MCP server's resources (the one way in) show as `plugin:<plugin>:<server>:<uri>`. The `fileSuggestion` setting replaces the whole file finder.
- The owner's `keybindings.json` entries come after Claude Code's defaults, and where two active contexts bind a key the later entry wins, whatever the context: a Chat binding for Tab would beat the `@` menu's own Tab unless restated in `Autocomplete` after it, as the owner's Enter is. Tab in the prompt is not free: it takes the dim suggestion and completes a slash command typed mid-prompt.
