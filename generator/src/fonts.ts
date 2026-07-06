
// Manifest and helpers for the curated, bundled Google Fonts

import type {CoverSchema, FontConfig} from './schema.js'
import FONT_MANIFEST from './generated/font_manifest.json' with {type: 'json'}
import {resolve_fallback_chain, detect_cjk_variant, field_cjk_variant} from './noto_fonts.js'
import type {CjkVariant, FontStyle} from './noto_fonts.js'
import {resolve_font_configs} from './design.js'
import {default_spine_title} from './utils.js'

/** A font bundled in the top-level fonts/ directory */
export interface BundledFont {
    // Font family name exactly as typst expects (e.g. 'Playfair Display')
    family:string
    // Category group shown as subheading in the font chooser UI
    group:string
    // Serif/sans classification — decides which style of Noto fallback pairs with this font
    style:FontStyle
    // TTF filenames in the font's directory (e.g. ['PlayfairDisplay-Regular.ttf', ...])
    files:string[]
    // Filename of the 400-weight file for preview rendering
    preview_file:string
}

// All bundled fonts — Noto Serif (base font) is always first (JSON import widens the
// style enum to string, hence the cast)
export const BUNDLED_FONTS:BundledFont[] = FONT_MANIFEST as unknown as BundledFont[]

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

// All of a schema's free-form text fields, for CJK-variant detection. spine_title/
// spine_author fall back to '' rather than their derived defaults (title1-3 + author) since
// those defaults are just a recombination of text already scanned via the other fields.
function schema_texts(schema:CoverSchema):string[] {
    return [
        schema.title1, schema.title2, schema.title3, schema.subtitle,
        schema.author, schema.blurb, schema.spine_title ?? '', schema.spine_author ?? '',
    ]
}

// Resolve the cover-wide default region for Han-ONLY text (sentences with kana or Hangul
// always resolve to JP/KR at segment level regardless): an explicit setting wins; 'auto'
// (or unset) infers the region from the schema's own text (kana anywhere → JP, Hangul → KR,
// then Han character evidence, otherwise SC)
export function resolve_cjk_variant(schema:CoverSchema):CjkVariant {
    if (schema.cjk_variant && schema.cjk_variant !== 'auto')
        return schema.cjk_variant
    return detect_cjk_variant(schema_texts(schema).map(t => t ?? '').join('\n'))
}

// Resolve the Han-only tiebreaker region for one field's text: an explicit setting applies
// cover-wide, while in auto mode each field's own text decides (falling back to the
// cover-wide detection only when the field carries no language signal of its own)
export function resolve_field_cjk_variant(schema:CoverSchema, text:string):CjkVariant {
    if (schema.cjk_variant && schema.cjk_variant !== 'auto')
        return schema.cjk_variant
    return field_cjk_variant(text, resolve_cjk_variant(schema))
}

// Resolve the serif/sans style of a chosen font: an explicit style (set for custom fonts,
// which aren't in the curated manifest) wins, then the manifest's classification, defaulting
// to serif (book covers skew serif, and the base font is Noto Serif)
export function font_style(family:string, explicit?:FontStyle):FontStyle {
    return explicit ?? by_family.get(family)?.style ?? 'serif'
}

// Each text field paired with its resolved font config, mirroring exactly what build() puts
// in the per-field Typst font chains. Spine text uses its real derived defaults (not '')
// because the spine's own font style decides which Noto fallback its chain references.
function schema_fields(schema:CoverSchema):{text:string, config:FontConfig}[] {
    const configs = resolve_font_configs(schema)
    return [
        {text: schema.title1 ?? '', config: configs.title1},
        {text: schema.title2 ?? '', config: configs.title2},
        {text: schema.title3 ?? '', config: configs.title3},
        {text: schema.subtitle ?? '', config: configs.subtitle},
        {text: schema.author ?? '', config: configs.author},
        {text: schema.blurb ?? '', config: configs.blurb},
        {
            text: schema.spine_title
                ?? default_spine_title(schema.title1, schema.title2, schema.title3),
            config: configs.spine_title,
        },
        {text: schema.spine_author ?? schema.author ?? '', config: configs.spine_author},
    ]
}

// Every Noto fallback family the schema's per-field font chains reference, in stable field
// order: each field's detected scripts resolve to the field font's own style (serif or sans),
// with the other style used only when Noto has no coverage in the preferred one; Han-only
// sentences tiebreak against the field's own region (resolve_field_cjk_variant)
export function collect_fallback_fonts(schema:CoverSchema):string[] {
    const fallback = new Set<string>()
    for (const {text, config} of schema_fields(schema)) {
        const style = font_style(config.family, config.style)
        const cjk_variant = resolve_field_cjk_variant(schema, text)
        for (const family of resolve_fallback_chain(text, cjk_variant, style))
            fallback.add(family)
    }
    return [...fallback]
}

// Collect every font family a schema needs to render correctly: explicit font choices (as
// collect_fonts()) plus every Noto fallback family the per-field font chains reference.
// This is the source of truth both generator-node and generator-web use to know exactly
// which font files a given generate() call needs.
export function collect_all_fonts(schema:CoverSchema):string[] {
    const chosen = collect_fonts(schema)
    return [...chosen, ...collect_fallback_fonts(schema).filter(f => !chosen.includes(f))]
}
