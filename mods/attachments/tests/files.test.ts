import { describe, expect, test } from 'claude-code/testing'

import {
  MAX_PATH,
  dimensionsOf,
  durationOf,
  expandedPath,
  factsOf,
  imagesFolder,
  linesIn,
  mediaFactsOf,
  probed,
  shownPath,
  sizeOf,
  typeOfBytes,
  typeOfName,
} from '../hooks/files'

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap(part => (typeof part === 'string' ? [...part].map(char => char.charCodeAt(0)) : part)))
const little = (value: number, count: number) => Array.from({ length: count }, (_, k) => (value >>> (8 * k)) & 255)
const big = (value: number) => [24, 16, 8, 0].map(shift => (value >>> shift) & 255)
const padded = (head: Uint8Array, length: number) => {
  const whole = new Uint8Array(length)
  whole.set(head)

  return whole
}

// The headers each format starts with, as far as its size is read.
const PNG = bytes('\x89PNG\r\n\x1a\n', big(13), 'IHDR', big(320), big(240))
const GIF = bytes('GIF89a', little(1036, 2), little(328, 2))
const BMP = padded(bytes('BM', little(0, 4), little(0, 4), little(54, 4), little(40, 4), little(64, 4), little(-48, 4)), 40)
const WEBP = bytes('RIFF', little(0, 4), 'WEBP', 'VP8X', little(10, 4), little(0, 4), little(1919, 3), little(1079, 3))
const JPEG = padded(bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 'JFIF\0', little(0, 9), [0xff, 0xc0, 0x00, 0x11, 0x08], big(1086).slice(2), big(1448).slice(2)), 40)

