
// Resolve final color and font values, applying defaults where fields are omitted

import chroma from 'chroma-js'
import type {CoverSchema, FontConfig} from './schema.js'


// Baseline default colors — pure grays map to clean CMYK K-channel percentages
// (e.g. hsl(0deg,0%,20%) = K80%, hsl(0deg,0%,10%) = K90%) for predictable print output
// Format hsl(Hdeg, S%, L%) is valid in both CSS4 and Typst's color.hsl()
const COLOR_DEFAULTS = {
    front_background: 'hsl(0deg, 0%, 100%)',   // K=0%  (white)
    back_background: 'hsl(0deg, 0%, 100%)',     // K=0%  (white)
    spine_background: 'hsl(0deg, 0%, 20%)',     // K=80%
    front_subtitle: 'hsl(0deg, 0%, 20%)',       // K=80%
    front_author: 'hsl(0deg, 0%, 20%)',         // K=80%
    blurb: 'hsl(0deg, 0%, 10%)',                // K=90%
    spine_title: 'hsl(0deg, 0%, 100%)',         // K=0%  (white)
    spine_author: 'hsl(0deg, 0%, 85%)',         // K=15%
    accent: 'hsl(0deg, 0%, 20%)',               // K=80%
}

export interface ResolvedColors {
    front_background:string
    front_gradient_start:string
    front_gradient_end:string
    back_background:string
    spine_background:string | null  // null → none in Typst (spine uses primary color)
    front_title1:string             // Auto-contrast (white/black) when not specified
    front_title2:string             // Defaults to front_title1
    front_title3:string             // Defaults to front_title1
    front_subtitle:string
    front_author:string
    blurb:string
    blurb_background:string | null  // null = transparent (no fill)
    spine_title:string
    spine_author:string
    accent:string
}

/** Parse an hsl(Hdeg, S%, L%) string into a chroma Color instance */
function from_hsl(hsl_str:string):chroma.Color {
    const m = hsl_str.match(/hsl\((\d+(?:\.\d+)?)deg,\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%\)/)
    if (!m) throw new Error(`Invalid HSL color: ${hsl_str}`)
    return chroma.hsl(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100)
}

/** Parse any supported color string — HSL format or hex/named via chroma */
function parse_color(str:string):chroma.Color {
    return str.startsWith('hsl(') ? from_hsl(str) : chroma(str)
}

