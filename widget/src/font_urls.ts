
// Shared URL helpers for the separately-published fonts/ tree (curated + Noto fallback)

// In production fonts are fetched from fonts.paper.bible; in dev, from the local fonts/ dir
// via the public/fonts symlink (run .bin/download_fonts / .bin/download_fonts_noto first)
export const fonts_prefix = import.meta.env.PROD
    ? 'https://fonts.paper.bible'
    : new URL('/fonts/', window.location.href).href

// URL of a curated font's file within the published fonts tree (fonts_prefix/<family>/<file>)
export function bundled_font_url(family:string, file:string):string {
    return `${fonts_prefix.replace(/\/+$/, '')}/${encodeURIComponent(family)}/${file}`
}
