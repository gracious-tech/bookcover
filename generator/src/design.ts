
// Resolve final color and font values, applying defaults where fields are omitted

import chroma from 'chroma-js'
import type {CoverSchema, FontConfig, TitlePosition} from './schema.js'
import {hex_override_to_hsl} from './colors.js'


// Baseline default colors — pure grays map to clean CMYK K-channel percentages
// (e.g. hsl(0deg,0%,20%) = K80%, hsl(0deg,0%,10%) = K90%) for predictable print output
// Format hsl(Hdeg, S%, L%) is valid in both CSS4 and Typst's color.hsl(). Every other color
// field is now contrast-derived against whatever it actually sits on (see resolve_colors) —
// these two are the only values with nothing to contrast against yet.
const COLOR_DEFAULTS = {
    front_background: 'hsl(0deg, 0%, 100%)',   // K=0%  (white) — imageless, colorless base case
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

export type PaletteScheme = 'triadic' | 'analogous' | 'split_complementary' | 'complementary' | 'accent_tones'

// Fixed hue offsets (degrees from the base hue) per harmony scheme
const PALETTE_HUE_OFFSETS:Record<Exclude<PaletteScheme, 'accent_tones'>, number[]> = {
    triadic: [0, 120, 240],
    analogous: [0, -30, 30, -60],
    split_complementary: [0, 150, 210],
    complementary: [0, 180],
}

// Clamp bands applied to every generated palette color, regardless of the base color's own
// S/L — keeps the palette visibly colorful even when the base is near-white or near-black
const PALETTE_SATURATION_RANGE:[number, number] = [0.4, 0.65]
const PALETTE_LIGHTNESS_RANGE:[number, number] = [0.35, 0.65]

// Per-tone hue offset/saturation/lightness for the 'accent_tones' scheme, tuned by eye against
// the curated vector-background pattern set (see vector_backgrounds.ts) — one warm-ish primary
// tone plus two supporting tones rather than an evenly-spaced hue wheel
const ACCENT_TONES:{dh:number, s:number, l:number}[] = [
    {dh: 0, s: 0.44, l: 0.30},
    {dh: -55, s: 0.36, l: 0.44},
    {dh: 45, s: 0.32, l: 0.60},
]
const ACCENT_TONE_MIX = 0.3 // softens each tone by mixing this fraction of the base color back in
const ACCENT_DARK_LIGHTNESS_THRESHOLD = 0.45 // base lighter than this counts as a "light" base
const ACCENT_DARK_LIGHTNESS_BOOST = 0.28 // extra lightness added to each tone against a dark base
const ACCENT_DARK_LIGHTNESS_CAP = 0.82
const ACCENT_DARK_MIX_TARGET_WHITE = 0.35 // against a dark base, soften toward this much white instead

/**
 * Derive 'accent_tones' colors — a small fixed set of tones (see ACCENT_TONES) rather than an
 * evenly-spaced hue-harmony wheel, each softened by mixing back toward the base color so the
 * result reads as coordinated with it rather than clashing. Against a dark base, tones are
 * boosted lighter and mixed toward white instead, so pattern fills stay legible.
 */
function generate_accent_tones(base:string, count:number):string[] {
    const base_color = parse_color(base)
    const [base_h, , base_l] = base_color.hsl()
    const hue = base_h || 0
    const is_dark = (base_l || 0) < ACCENT_DARK_LIGHTNESS_THRESHOLD
    const mix_target = is_dark ? chroma.mix(base_color, '#ffffff', ACCENT_DARK_MIX_TARGET_WHITE, 'rgb') : base_color
    const colors:string[] = []
    for (let i = 0; i < count; i++) {
        const tone = ACCENT_TONES[i % ACCENT_TONES.length]
        const l = is_dark ? Math.min(ACCENT_DARK_LIGHTNESS_CAP, tone.l + ACCENT_DARK_LIGHTNESS_BOOST) : tone.l
        const tone_color = chroma.hsl((hue + tone.dh + 360) % 360, tone.s, l)
        colors.push(chroma.mix(tone_color, mix_target, ACCENT_TONE_MIX, 'rgb').hex())
    }
    return colors
}

/**
 * Derive `count` aesthetically-harmonious hex colors from a base color (hex or hsl() string).
 * The 'accent_tones' scheme uses a fixed tuned tone set (see generate_accent_tones); the other
 * schemes use a hue-harmony wheel, with saturation/lightness clamped into a mid-range band so
 * the palette stays visibly colorful even when the base is near-white or near-black.
 */
export function generate_palette(base:string, count:number, scheme:PaletteScheme):string[] {
    if (scheme === 'accent_tones') return generate_accent_tones(base, count)
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

/** True when white text has more WCAG contrast than black against this color */
function is_dark(c:chroma.Color):boolean {
    const L = c.luminance()
    const contrast_white = 1.05 / (L + 0.05)
    const contrast_black = (L + 0.05) / 0.05
    return contrast_white >= contrast_black
}

/** Return white or near-black, whichever has more WCAG contrast against the given background */
function auto_contrast_text(bg:string):string {
    return is_dark(from_hsl(bg))
        ? 'hsl(0deg, 0%, 100%)'  // white — better on dark backgrounds
        : 'hsl(0deg, 0%, 10%)'   // near-black (K90% for print)
}

/** Same contrast choice as auto_contrast_text, but hex-in/hex-out — for callers (pick_vivid_tint)
 *  that need to stay in hex rather than the hsl(Hdeg, S%, L%) string format */
function auto_contrast_hex(bg_hex:string):string {
    const white = chroma.hsl(0, 0, 1)
    const black = chroma.hsl(0, 0, 0.1)
    const bg = chroma(bg_hex)
    return (contrast_ratio(white, bg) >= contrast_ratio(black, bg) ? white : black).hex()
}

// A dominant color sampled from one region of a background image — hue 0-360deg,
// saturation/lightness as 0-1 fractions (chroma's convention, matching the rest of this file).
// lightness_spread is the standard deviation of per-pixel lightness within the region (0 for a
// synthetic/flat color) — a region containing both light and dark areas isn't well represented
// by its average alone, so it's used to demand more contrast in those regions
export interface RegionStats {
    hue:number
    saturation:number
    lightness:number
    lightness_spread:number
}

// Saturation clamp bands for image-derived colors — floor keeps even a fairly gray region
// visibly tinted, ceiling avoids inventing more color than the source photo actually has
const TINT_SATURATION_RANGE:[number, number] = [0.35, 0.7]
const FILL_SATURATION_RANGE:[number, number] = [0.25, 0.55]
const FILL_LIGHT_BAND:[number, number] = [0.75, 0.9]
const FILL_DARK_BAND:[number, number] = [0.15, 0.3]
// Below this average source lightness, synthesize_fill picks the dark band; at or above it,
// the light band. Set well under 0.5 so the light variant wins for most images.
const FILL_DARK_THRESHOLD = 0.3
// Below this average source lightness, the image reads as essentially black — synthesize_fill
// goes straight to true black instead of its usual dark band, since a near-black source has no
// real hue signal to preserve (any surviving tint is rounding noise, not a color choice) and the
// dark band's ~22% lightness would still show as a washed gray rather than a rich black. Matches
// the near-black backdrop cutoff pick_vivid_tint already uses (EXTREME_BACKDROP_LIGHTNESS).
const FILL_BLACK_THRESHOLD = 0.1
// A source counts as achromatic (no real hue to pull from — e.g. a black & white photo) below
// this saturation; shared by the black check above and the tint-floor clamp below
const ACHROMATIC_SATURATION_THRESHOLD = 0.03
// A warm hue (red through amber) pushed dark reads as a flat, muddy brown rather than a rich
// dark color, no matter how saturated the source actually was — the same perceptual issue
// MUDDY_HUE_RANGE/is_muddy_when_dark encodes below for text color, just not yet applied to
// fills, and wider here to reach true reds (hue 0), which are if anything worse offenders than
// the amber/gold range that function targets. A source that's both quite dark and vividly
// warm-hued has nothing to gain from round-tripping through that muddy midtone, so
// synthesize_fill sends it straight to true black instead — but only once it's genuinely vivid
// (VIVID_WARM_SATURATION_FLOOR): a dull dark warm source (e.g. a duskily-lit brown plant photo)
// is left alone, since forcing that to black would be a bigger departure from the source than
// the muddy tint it currently gets.
const VIVID_WARM_LIGHTNESS_CAP = 0.15
const VIVID_WARM_HUE_RANGE:[number, number] = [0, 50]
const VIVID_WARM_SATURATION_FLOOR = 0.65

/** Build a hex color from a RegionStats triple */
export function region_hex(region:RegionStats):string {
    return chroma.hsl(region.hue, region.saturation, region.lightness).hex()
}

/** Blend two sampled regions — saturation-weighted circular mean for hue (biases toward the
 *  more colorful of the two), plain mean for saturation/lightness. Used for text positioned
 *  between two sampled regions (e.g. 'middle'), which isn't backed by either one directly. */
export function blend_regions(a:RegionStats, b:RegionStats):RegionStats {
    const to_rad = (deg:number) => deg * Math.PI / 180
    const x = Math.cos(to_rad(a.hue)) * a.saturation + Math.cos(to_rad(b.hue)) * b.saturation
    const y = Math.sin(to_rad(a.hue)) * a.saturation + Math.sin(to_rad(b.hue)) * b.saturation
    const hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
    return {
        hue: (x === 0 && y === 0) ? a.hue : hue,
        saturation: (a.saturation + b.saturation) / 2,
        lightness: (a.lightness + b.lightness) / 2,
        // Also account for how far apart the two regions' own lightness is — blending a light
        // region with a dark one is itself a source of "spread" beyond each region's own
        lightness_spread: (a.lightness_spread + b.lightness_spread) / 2 + Math.abs(a.lightness - b.lightness) / 2,
    }
}

/** WCAG contrast ratio between two colors (same formula as auto_contrast_text, generalized) */
function contrast_ratio(a:chroma.Color, b:chroma.Color):number {
    const La = a.luminance()
    const Lb = b.luminance()
    const [l_max, l_min] = La >= Lb ? [La, Lb] : [Lb, La]
    return (l_max + 0.05) / (l_min + 0.05)
}

/**
 * Preserve the given hue+saturation and find the least-extreme lightness (closest to 50%, i.e.
 * most colorful) that still clears `min_contrast` against `bg_hex` — unlike auto_contrast_text,
 * which always jumps straight to pure white/near-black. Contrast against a fixed background is
 * unimodal in lightness, and both extremes (L=0/L=1) degenerate to pure black/white regardless
 * of hue/saturation, so a bisection toward each extreme converges whenever the target is
 * achievable at all. It isn't always: WCAG guarantees max(contrast_white, contrast_black) >=
 * ~4.58 for any background, but that's a floor, not a ceiling — a mid-dark-gray background can
 * cap out well below a demanding `min_contrast` (e.g. ~7+) even at pure black or white. In that
 * case this falls back to whichever extreme gets closest, same as auto_contrast_text would.
 */
export function tinted_contrast_text(hue:number, saturation:number, bg_hex:string, min_contrast = 4.5):string {
    const bg = chroma(bg_hex)
    const candidate = (l:number) => chroma.hsl(hue, saturation, l)
    const contrast_at = (l:number) => contrast_ratio(candidate(l), bg)

    if (contrast_at(0.5) >= min_contrast)
        return candidate(0.5).hex()

    // Bisect toward an extreme for the least-extreme lightness that clears min_contrast — but
    // only if the extreme itself actually clears it; otherwise the target isn't reachable here
    const search_toward = (extreme:number):number | null => {
        if (contrast_at(extreme) < min_contrast) return null
        let good = extreme
        let bad = 0.5
        for (let i = 0; i < 20; i++) {
            const mid = (good + bad) / 2
            if (contrast_at(mid) >= min_contrast) good = mid
            else bad = mid
        }
        return good
    }
    const light = search_toward(1)
    const dark = search_toward(0)
    if (light === null && dark === null)
        return (contrast_at(1) >= contrast_at(0) ? candidate(1) : candidate(0)).hex()
    if (light === null) return candidate(dark as number).hex()
    if (dark === null) return candidate(light).hex()
    const l = Math.abs(light - 0.5) <= Math.abs(dark - 0.5) ? light : dark
    return candidate(l).hex()
}

// Warm hues (sand, sunset gold, terracotta) read as "brown" the instant they're forced dark —
// HSL's saturation number doesn't track this, a fully-saturated dark orange still perceptually
// reads as brown/dirty, not as a rich dark color — so these are muddy at any saturation.
const MUDDY_HUE_RANGE:[number, number] = [20, 75]
// Outside that warm band, only a washed-out/low-saturation hue pushed dark reads as dull and
// dirty rather than a rich dark color (hazy slate-blue vs. a true navy) — a well-saturated cool
// hue (navy, forest green) still looks intentional and elegant even when dark
const MUDDY_SATURATION_CEILING = 0.55
const MUDDY_DARK_LIGHTNESS_CEILING = 0.4
// Large enough that a muddy candidate only wins when clearly more vivid than every alternative
const MUDDY_PENALTY = 0.3

/** True when a candidate's resulting color would land in "dirty"/muddy territory: a warm hue,
 *  or any under-saturated hue, pushed dark for contrast rather than landing on a rich dark tone */
function is_muddy_when_dark(hue:number, saturation:number, resulting_lightness:number):boolean {
    if (resulting_lightness > MUDDY_DARK_LIGHTNESS_CEILING) return false
    const is_warm = hue >= MUDDY_HUE_RANGE[0] && hue <= MUDDY_HUE_RANGE[1]
    return is_warm || saturation <= MUDDY_SATURATION_CEILING
}

// Backdrop lightness range outside which a hue search is skipped entirely (see pick_vivid_tint)
const EXTREME_BACKDROP_LIGHTNESS:[number, number] = [0.1, 0.9]

/**
 * Cross-region hue search for text color: try each candidate region's hue against the given
 * backdrop, plus a plain grayscale option, and keep whichever produces the most vivid (least
 * contrast-compromised) still-readable result. Regions aren't treated as isolated — e.g. text
 * over a pale sky can legitimately borrow a saturated hue from a dark sea elsewhere in the same
 * photo, if that reads better than darkening the sky's own washed-out hue. Candidates that
 * would land in muddy/dirty territory (a washed-out hue forced dark) are penalized, whichever
 * region they come from, so a cleaner alternative — another region's hue, or plain grayscale —
 * wins unless the muddy option is clearly the most vivid available. Ties (within ~1% lightness)
 * favor the backdrop's own region over the plain grayscale fallback, to avoid gratuitous
 * cross-borrowing when it doesn't actually help.
 *
 * Against a near-black or near-white backdrop, this whole search breaks down: almost any hue
 * already clears contrast at 50% lightness without ever being pushed toward an extreme, so it
 * "wins" on the deviation metric below despite reading as a washed, dull mid-tone — and the
 * muddy check never even applies, since that only fires once a candidate is forced dark. A
 * backdrop this stark calls for plain black/white, so the hue search is skipped outright.
 */
export function pick_vivid_tint(candidates:RegionStats[], backdrop:RegionStats, min_contrast = 4.5):string {
    const backdrop_hex = region_hex(backdrop)
    if (backdrop.lightness < EXTREME_BACKDROP_LIGHTNESS[0] || backdrop.lightness > EXTREME_BACKDROP_LIGHTNESS[1])
        return auto_contrast_hex(backdrop_hex)
    const TIE_EPSILON = 0.01
    const grayscale:RegionStats = {hue: 0, saturation: 0, lightness: 0.5, lightness_spread: 0}
    const pool = [...candidates, grayscale]
    const scored = pool.map(region => {
        // The synthetic grayscale entry must stay at 0 saturation — clamping it into the tint
        // band like a real candidate would turn it into a hue=0 (red) color instead of neutral
        const sat = region === grayscale ? 0
            : Math.min(TINT_SATURATION_RANGE[1], Math.max(TINT_SATURATION_RANGE[0], region.saturation))
        // The grayscale fallback goes straight to black/white rather than through
        // tinted_contrast_text — at 0 saturation that can plateau at an actual mid-gray (l=0.5)
        // whenever plain gray already clears min_contrast, which reads as washed-out, not neutral
        const hex = region === grayscale
            ? auto_contrast_hex(backdrop_hex)
            : tinted_contrast_text(region.hue, sat, backdrop_hex, min_contrast)
        const lightness = chroma(hex).hsl()[2] || 0
        let deviation = Math.abs(lightness - 0.5)
        // The grayscale entry is the deliberate neutral fallback — its 0 saturation must never
        // trip the "washed-out hue" branch of is_muddy_when_dark, or it loses its safe-option
        // status and stops being able to beat real muddy candidates
        if (region !== grayscale && is_muddy_when_dark(region.hue, sat, lightness)) deviation += MUDDY_PENALTY
        return {region, hex, deviation}
    })
    let best = scored[0]
    for (const s of scored.slice(1)) {
        const clearly_better = s.deviation < best.deviation - TIE_EPSILON
        const tied_favors_backdrop = Math.abs(s.deviation - best.deviation) <= TIE_EPSILON
            && s.region === backdrop && best.region !== backdrop
        if (clearly_better || tied_favors_backdrop) best = s
    }
    return best.hex
}

/**
 * Derive a coordinating solid-fill color from sampled image regions — used wherever the image
 * itself isn't visible (bg_color, accent, and blurb/spine fills outside full-wrap coverage).
 * Picks the most saturated candidate as the hue source. With no `target_lightness`, clamps
 * lightness into a light or dark band depending on whether the candidates read light or dark
 * overall (for general fills); a fixed `target_lightness` near 0.5 gives a punchier, more
 * vivid result (for decorative accents).
 */
export function synthesize_fill(candidates:RegionStats[], target_lightness?:number):string {
    if (candidates.length === 0) return '#ffffff'
    const avg_l = candidates.reduce((sum, r) => sum + r.lightness, 0) / candidates.length
    const source = candidates.reduce((a, b) => (b.saturation > a.saturation ? b : a))
    // General fill only (not a punchier fixed-lightness accent) — true black wins over the
    // usual dark band in two cases: a near-black achromatic source (nothing to preserve — the
    // dark band would just show as washed gray), or a dark, vividly warm-hued source (nothing
    // to gain from preserving a hue that reads as muddy brown once forced dark; see
    // VIVID_WARM_HUE_RANGE above). Saturated-but-dark cool/mid hues (a deep navy, a forest
    // green) are left alone — they read as rich, intentional colors even when dark
    if (target_lightness === undefined) {
        const achromatic = avg_l < FILL_BLACK_THRESHOLD && source.saturation < ACHROMATIC_SATURATION_THRESHOLD
        const vivid_warm = avg_l < VIVID_WARM_LIGHTNESS_CAP
            && source.hue >= VIVID_WARM_HUE_RANGE[0] && source.hue <= VIVID_WARM_HUE_RANGE[1]
            && source.saturation > VIVID_WARM_SATURATION_FLOOR
        if (achromatic || vivid_warm)
            return '#000000'
    }
    // A genuinely achromatic source (e.g. a black & white photo) has no color to pull from —
    // clamping its saturation up to the tint floor would manufacture a fake hue instead
    const sat = source.saturation < ACHROMATIC_SATURATION_THRESHOLD ? 0
        : Math.min(FILL_SATURATION_RANGE[1], Math.max(FILL_SATURATION_RANGE[0], source.saturation))
    let l = target_lightness
    if (l === undefined) {
        const band = avg_l < FILL_DARK_THRESHOLD ? FILL_DARK_BAND : FILL_LIGHT_BAND
        l = (band[0] + band[1]) / 2
    }
    return chroma.hsl(source.hue, sat, l).hex()
}

// -- Image-derived color resolution --
//
// Everything below feeds resolve_colors(): given an optional ImageRegions sample of the
// background image, it derives a front_bg complement, a vivid image-sampled tint for front
// title/subtitle/author text, and — for every other field — auto-contrasts against whatever
// color it actually sits on (image-derived or not). This is the single place all of that math
// lives; build_schema() (the FormState → schema path, used by the widget) does no color
// derivation of its own — it passes user overrides straight through and leaves the rest unset
// for resolve_colors() to fill in here.

// Auto bg_color fallback for a vector background: there's no image to sample a complementary
// color from, so this fixed neutral tan stands in instead of the imageless default of white.
// Exported so callers previewing the auto color pre-generate (e.g. the widget's picker swatches)
// can match this without duplicating the value
export const VECTOR_BG_AUTO_COLOR = '#e1d1c4'

/** Colors sampled from the background image, keyed by where they were sampled from.
 *  front_top/front_bottom treat the whole image as the front panel — correct whenever the
 *  image is confined to the front panel (any bg_image_coverage besides 'full'). Under 'full'
 *  coverage the raw image is a full wrap (back+spine+front side by side), so front text should
 *  only look at the front panel's own portion of it, not the back/spine content alongside it —
 *  front_top_full/front_bottom_full and back/spine are that full-wrap interpretation, located
 *  proportionally within the same image (see analyze_pixel_regions in image_regions.ts). Both
 *  interpretations are always sampled together (when dims are resolvable) so switching
 *  bg_image_coverage never needs a recompute — it just picks which pair to use. */
export interface ImageRegions {
    front_top:RegionStats
    front_bottom:RegionStats
    front_top_full:RegionStats | null
    front_bottom_full:RegionStats | null
    back:RegionStats | null
    spine:RegionStats | null
}

/** Flatten an ImageRegions into every non-null sampled region — the candidate pool for
 *  synthesize_fill()'s "pick the most colorful region" bg-color derivation. */
export function all_image_regions(regions:ImageRegions):RegionStats[] {
    return [
        regions.front_top, regions.front_bottom,
        ...(regions.back ? [regions.back] : []),
        ...(regions.spine ? [regions.spine] : []),
    ]
}

/** Convert a chroma Color to a RegionStats triple (inverse of region_hex) — a flat synthesized
 *  color, so lightness_spread is 0 */
function color_to_region(c:chroma.Color):RegionStats {
    const [h, s, l] = c.hsl()
    return {hue: h || 0, saturation: s, lightness: l, lightness_spread: 0}
}

// Baseline contrast target per position — bottom-positioned text (author, usually) tends to sit
// over busier parts of a photo than top-positioned text (title, usually sky/simpler), so it
// gets a higher floor before any per-image variance is even factored in
const BASE_CONTRAST_BY_POSITION:Record<TitlePosition, number> = {top: 5.5, middle: 6, bottom: 7}
// Scales a region's measured lightness_spread into additional required contrast — a region
// that isn't visually uniform (text crossing both light and dark areas) needs more margin than
// its average color alone would suggest
const VARIANCE_CONTRAST_BOOST = 10

/** The contrast target for text at a given position against its resolved backdrop region */
function min_contrast_for(position:TitlePosition, backdrop:RegionStats):number {
    return BASE_CONTRAST_BY_POSITION[position] + backdrop.lightness_spread * VARIANCE_CONTRAST_BOOST
}

/** The front-panel top/bottom pair to use for text placement — the full-wrap interpretation
 *  under 'full' coverage (when it was resolvable), else the whole-image interpretation that
 *  every other coverage mode already needs */
function front_pair(coverage:string, regions:ImageRegions):{top:RegionStats, bottom:RegionStats} {
    if (coverage === 'full' && regions.front_top_full && regions.front_bottom_full)
        return {top: regions.front_top_full, bottom: regions.front_bottom_full}
    return {top: regions.front_top, bottom: regions.front_bottom}
}

/**
 * Resolve which sampled region a piece of front-panel text should be checked for contrast
 * against, given its vertical position and how the background image covers the front panel:
 * 'painted'/'feature' insets don't fill the panel, so text is assumed to sit on the front
 * background throughout; 'front_partial' only covers the bottom two-thirds, so top-positioned
 * text sits on the front background while middle/bottom sits on the image; any full-bleed-front
 * coverage maps top/bottom/middle directly onto the sampled regions (see front_pair for 'full').
 */
function image_backdrop_for_position(
    position:TitlePosition,
    coverage:string,
    regions:ImageRegions,
    bg_region:RegionStats,
):RegionStats {
    if (coverage === 'painted' || coverage === 'feature')
        return bg_region
    if (coverage === 'front_partial')
        return position === 'top' ? bg_region : regions.front_bottom
    const {top, bottom} = front_pair(coverage, regions)
    if (position === 'top') return top
    if (position === 'bottom') return bottom
    return blend_regions(top, bottom)
}

/**
 * Merge user-supplied schema colors with contrast-aware defaults, deriving every unset field
 * from whatever it actually sits on. image_regions, when provided, feeds a complementary
 * front_bg (when bg_color itself is unset) and a vivid image-sampled tint for front-panel
 * title/subtitle/author text (see pick_vivid_tint); every field falls through to plain
 * auto-contrast against its real backdrop when there's no image (or no tint available).
 */
export function resolve_colors(schema:CoverSchema, image_regions?:ImageRegions | null):ResolvedColors {
    const all_regions = image_regions ? all_image_regions(image_regions) : []

    // Front background: explicit bg_color wins; else complement the image; else a neutral tan
    // for a vector background (no pixels to sample); else plain white
    const front_bg_color = schema.bg_color ? parse_color(schema.bg_color)
        : all_regions.length ? chroma(synthesize_fill(all_regions))
            : schema.bg_vector_id ? chroma(VECTOR_BG_AUTO_COLOR)
                : from_hsl(COLOR_DEFAULTS.front_background)
    const front_bg = to_hsl(front_bg_color)

    const coverage = schema.bg_image_coverage ?? 'front'

    // Real image color behind the back panel/spine — only actually visible under full-wrap
    // coverage; otherwise blurb/spine derive from front_bg like any other flat color
    const image_backdrop = image_regions && coverage === 'full' && image_regions.back && image_regions.spine
        ? {back: chroma(region_hex(image_regions.back)), spine: chroma(region_hex(image_regions.spine))}
        : undefined

    // Vivid image-sampled tint for a front-panel text field at the given position — null when
    // there's no image (falls through to plain auto-contrast below)
    const front_bg_region = color_to_region(front_bg_color)
    const tint_for = (position:TitlePosition):string | null => {
        if (!image_regions) return null
        const {top, bottom} = front_pair(coverage, image_regions)
        const backdrop = image_backdrop_for_position(position, coverage, image_regions, front_bg_region)
        return pick_vivid_tint([top, bottom], backdrop, min_contrast_for(position, backdrop))
    }

    const title1 = schema.title1_color ?? hex_override_to_hsl(tint_for(schema.title_position))
        ?? auto_contrast_text(front_bg)
    const title2 = schema.title2_color ?? title1
    const title3 = schema.title3_color ?? title1
    const subtitle = schema.subtitle_color ?? hex_override_to_hsl(tint_for(schema.subtitle_position))
        ?? auto_contrast_text(front_bg)
    const author = schema.author_color ?? hex_override_to_hsl(tint_for(schema.author_position))
        ?? auto_contrast_text(front_bg)

    // Blurb: text and (unless the caller wants transparency) a banded container background,
    // both contrasted against whatever's actually behind the blurb box — the real image color
    // under full-wrap coverage, else front_bg
    const blurb_backdrop = image_backdrop?.back ?? front_bg_color
    const [blurb_h, blurb_s, blurb_l] = blurb_backdrop.hsl()
    const blurb_background = schema.blurb_bg_color === null ? null
        : schema.blurb_bg_color ?? to_hsl(chroma.hsl(
            blurb_h || 0, blurb_s, is_dark(blurb_backdrop) ? Math.min(blurb_l, 0.25) : Math.max(blurb_l, 0.75)))
    const blurb = schema.blurb_color ?? auto_contrast_text(to_hsl(blurb_backdrop))

    // Spine text: real image color behind the spine (full-wrap coverage) takes priority over
    // front_bg when spine_color itself isn't explicitly set
    const spine_backdrop = schema.spine_color ? parse_color(schema.spine_color)
        : image_backdrop?.spine ?? front_bg_color
    const spine_text = auto_contrast_text(to_hsl(spine_backdrop))

    return {
        front_background: front_bg,
        // Gradient stops: hue shifted ±35° from the base front color
        front_gradient_start: shift_hue(front_bg, 35),
        front_gradient_end: shift_hue(front_bg, -35),
        // Back background falls back to front background
        back_background: front_bg,
        // Spine background: null (or unset) = no separate spine color (spine uses primary)
        spine_background: schema.spine_color ?? null,
        front_title1: title1,
        front_title2: title2,
        front_title3: title3,
        front_subtitle: subtitle,
        front_author: author,
        blurb,
        blurb_background,
        spine_title: schema.spine_title_color ?? spine_text,
        spine_author: schema.spine_author_color ?? spine_text,
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
