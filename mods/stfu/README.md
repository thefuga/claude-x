# stfu

Takes the whimsical word out of the line Claude Code draws while it works, and leaves the request
data where Claude Code puts it:

```
✢ Sauteing… (12s · ↓ 300 tokens · thinking)      before
✢   (12s · ↓ 300 tokens · thinking)               after
```

The line that closes a turn gets a plain verb in place of its word:

```
✻ Baked for 3s · done 9:01 AM                     before
✻ Worked for 3s · done 9:01 AM                    after
```

Only the word is replaced. The time, tokens, thinking and effort are still Claude Code's own,
drawn in the same place. A message that stands in for the word while a task runs (`Running tests…`)
says what the turn is doing, so it is kept.

## Install

```sh
claude plugin marketplace add thefuga/claude-x
claude plugin install stfu@claude-x
```

It has no options: disable it (`claude plugin disable stfu@claude-x`) to get the words back.

## Works with

Anything: it reads and keeps no state, and no other mod draws these lines.

## Why a blank and a verb

Claude Code puts its own word back when it is handed an empty one, so the running line gets a space
instead, which leaves a few blank cells before the numbers. The closing line always reads
`<word> for <time>`, so an empty word would leave `for 3s`; `Worked` reads as a sentence. Both were
checked on Claude Code 2.1.291.