/** Serialize a chroma Color instance to an hsl(Hdeg, S%, L%) string */
function to_hsl(c:chroma.Color):string {
    const [h, s, l] = c.hsl()
    // Hue is NaN for achromatic colors; normalise to 0
    return `hsl(${Math.round(h || 0)}deg, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
}

/** Shift the hue of an HSL color by a fixed number of degrees (also less saturated) */
function shift_hue(hsl_str:string, degrees:number):string {
    const c = from_hsl(hsl_str)
    const [h, s, l] = c.hsl()
    return to_hsl(chroma.hsl(((h || 0) + degrees + 360) % 360, s - 0.4, l))
}

export type PaletteScheme = 'triadic' | 'analogous' | 'split_complementary' | 'complementary'

// Fixed hue offsets (degrees from the base hue) per harmony scheme
const PALETTE_HUE_OFFSETS:Record<PaletteScheme, number[]> = {
    triadic: [0, 120, 240],
    analogous: [0, -30, 30, -60],
    split_complementary: [0, 150, 210],
    complementary: [0, 180],
}

// Clamp bands applied to every generated palette color, regardless of the base color's own
// S/L — keeps the palette visibly colorful even when the base is near-white or near-black
const PALETTE_SATURATION_RANGE:[number, number] = [0.4, 0.65]
const PALETTE_LIGHTNESS_RANGE:[number, number] = [0.35, 0.65]

/**
 * Derive `count` aesthetically-harmonious hex colors from a base color (hex or hsl() string),
 * using a fixed hue-harmony scheme. Saturation/lightness are clamped into a mid-range band so
 * the palette stays visibly colorful even when the base is near-white or near-black.
 */
export function generate_palette(base:string, count:number, scheme:PaletteScheme):string[] {
    const [base_h] = parse_color(base).hsl()
    const hue = base_h || 0
    const offsets = PALETTE_HUE_OFFSETS[scheme]
    const colors:string[] = []
    for (let i = 0; i < count; i++) {
        const offset = offsets[i % offsets.length]
        // Extra cycles past the scheme's natural hue count vary lightness instead of repeating
        // the same tone verbatim, so a design asking for more colors than the scheme provides
        // still gets a tint/shade rather than a visible duplicate
        const cycle = Math.floor(i / offsets.length)
        const h = (hue + offset + 360) % 360
        const s = PALETTE_SATURATION_RANGE[0]
            + (PALETTE_SATURATION_RANGE[1] - PALETTE_SATURATION_RANGE[0]) * 0.5
        const l_mid = PALETTE_LIGHTNESS_RANGE[0]
            + (PALETTE_LIGHTNESS_RANGE[1] - PALETTE_LIGHTNESS_RANGE[0]) * 0.5
        const l_step = cycle % 2 === 0 ? 1 : -1
        const l = Math.min(
            PALETTE_LIGHTNESS_RANGE[1],
            Math.max(PALETTE_LIGHTNESS_RANGE[0], l_mid + l_step * cycle * 0.1),
        )
        colors.push(chroma.hsl(h, s, l).hex())
    }
    return colors
}

/** Return white or near-black, whichever has more WCAG contrast against the given background */
function auto_contrast_text(bg:string):string {
    const L = from_hsl(bg).luminance()
    const contrast_white = 1.05 / (L + 0.05)
    const contrast_black = (L + 0.05) / 0.05
    return contrast_white >= contrast_black
        ? 'hsl(0deg, 0%, 100%)'  // white — better on dark backgrounds
        : 'hsl(0deg, 0%, 10%)'   // near-black (K90% for print)
}

/** Merge user-supplied colors with defaults, deriving related fields when possible */
export function resolve_colors(schema:CoverSchema):ResolvedColors {
    const accent = COLOR_DEFAULTS.accent
    const front_bg = schema.bg_color ?? COLOR_DEFAULTS.front_background

    // Blurb background: null = transparent, undefined = derive from front background
    const blurb_bg = schema.blurb_bg_color === null
        ? null
        : schema.blurb_bg_color ?? schema.bg_color ?? COLOR_DEFAULTS.back_background

    // Title colors: auto-contrast default for title1; title2/3 inherit title1's color
    const title1 = schema.title1_color ?? auto_contrast_text(front_bg)
    const title2 = schema.title2_color ?? title1
    const title3 = schema.title3_color ?? title1

    return {
        front_background: front_bg,
        // Gradient stops: hue shifted ±35° from the base front color
        front_gradient_start: shift_hue(front_bg, 35),
        front_gradient_end: shift_hue(front_bg, -35),
        // Back background falls back to front background
        back_background: schema.bg_color ?? COLOR_DEFAULTS.back_background,
        // Spine background: null = no separate spine color; undefined = fall back to accent
        spine_background: schema.spine_color === undefined ? accent : schema.spine_color,
        front_title1: title1,
        front_title2: title2,
        front_title3: title3,
        front_subtitle: schema.subtitle_color ?? COLOR_DEFAULTS.front_subtitle,
        front_author: schema.author_color ?? COLOR_DEFAULTS.front_author,
        blurb: schema.blurb_color ?? COLOR_DEFAULTS.blurb,
        blurb_background: blurb_bg,
        spine_title: schema.spine_title_color ?? COLOR_DEFAULTS.spine_title,
        spine_author: schema.spine_author_color ?? COLOR_DEFAULTS.spine_author,
        accent,
    }
}

// Base font: always Noto Serif (downloaded at runtime; not bundled with typst)
const BODY_FONT = 'Noto Serif'

/** Per-field resolved font configs — the single source of the font inheritance chain */
export interface ResolvedFontConfigs {
    body:FontConfig
    title1:FontConfig
    title2:FontConfig
    title3:FontConfig
    subtitle:FontConfig
    author:FontConfig
    blurb:FontConfig
    spine_title:FontConfig
    spine_author:FontConfig
}

/**
 * Resolve each text field's effective font config (family + optional serif/sans style).
 * Each field falls back through: per-field font → category default → body font.
 */
export function resolve_font_configs(schema:CoverSchema):ResolvedFontConfigs {
    const body:FontConfig = {family: BODY_FONT}
    const title1 = schema.title1_font ?? body
    // Title 2/3 fall back to title 1's font
    const title2 = schema.title2_font ?? title1
    const title3 = schema.title3_font ?? title1
    const subtitle = schema.subtitle_font ?? body
    // Author font falls back to subtitle font when not set independently
    const author = schema.author_font ?? subtitle
    const blurb = schema.blurb_font ?? body
    // Spine falls back to corresponding front fonts
    const spine_title = schema.spine_title_font ?? title1
    const spine_author = schema.spine_author_font ?? subtitle
    return {body, title1, title2, title3, subtitle, author, blurb, spine_title, spine_author}
}

/** Resolve all font family strings from schema (family names of resolve_font_configs) */
export function resolve_font_families(schema:CoverSchema):Record<keyof ResolvedFontConfigs, string> {
    const configs = resolve_font_configs(schema)
    return Object.fromEntries(
        Object.entries(configs).map(([field, config]) => [field, config.family])
    ) as Record<keyof ResolvedFontConfigs, string>
}

/**
 * Darken an HSL color by compositing black on top at the given opacity.
 * Equivalent to the original darken_hex: RGB channels × (1 − opacity).
 */
export function darken_hsl(hsl_str:string, opacity:number):string {
    return to_hsl(chroma.mix(from_hsl(hsl_str), '#000000', opacity, 'rgb'))
}

/** Mix two colors (HSL format or hex) — t=0 returns a, t=1 returns b */
export function mix_hsl(a:string, b:string, t:number):string {
    return to_hsl(chroma.mix(parse_color(a), parse_color(b), t, 'rgb'))
}
