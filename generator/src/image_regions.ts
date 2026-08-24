
// Derives ImageRegions (dominant colors per cover region) from a decoded image's raw RGBA
// pixel data. Decoding the source image into that pixel buffer stays platform-specific (canvas
// getImageData in a browser, an image library elsewhere) and is the caller's job — this module
// is pure and does no I/O.

import type {Region} from 'printing-services'
import type {GetDimensionsResult} from './dimensions.js'
import type {RegionStats} from './design.js'
import type {ImageRegions} from './form_schema.js'
import {BUILTIN_BG_REGIONS} from './generated/builtin_bg_regions.js'

// Pixels this transparent or more are excluded from a region's averages
const ALPHA_THRESHOLD = 128
// Fraction of a panel's height sampled for its top/bottom text regions — title text tends to
// sit within the top third, author/blurb-adjacent text within the bottom quarter, so these
// intentionally don't split the panel 50/50
const TOP_FRACTION = 1 / 3
const BOTTOM_FRACTION = 1 / 4

// Convert one pixel's 0-255 RGB to {h: 0-360, s: 0-1, l: 0-1}
function rgb_to_hsl(r:number, g:number, b:number):{h:number, s:number, l:number} {
    r /= 255
    g /= 255
    b /= 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    if (max === min)
        return {h: 0, s: 0, l}
    const d = max - min
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    let h:number
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    return {h: h * 60, s, l}
}

/** Average a rectangle of pixel data into a RegionStats — saturation-weighted circular mean
 *  for hue (biases toward colorful pixels over a muddy gray average), plain mean for
 *  saturation/lightness, plus the lightness standard deviation (lightness_spread) — a region
 *  containing both light and dark areas (e.g. text crossing a horizon) isn't well represented
 *  by its average alone, so callers use this to demand more contrast in those regions.
 *  Coordinates are clamped to the image bounds. */
export function analyze_rect(data:Uint8ClampedArray, img_w:number, img_h:number,
    rect:{x:number, y:number, w:number, h:number}):RegionStats {
    const x0 = Math.max(0, Math.round(rect.x))
    const y0 = Math.max(0, Math.round(rect.y))
    const x1 = Math.min(img_w, Math.round(rect.x + rect.w))
    const y1 = Math.min(img_h, Math.round(rect.y + rect.h))

    let sum_x = 0
    let sum_y = 0
    let sum_s = 0
    let sum_l = 0
    let sum_l2 = 0
    let count = 0
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * img_w + x) * 4
            if (data[i + 3] < ALPHA_THRESHOLD) continue
            const {h, s, l} = rgb_to_hsl(data[i], data[i + 1], data[i + 2])
            const rad = h * Math.PI / 180
            sum_x += Math.cos(rad) * s
            sum_y += Math.sin(rad) * s
            sum_s += s
            sum_l += l
            sum_l2 += l * l
            count++
        }
    }
    if (count === 0)
        return {hue: 0, saturation: 0, lightness: 0.5, lightness_spread: 0}
    const hue = (Math.atan2(sum_y, sum_x) * 180 / Math.PI + 360) % 360
    const mean_l = sum_l / count
    const variance = Math.max(0, sum_l2 / count - mean_l * mean_l)
    return {
        hue: (sum_x === 0 && sum_y === 0) ? 0 : hue,
        saturation: sum_s / count,
        lightness: mean_l,
        lightness_spread: Math.sqrt(variance),
    }
}

// Scale a mm-based panel Region onto the analyzed pixel buffer, assuming the raw image maps
// proportionally onto the full-wrap canvas (cover_total_width x cover_total_height)
function region_to_px(region:Region, total_w_mm:number, total_h_mm:number, img_w:number, img_h:number) {
    const scale_x = img_w / total_w_mm
    const scale_y = img_h / total_h_mm
    return {
        x: region.x.toNumber() * scale_x,
        y: region.y.toNumber() * scale_y,
        w: region.w.toNumber() * scale_x,
        h: region.h.toNumber() * scale_y,
    }
}

// Sample a mm-based panel Region (already scaled to px) into its top/bottom text regions — the
// top TOP_FRACTION and bottom BOTTOM_FRACTION of its height, not a 50/50 split
function split_top_bottom(data:Uint8ClampedArray, img_w:number, img_h:number,
    rect:{x:number, y:number, w:number, h:number}):{top:RegionStats, bottom:RegionStats} {
    return {
        top: analyze_rect(data, img_w, img_h, {x: rect.x, y: rect.y, w: rect.w, h: rect.h * TOP_FRACTION}),
        bottom: analyze_rect(data, img_w, img_h,
            {x: rect.x, y: rect.y + rect.h * (1 - BOTTOM_FRACTION), w: rect.w, h: rect.h * BOTTOM_FRACTION}),
    }
}

/**
 * Sample a background image's dominant colors from its decoded RGBA pixel data, under both
 * interpretations at once. `dims`, when provided, locates the front/back panels and spine strip
 * within the image under a full-wrap interpretation (used when bg_image_coverage is 'full');
 * pass null to skip that (front_top_full/front_bottom_full/back/spine all come back null).
 */
export function analyze_pixel_regions(data:Uint8ClampedArray, width:number, height:number,
    dims:GetDimensionsResult | null):ImageRegions {
    // Whole-image interpretation — correct whenever the image is confined to the front panel
    const front_top = analyze_rect(data, width, height, {x: 0, y: 0, w: width, h: height * TOP_FRACTION})
    const front_bottom = analyze_rect(data, width, height,
        {x: 0, y: height * (1 - BOTTOM_FRACTION), w: width, h: height * BOTTOM_FRACTION})

    // Full-wrap interpretation — only the front panel's own portion of the image, not the
    // back/spine content alongside it
    let front_top_full:RegionStats | null = null
    let front_bottom_full:RegionStats | null = null
    let back:RegionStats | null = null
    let spine:RegionStats | null = null
    if (dims) {
        const total_w = dims.cover_total_width.toNumber()
        const total_h = dims.cover_total_height.toNumber()
        const to_px = (region:Region) => region_to_px(region, total_w, total_h, width, height)
        const front_split = split_top_bottom(data, width, height, to_px(dims.cover_region_front))
        front_top_full = front_split.top
        front_bottom_full = front_split.bottom
        back = analyze_rect(data, width, height, to_px(dims.cover_region_back))
        spine = analyze_rect(data, width, height, to_px(dims.cover_region_spine))
    }

    return {front_top, front_bottom, front_top_full, front_bottom_full, back, spine}
}

/** Look up precomputed ImageRegions for a builtin background image (assets/backgrounds/<filename>)
 *  — see builtin_bg_regions.ts for how/why these are baked in. `byte_length` is checked against
 *  the source file's known size so a same-named non-builtin upload doesn't collide with an
 *  entry. Returns null for anything not in the table, in which case callers should fall back to
 *  analyze_pixel_regions() against the actual decoded image. */
export function get_builtin_bg_regions(filename:string, byte_length:number):ImageRegions | null {
    const entry = BUILTIN_BG_REGIONS[filename]
    return (entry && entry.size === byte_length) ? entry.regions : null
}
