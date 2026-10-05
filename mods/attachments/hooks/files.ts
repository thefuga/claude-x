// What a chip says of a file: its type, told by its name or else by its first bytes, and the facts
// after its path, all worked out here from what the hooks read off the disk.

import type { FileType } from '../types'

// The most of a file that is read: what one `$.fs.read` hands over at most.
export const MAX_READ = 4 * 1024 * 1024
// How many of a file's first bytes are looked through for a NUL, which tells a binary from text.
const SNIFFED = 8000
// The longest path a chip shows whole.
export const MAX_PATH = 44

// What a file is by its extension, or by its whole name where its extension tells nothing.
const KNOWN: [FileType, string][] = [
  ['text', 'txt md markdown mdx rst adoc asciidoc org log csv tsv tex'],
  [
    'code',
    'ts tsx js jsx mjs cjs mts cts json jsonc json5 yaml yml toml ini cfg conf env xml html htm css scss sass less vue svelte astro py pyi rb go rs java kt kts scala swift c h cc cpp cxx hpp hh m mm cs fs fsx php pl pm lua r jl dart ex exs erl hrl elm hs clj cljs edn sql sh bash zsh fish ps1 bat cmd nix tf hcl proto graphql gql mk cmake gradle groovy vim el lisp scm zig nim sol diff patch lock',
  ],
  ['image', 'png jpg jpeg gif webp bmp tif tiff ico heic heif avif svg psd'],
  ['video', 'mp4 m4v mov mkv webm avi wmv flv mpg mpeg 3gp ogv'],
  ['audio', 'mp3 wav flac aac m4a ogg oga opus wma aif aiff mid midi'],
  ['pdf', 'pdf'],
  ['document', 'doc docx odt rtf pages'],
  ['spreadsheet', 'xls xlsx ods numbers'],
  ['slides', 'ppt pptx odp key'],
  ['archive', 'zip tar gz tgz bz2 tbz xz txz 7z rar zst lz lzma jar war apk deb rpm dmg iso whl gem crate'],
  ['binary', 'exe dll so dylib o a lib bin dat class pyc wasm out obj node sqlite db'],
]
const EXTENSIONS = Object.fromEntries(KNOWN.flatMap(([type, extensions]) => extensions.split(' ').map(extension => [extension, type] as const)))
const NAMES: Record<string, FileType> = {
  makefile: 'code',
  dockerfile: 'code',
  gemfile: 'code',
  rakefile: 'code',
  justfile: 'code',
  license: 'text',
  readme: 'text',
  changelog: 'text',
}

// The type a file's name tells, or null where it tells none. A dotfile has no extension.
export const typeOfName = (path: string): FileType | null => {
  const name = (path.split('/').pop() ?? '').toLowerCase()
  const dot = name.lastIndexOf('.')

  return EXTENSIONS[dot > 0 ? name.slice(dot + 1) : ''] ?? NAMES[name.split('.')[0] ?? ''] ?? null
}

// Whether a file's bytes are worth reading: for its type where its name tells none, for an image's
// size or a text's lines.
export const wantsBytes = (named: FileType | null) => named === null || named === 'image' || named === 'text' || named === 'code'

// A file's bytes as `$.fs.read` hands them over. The mod's environment has `Uint8Array.fromBase64`;
// the TypeScript library the mods are checked with does not declare it yet.
export const bytesOf = (base64: string) => (Uint8Array as unknown as { fromBase64: (text: string) => Uint8Array }).fromBase64(base64)

// Width and height off the header of a PNG, GIF, BMP or WebP, or a JPEG's frame marker.
export const dimensionsOf = (bytes: Uint8Array) => {
  const at = (i: number) => bytes[i] ?? 0
  const tag = (i: number) => String.fromCharCode(at(i), at(i + 1), at(i + 2), at(i + 3))
  const little = (i: number, count: number) => Array.from({ length: count }, (_, k) => at(i + k) * 256 ** k).reduce((sum, part) => sum + part, 0)
  const big = (i: number) => ((at(i) << 24) | (at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3)) >>> 0

  if (tag(0) === '\x89PNG') {
    return { width: big(16), height: big(20) }
  }

  if (tag(0) === 'GIF8') {
    return { width: little(6, 2), height: little(8, 2) }
  }

  // A BMP is told by the size of its info header as well, since `BM` may start a text.
  if (at(0) === 0x42 && at(1) === 0x4d && [12, 40, 52, 56, 108, 124].includes(little(14, 4))) {
    return { width: Math.abs(little(18, 4) >> 0), height: Math.abs(little(22, 4) >> 0) }
  }

  if (tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    if (tag(12) === 'VP8 ') {
      return { width: little(26, 2) & 0x3fff, height: little(28, 2) & 0x3fff }
    }

    if (tag(12) === 'VP8L') {
      return { width: 1 + (((at(22) & 0x3f) << 8) | at(21)), height: 1 + (((at(24) & 0xf) << 10) | (at(23) << 2) | ((at(22) & 0xc0) >> 6)) }
    }

    if (tag(12) === 'VP8X') {
      return { width: 1 + little(24, 3), height: 1 + little(27, 3) }
    }
  }

  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) {
    let i = 2

    while (i + 9 < bytes.length) {
      const marker = at(i + 1)

      if (at(i) !== 0xff) {
        i += 1
      } else if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2
      } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: (at(i + 7) << 8) | at(i + 8), height: (at(i + 5) << 8) | at(i + 6) }
      } else {
        i += 2 + ((at(i + 2) << 8) | at(i + 3))
      }
    }
  }

  return null
}

