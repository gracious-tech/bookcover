
// Resolve paths to files in generator/assets/ relative to a consumer-provided base

// Join path segments with '/' — works for both filesystem paths and URLs
export function asset_path(base:string, ...segments:string[]):string {
    return [base.replace(/\/+$/, ''), ...segments].join('/')
}

// Asset subdirectory names
export const FRAMES_DIR = 'frames'
export const BACKGROUNDS_DIR = 'backgrounds'
export const TYPST_DIR = 'typst'

// Template filenames within assets/typst/
export const TEMPLATE_FILES = {
    cover: 'cover.typ',
    helpers: '_helpers.typ',
} as const
