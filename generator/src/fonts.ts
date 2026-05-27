
// Manifest and helpers for bundled Google Fonts

import type {CoverSchema} from './schema.js'
import FONT_MANIFEST from './generated/font_manifest.json' with {type: 'json'}

/** A font bundled in generator/assets/fonts/ */
export interface BundledFont {
    // Font family name exactly as typst expects (e.g. 'Playfair Display')
    family:string
    // Category group shown as subheading in the font chooser UI
    group:string
    // TTF filenames in the font's directory (e.g. ['PlayfairDisplay-Regular.ttf', ...])
    files:string[]
    // Filename of the 400-weight file for preview rendering
    preview_file:string
}

// All bundled fonts — Noto Serif (base font) is always first
export const BUNDLED_FONTS:BundledFont[] = FONT_MANIFEST

// Return a deep copy of the bundled fonts list so callers cannot mutate the original
export function get_fonts():BundledFont[] {
    return BUNDLED_FONTS.map(f => ({...f, files: [...f.files]}))
}

// Index by family name for fast lookup
const by_family = new Map(BUNDLED_FONTS.map(f => [f.family, f]))

// Look up a bundled font by its family name
export function get_bundled_font(family:string):BundledFont | undefined {
    return by_family.get(family)
}

// The base font family (always first in the manifest)
export const BASE_FONT = BUNDLED_FONTS[0].family

// Collect all unique font families needed for a schema (base font always included first)
export function collect_fonts(schema:CoverSchema):string[] {
    const custom_families = [...new Set(
        [
            schema.title1_font, schema.title2_font, schema.title3_font,
            schema.subtitle_font, schema.author_font, schema.blurb_font,
            schema.spine_title_font, schema.spine_author_font,
        ]
            .filter(Boolean)
            .map(f => f!.family)
    )].sort()
    return [BASE_FONT, ...custom_families.filter(f => f !== BASE_FONT)]
}

// Check whether every font in the schema is available as a bundled font
export function all_fonts_bundled(schema:CoverSchema):boolean {
    return collect_fonts(schema).every(f => by_family.has(f))
}