// The type of a file whose name tells none, from its first bytes: a header it is known by, else a
// NUL for a binary, else text.
export const typeOfBytes = (bytes: Uint8Array): FileType => {
  const at = (i: number) => bytes[i] ?? 0
  const tag = (i: number) => String.fromCharCode(at(i), at(i + 1), at(i + 2), at(i + 3))

  if (dimensionsOf(bytes) !== null) {
    return 'image'
  }

  if (tag(0) === '%PDF') {
    return 'pdf'
  }

  if (tag(0) === 'PK\x03\x04' || (at(0) === 0x1f && at(1) === 0x8b) || tag(0) === 'Rar!' || tag(0) === '7z\xbc\xaf') {
    return 'archive'
  }

  // MP4 and its kin name their brand after `ftyp`: HEIC and AVIF pictures and M4A sound use it too.
  if (tag(4) === 'ftyp') {
    const brand = tag(8)

    return ['heic', 'heix', 'mif1', 'avif'].includes(brand) ? 'image' : brand.startsWith('M4A') ? 'audio' : 'video'
  }

  if (tag(0) === '\x1aE\xdf\xa3') {
    return 'video'
  }

  if (tag(0) === 'fLaC' || tag(0) === 'OggS' || tag(0).startsWith('ID3') || (tag(0) === 'RIFF' && tag(8) === 'WAVE')) {
    return 'audio'
  }

  return bytes.subarray(0, SNIFFED).includes(0) ? 'binary' : 'text'
}

// The lines a text has, a last one without its line feed counted.
export const linesIn = (bytes: Uint8Array) => {
  const feeds = bytes.reduce((count, byte) => (byte === 10 ? count + 1 : count), 0)

  return bytes.length > 0 && bytes[bytes.length - 1] !== 10 ? feeds + 1 : feeds
}

export const counted = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

// `730 KB`, `1.7 KB`, `5 MB`: a decimal only under ten.
export const sizeOf = (bytes: number) => {
  const rounded = (value: number) => (value < 10 ? Number(value.toFixed(1)) : Math.round(value))

  if (bytes < 1024) {
    return `${bytes} B`
  }

  return bytes < 1024 * 1024 ? `${rounded(bytes / 1024)} KB` : `${rounded(bytes / 1024 / 1024)} MB`
}

// `0:42`, `1:02:05`.
export const durationOf = (seconds: number) => {
  const whole = Math.round(seconds)
  const two = (count: number) => String(count).padStart(2, '0')
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)

  return hours > 0 ? `${hours}:${two(minutes)}:${two(whole % 60)}` : `${minutes}:${two(whole % 60)}`
}

// What a chip says after an image's path, a text's or the size alone.
export const factsOf = (type: FileType, bytes: Uint8Array | null, size: number): string[] => {
  const found = type === 'image' && bytes !== null ? dimensionsOf(bytes) : null

  if (found !== null) {
    return [`${found.width}x${found.height}`, sizeOf(size)]
  }

  return (type === 'text' || type === 'code') && bytes !== null ? [counted(linesIn(bytes), 'line', 'lines'), sizeOf(size)] : [sizeOf(size)]
}

// A video's frame and a video's or a sound's length, asked of ffprobe, which comes with ffmpeg.
export type Probe = { frame: string | null; length: string | null }

export const PROBE = (path: string) => ['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration', '-of', 'json', path]

export const probed = (stdout: string): Probe | null => {
  try {
    const found = JSON.parse(stdout) as { streams?: { codec_type?: string; width?: number; height?: number }[]; format?: { duration?: string } }
    const video = found.streams?.find(stream => stream.codec_type === 'video' && stream.width !== undefined && stream.height !== undefined)
    const seconds = Number(found.format?.duration)

    return { frame: video === undefined ? null : `${video.width}x${video.height}`, length: Number.isFinite(seconds) ? durationOf(seconds) : null }
  } catch {
    return null
  }
}

export const mediaFactsOf = (probe: Probe | null, size: number) => [probe?.frame ?? '', probe?.length ?? '', sizeOf(size)].filter(fact => fact !== '')

// A mentioned path as the file system takes it: `~` is the home folder.
export const expandedPath = (path: string, home: string | undefined) => (home !== undefined && (path === '~' || path.startsWith('~/')) ? `${home}${path.slice(1)}` : path)

// A path as a chip shows it: under the home folder from `~`, and past MAX_PATH its first folders,
// then `…`, then as many of its last parts as fit.
export const shownPath = (path: string, home: string | undefined) => {
  const full = home !== undefined && home !== '' && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path

  if (full.length <= MAX_PATH) {
    return full
  }

  const parts = full.split('/')
  const lead = full.startsWith('/') ? 3 : full.startsWith('~/') ? 2 : 1
  const head = parts.slice(0, lead).join('/')
  let tail = parts.at(-1) ?? ''

  for (let i = parts.length - 2; i >= lead; i -= 1) {
    const longer = `${parts[i]}/${tail}`

    if (`${head}/…/${longer}`.length > MAX_PATH) {
      break
    }

    tail = longer
  }

  const short = `${head}/…/${tail}`

  return short.length <= MAX_PATH ? short : `…${full.slice(-(MAX_PATH - 1))}`
}

// Where Claude Code saves what is pasted into a session's prompt, a picture as `<N>.<format>`:
// a folder of the session's own, under one for the user in its temp directory, named by the
// project's folder as the transcripts are. Not documented; seen on Claude Code 2.1.289.
export const imagesFolder = (temp: string, uid: string, root: string, sessionId: string) =>
  `${temp}/claude-${uid}/${root.replace(/[^a-zA-Z0-9]/g, '-')}/${sessionId}/images`
