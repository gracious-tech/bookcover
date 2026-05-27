
// Resolve final color and font values, applying defaults where fields are omitted

import chroma from 'chroma-js'
import type {CoverSchema} from './schema.js'


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

/**
 * Resolve all font family strings from schema.
 * Each field falls back through: per-field font → category default → body font.
 */
export function resolve_font_families(schema:CoverSchema):{
    body:string
    title1:string
    title2:string
    title3:string
    subtitle:string
    author:string
    blurb:string
    spine_title:string
    spine_author:string
} {
    const body = BODY_FONT
    const title1 = schema.title1_font?.family ?? body
    // Title 2/3 fall back to title 1's font
    const title2 = schema.title2_font?.family ?? title1
    const title3 = schema.title3_font?.family ?? title1
    const subtitle = schema.subtitle_font?.family ?? body
    // Author font falls back to subtitle font when not set independently
    const author = schema.author_font?.family ?? subtitle
    const blurb = schema.blurb_font?.family ?? body
    // Spine falls back to corresponding front fonts
    const spine_title = schema.spine_title_font?.family ?? title1
    const spine_author = schema.spine_author_font?.family ?? subtitle
    return {body, title1, title2, title3, subtitle, author, blurb, spine_title, spine_author}
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
