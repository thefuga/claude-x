# issues

Finds the repository's GitHub issues as `@#` is typed in Claude Code's prompt, as
[opencode.vim](https://github.com/thefuga/opencode.vim)'s `@#` does. A list of the open issues
comes up above the prompt and narrows as you type; a pick becomes `@#N` in the draft, and each
`@#N` in a prompt that is sent goes with it: the model reads the issue beside the prompt.

The issues are those of the folder's git origin on github.com, listed and fetched by the
[GitHub CLI](https://cli.github.com) (`gh`), logged in as you. The list's colors are Claude Code's
own theme colors, so they follow whatever `/theme` picks.

## Install

```sh
claude plugin marketplace add thefuga/claude-x
claude plugin install issues@claude-x
```

It needs `gh`, logged in once with `gh auth login`. It has no options: disable it
(`claude plugin disable issues@claude-x`) to leave `@#` as plain text.

## Works with

- [vim](../vim/README.md): its command line's field is in the same band above the prompt. While the
  list is up, the focus chord (its Ctrl+X `:` too) moves the keys into the list instead; at any
  other time it opens the command line as before.
- [attachments](../attachments/README.md): each `@#N` in the draft is a chip there once its issue is
  loaded, with GitHub's mark for an open, closed or merged issue or pull request, its title, and a `×`
  that takes it out. The list stands over the chips.
- [statusline](../statusline/README.md) and [syntax](../syntax/README.md): nothing is shared. A pick
  leaves the draft uncolored until the next typed key, as `:e` does.

None of them is needed.

## Finding an issue

Type `@#` at the start of the prompt or after a space. The list comes up over the prompt with the
open issues, the most recently opened first, and follows what you type after it:

- digits match an issue's number from its start, the exact one first: `@#16` lists #16, then #161;
- anything else matches titles: those that start with it, then those with a word that does, then
  those that hold it, then those that have its letters in order.

A space, or the cursor moving off the reference, takes the list down. Typing `@#161` in full needs
no list at all.

## Picking one

Unlike Claude Code's own `@` menu, the arrows and Enter do not pick from the list while you type in
the prompt: Claude Code keeps those keys to itself (its arrows walk the prompt history) and never
hands them to a mod, nor lets a mod add to its own menu. So the list says how to reach it, right
after what you typed:

- **Click** an issue to pick it, in the fullscreen renderer (`/tui fullscreen`), the one that reports
  the mouse.
- **Ctrl+X Tab**, Claude Code's own chord for the area above the prompt (or any key bound to
  `abovePrompt:focus`, such as the vim mod's Ctrl+X `:`), moves the keys into the list:

| Key | In the list |
| --- | --- |
| Down, Tab | The next issue, round the end |
| Up, Shift+Tab | The one before |
| Letters, digits, Backspace | Narrow the list further; the draft is left as it is |
| Enter | Makes the reference `@#N` and gives the keys back to the prompt |
| Escape | Gives the keys back, the draft as it was; the list stays down until the reference changes |

Enter with digits that no open issue has takes them as they are, for a closed issue: `@#7`. Claude
Code puts the cursor at the end of a draft a mod writes, so a reference picked in the middle of the
draft leaves the cursor at its end.

## As a chip

With the [attachments](../attachments/README.md) mod, each `@#N` in the draft is a chip above the
prompt, as a pasted picture or a mentioned file is: GitHub's mark for an open, closed or merged
issue or pull request, `#N` and its title, and a `×` that takes it out of the draft. An issue is
loaded as soon as its `@#N` is typed out (the one still under the cursor waits), from the list where
it has it and from `gh issue view` otherwise, and its chip comes up once it is.

## What the model reads

When the prompt is sent, each `@#N` that stands alone (not `me@#1`, not `@#1a`) is fetched with
`gh issue view`, open or closed, and goes with the prompt for the model to read: as opencode.vim's
attachment, YAML front matter (repository, number, link, title, state, author, labels, assignees,
dates) and the body as written, under a line that names it `@#N`. The comments are left out, as
opencode.vim leaves them out. The prompt itself is sent and shown as typed.

An issue that goes with the prompt is not announced, as in opencode.vim. One gh cannot fetch goes
as the list last had it, where it had it; otherwise it is left out, a toast says why, and the prompt
is sent all the same.

## Limits

- **GitHub only, from the origin.** The repository is the git origin of the folder Claude Code runs
  in, over HTTPS or SSH on github.com. There is no setting to name another; a folder without one
  says so in the list.
- **The hundred newest open issues.** The list is fetched once and filtered as you type, so it holds
  at most a hundred; an `@#` typed five minutes later fetches it again. Older and closed issues are
  reached by their number.
- **The prompt waits for gh.** Fetching the issues a prompt names takes a moment before it is sent,
  five seconds at most each.
- **Pull requests are not in the list.** `gh issue list` leaves them out, but `gh issue view`
  answers for one, so `@#N` of a pull request goes with the prompt like an issue, its description as
  the body.
- **Prompts you type.** A prompt a plugin, a scheduled task or another session sends is left as it is.
- **The terminal only.** The desktop app's prompt is left as it is.
