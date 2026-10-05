import type { FileType } from '../types'

// The glyph on each kind of attachment's chip, from Nerd Fonts as the statusline mod's branch icon
// is: Font Awesome's file outlines, and Octicons' binary file. A font without them draws a box.
export const GLYPHS: Record<FileType, string> = {
  text: '\uf0f6', // nf-fa-file_text_o
  code: '\uf1c9', // nf-fa-file_code_o
  image: '\uf1c5', // nf-fa-file_image_o
  video: '\uf1c8', // nf-fa-file_video_o
  audio: '\uf1c7', // nf-fa-file_audio_o
  pdf: '\uf1c1', // nf-fa-file_pdf_o
  document: '\uf1c2', // nf-fa-file_word_o
  spreadsheet: '\uf1c3', // nf-fa-file_excel_o
  slides: '\uf1c4', // nf-fa-file_powerpoint_o
  archive: '\uf1c6', // nf-fa-file_archive_o
  binary: '\uf471', // nf-oct-file_binary
  folder: '\uf114', // nf-fa-folder_o
  paste: '\uf0ea', // nf-fa-clipboard
  unknown: '\uf016', // nf-fa-file_o
}

// Every color is a key of Claude Code's theme, so the chips follow whatever `/theme` picks, light
// or dark. The keys are chosen for their color in the built-in themes as much as for their meaning.
export const theme = {
  chip: 'userMessageBackground',
  glyphs: {
    text: 'text',
    code: 'success',
    image: 'suggestion',
    video: 'autoAccept',
    audio: 'planMode',
    pdf: 'error',
    document: 'suggestion',
    spreadsheet: 'success',
    slides: 'claude',
    archive: 'bashBorder',
    binary: 'inactive',
    folder: 'claude',
    paste: 'warning',
    unknown: 'inactive',
  } satisfies Record<FileType, string>,
}
