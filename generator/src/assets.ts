
// Resolve paths to files in the repo's top-level assets/ tree (deployed to the public assets
// bucket) relative to a consumer-provided base

// Join path segments with '/' — works for both filesystem paths and URLs
export function asset_path(base:string, ...segments:string[]):string {
    return [base.replace(/\/+$/, ''), ...segments].join('/')
}

// Asset subdirectory names
export const FRAMES_DIR = 'frames'
export const BACKGROUNDS_DIR = 'backgrounds'
