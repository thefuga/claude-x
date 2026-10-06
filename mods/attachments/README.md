# attachments

The draft's attachments as chips above Claude Code's prompt. Each pasted picture, pasted text and
`@`-mentioned file or folder gets a chip: a glyph for its type, its path and what it is, and a `×`
that takes it out of the draft. With the [issues](../issues/README.md) mod, so does each GitHub
issue the draft names with `@#N`.

![A picture pasted and three files mentioned, each a chip above the prompt with its type's glyph, its path, its size or lines; the × on one takes its mention out of the draft](../../docs/attachments.gif)

The chips follow the draft. Claude Code still writes `[Image #1]`, `[Pasted text #2 +30 lines]` and
`@path` in the prompt and sends what the prompt holds; a chip comes and goes with its placeholder or
mention. Their colors are Claude Code's own theme colors, so they follow whatever `/theme` picks.

## Install

```sh
claude plugin marketplace add thefuga/claude-x
claude plugin install attachments@claude-x
```

It has no options: disable it (`claude plugin disable attachments@claude-x`) to take the chips away.

## Works with

- [vim](../vim/README.md): its command line's field is in the same band above the prompt. The chips
  stand over it, and the line opens as before.
- [issues](../issues/README.md): each `@#N` in the draft is a chip once that mod has loaded the
  issue, read from its state. Without it, `@#N` is plain text and has none.
- [statusline](../statusline/README.md) and [syntax](../syntax/README.md): nothing is shared. A `×`
  leaves the draft uncolored until the next typed key, as `:e` does.

None of them is needed.

## What a chip shows

| Attachment | Path | Then |
| --- | --- | --- |
| A pasted or dropped picture, `[Image #N]` | The copy Claude Code saved of it | Width x height, size |
| A long paste, `[Pasted text #N +L lines]` | `Pasted text #N` | Lines |
| A mentioned file, `@path` or `@"a path"` | As typed, `~` for the home folder | By its type: lines and size of a text, width x height and size of a picture, frame, length and size of a video, length and size of a sound, the size of anything else |
| A mentioned folder | As typed | Entries |
| A GitHub issue or pull request, `@#N`, with the issues mod | `#N` and its title | Closed or merged, once it is |

A path longer than 44 characters keeps its first folders and its end: `/tmp/claude-1000/…/images/1.png`.
A mention of something that is not on disk (a typo, an agent, an MCP resource) has no chip, and one
that ends a sentence (`@README.md,`) is found without its stop. A line range (`@app.ts#L10-20`)
stays in the path.

## Glyphs

They are [Nerd Font](https://www.nerdfonts.com) icons, as the statusline mod's branch icon is: a
terminal font without them draws a box.

| Type | Glyph | Told by |
| --- | --- | --- |
| Text | `nf-fa-file_text_o` | `md`, `txt`, `log`, `csv`…; `LICENSE`, `README` |
| Code | `nf-fa-file_code_o` | `ts`, `py`, `go`, `json`, `yaml`, `sh`…; `Makefile`, `Dockerfile` |
| Picture | `nf-fa-file_image_o` | `png`, `jpg`, `gif`, `webp`, `svg`… |
| Video | `nf-fa-file_video_o` | `mp4`, `mov`, `mkv`, `webm`… |
| Sound | `nf-fa-file_audio_o` | `mp3`, `wav`, `flac`, `ogg`… |
| PDF | `nf-fa-file_pdf_o` | `pdf` |
| Document, spreadsheet, slides | `nf-fa-file_word_o`, `nf-fa-file_excel_o`, `nf-fa-file_powerpoint_o` | `docx`, `xlsx`, `pptx` and their kin |
| Archive | `nf-fa-file_archive_o` | `zip`, `tar.gz`, `jar`, `deb`… |
| Binary | `nf-oct-file_binary` | `exe`, `so`, `wasm`, `pyc`… |
| Folder | `nf-fa-folder_o` | — |
| Pasted text | `nf-fa-clipboard` | — |
| Unknown | `nf-fa-file_o` | — |
| Issue, open or closed | `nf-oct-issue_opened` green, `nf-oct-issue_closed` purple | Its state |
| Pull request, open, merged or closed | `nf-oct-git_pull_request` green, `nf-oct-git_merge` purple, `nf-oct-git_pull_request_closed` red | Its state |

A file whose name tells nothing (no extension, or one not in the list) is told by its first bytes:
a picture's, a PDF's, an archive's, a video's or a sound's header, a NUL byte for a binary, and
text otherwise. That needs the file read, so one over 4 MB is left unknown.

## Taking one out

Click a chip's `×`: its placeholder, mention or `@#N` leaves the draft, and a pasted picture or text
leaves with its placeholder, so it is not sent. Claude Code then puts the cursor at the end of the draft.

The click needs the fullscreen renderer (`/tui fullscreen`), the one that reports the mouse. Where
the vim mod is installed its command line holds the band's keyboard, so the `×` is for the mouse.

## Limits

- **A pasted picture's path is its copy.** Claude Code saves what is pasted in a folder of the
  session's own (`/tmp/claude-<uid>/<project>/<session>/images/<N>.png`), and where it came from
  reaches a mod only once the prompt is sent. The folder is Claude Code's and not documented (seen
  on 2.1.289, on Linux); where it is not found the chip says `Image #N` alone.
- **A pasted text is not read.** Its words stay with Claude Code until the prompt is sent, so its
  chip has their lines and nothing else.
- **No previews.** Claude Code draws a mod's pictures with the kitty graphics protocol only, and
  never inside tmux.
- **A video's and a sound's length need ffprobe**, which comes with ffmpeg. Without it they show
  their size.
- **A quarter of a second.** A paste changes the draft without telling a mod, so the draft is read
  four times a second, and a chip can come up that long after its attachment.
- **One row above the box.** Claude Code keeps a row of its own between the band and the prompt box
  for its notices, so the chips never touch the box.
- **The terminal only.** The desktop app's prompt is left as it is.