describe('files', () => {
  test('tells a file by its extension, whatever its case, or by its whole name', () => {
    expect(typeOfName('src/app.ts')).toBe('code')
    expect(typeOfName('docs/README.md')).toBe('text')
    expect(typeOfName('shot.PNG')).toBe('image')
    expect(typeOfName('clip.mov')).toBe('video')
    expect(typeOfName('tone.flac')).toBe('audio')
    expect(typeOfName('report.pdf')).toBe('pdf')
    expect(typeOfName('plan.docx')).toBe('document')
    expect(typeOfName('budget.xlsx')).toBe('spreadsheet')
    expect(typeOfName('deck.pptx')).toBe('slides')
    expect(typeOfName('bundle.tar.gz')).toBe('archive')
    expect(typeOfName('lib/native.so')).toBe('binary')
    expect(typeOfName('Makefile')).toBe('code')
    expect(typeOfName('Dockerfile.dev')).toBe('code')
    expect(typeOfName('LICENSE')).toBe('text')
  })

  test('leaves a name that tells nothing to the bytes: no extension, an unknown one, a dotfile', () => {
    expect(typeOfName('NOTES')).toBe(null)
    expect(typeOfName('blob.xyz')).toBe(null)
    expect(typeOfName('.env')).toBe(null)
  })

  test('tells a file by its first bytes where its name does not', () => {
    expect(typeOfBytes(PNG)).toBe('image')
    expect(typeOfBytes(JPEG)).toBe('image')
    expect(typeOfBytes(bytes('%PDF-1.4\n'))).toBe('pdf')
    expect(typeOfBytes(bytes('PK\x03\x04', little(0, 26)))).toBe('archive')
    expect(typeOfBytes(bytes([0x1f, 0x8b, 0x08]))).toBe('archive')
    expect(typeOfBytes(bytes(little(0, 4), 'ftypisom'))).toBe('video')
    expect(typeOfBytes(bytes(little(0, 4), 'ftypM4A '))).toBe('audio')
    expect(typeOfBytes(bytes(little(0, 4), 'ftypheic'))).toBe('image')
    expect(typeOfBytes(bytes('ID3\x04'))).toBe('audio')
    expect(typeOfBytes(bytes('RIFF', little(0, 4), 'WAVEfmt '))).toBe('audio')
    expect(typeOfBytes(bytes('\x7fELF', [2, 1, 1, 0, 0, 0]))).toBe('binary')
    expect(typeOfBytes(bytes('first\nsecond\n'))).toBe('text')
    expect(typeOfBytes(bytes('BMW is a car, not a bitmap'))).toBe('text')
    expect(typeOfBytes(bytes(''))).toBe('text')
  })

  test("reads a picture's size off its header", () => {
    expect(dimensionsOf(PNG)).toEqual({ width: 320, height: 240 })
    expect(dimensionsOf(GIF)).toEqual({ width: 1036, height: 328 })
    expect(dimensionsOf(BMP)).toEqual({ width: 64, height: 48 })
    expect(dimensionsOf(WEBP)).toEqual({ width: 1920, height: 1080 })
    expect(dimensionsOf(JPEG)).toEqual({ width: 1448, height: 1086 })
    expect(dimensionsOf(bytes('not a picture'))).toBe(null)
  })

  test('counts lines, a last one without its line feed included', () => {
    expect(linesIn(bytes('a\nb\n'))).toBe(2)
    expect(linesIn(bytes('a\nb'))).toBe(2)
    expect(linesIn(bytes(''))).toBe(0)
  })

  test('writes sizes with a decimal only under ten, and lengths as a clock does', () => {
    expect(sizeOf(16)).toBe('16 B')
    expect(sizeOf(1741)).toBe('1.7 KB')
    expect(sizeOf(2048)).toBe('2 KB')
    expect(sizeOf(166_839)).toBe('163 KB')
    expect(sizeOf(8_379_078)).toBe('8 MB')
    expect(sizeOf(52_428_800)).toBe('50 MB')
    expect(durationOf(42.2)).toBe('0:42')
    expect(durationOf(95)).toBe('1:35')
    expect(durationOf(3725)).toBe('1:02:05')
  })

  test('says what a chip shows after the path: a picture its size, a text its lines, the rest their size', () => {
    expect(factsOf('image', PNG, 1741)).toEqual(['320x240', '1.7 KB'])
    expect(factsOf('image', null, 5_242_880)).toEqual(['5 MB'])
    expect(factsOf('code', bytes('one\ntwo\n'), 8)).toEqual(['2 lines', '8 B'])
    expect(factsOf('text', bytes('one'), 3)).toEqual(['1 line', '3 B'])
    expect(factsOf('pdf', null, 16)).toEqual(['16 B'])
  })

  test("reads a video's frame and length, and a sound's length, off ffprobe", () => {
    const video = JSON.stringify({ streams: [{ codec_type: 'video', width: 1280, height: 720 }, { codec_type: 'audio' }], format: { duration: '42.000000' } })
    const sound = JSON.stringify({ streams: [{ codec_type: 'audio' }], format: { duration: '95.0' } })

    expect(probed(video)).toEqual({ frame: '1280x720', length: '0:42' })
    expect(mediaFactsOf(probed(video), 525_039)).toEqual(['1280x720', '0:42', '513 KB'])
    expect(mediaFactsOf(probed(sound), 8_379_078)).toEqual(['1:35', '8 MB'])
    expect(probed('not json')).toBe(null)
    expect(mediaFactsOf(null, 1024)).toEqual(['1 KB'])
  })

  test('shows a path from the home folder as `~`, and cuts a long one in its middle', () => {
    const pasted = '/tmp/claude-1000/-home-me-git-claude-x/14cb6201-d0eb-43d7-9efa-965ba69f585a/images/4.png'

    expect(shownPath('README.md', '/home/me')).toBe('README.md')
    expect(shownPath('/home/me/notes/a.md', '/home/me')).toBe('~/notes/a.md')
    expect(shownPath('/home/mel/a.md', '/home/me')).toBe('/home/mel/a.md')
    expect(shownPath(pasted, '/home/me')).toBe('/tmp/claude-1000/…/images/4.png')
    expect(shownPath('./mods/statusline/hooks/and/some/deeper/folders/register.tsx', '/home/me')).toBe('./…/and/some/deeper/folders/register.tsx')
    expect(shownPath(`/srv/${'a'.repeat(60)}.md`, undefined)).toHaveLength(MAX_PATH)
    expect(expandedPath('~/notes/a.md', '/home/me')).toBe('/home/me/notes/a.md')
    expect(expandedPath('notes/~a.md', '/home/me')).toBe('notes/~a.md')
  })

  test("names the folder a session's pasted pictures are saved in", () => {
    expect(imagesFolder('/tmp', '1000', '/home/me/git/claude-x', 'abc')).toBe('/tmp/claude-1000/-home-me-git-claude-x/abc/images')
  })
})
