
// Built-in procedural vector backgrounds — full-cover SVG designs recolored at generate time
// from a palette derived from the user's chosen background color (see design.ts's
// generate_palette, scheme 'accent_tones'). Source SVGs live in generator/vector_bg_images/ (open
// any one directly in an SVG editor — Inkscape, Illustrator, Figma — and edit freely; they use
// #6e79ac/#be89b3/#76538e as placeholder colors for c1/c2/c3, swapped for the real palette by
// recolor_svg() below) and are bundled into generated/vector_bg_images_data.ts by
// .bin/gen_vector_bg_images at build time, so no filesystem/network access is needed at generate
// time. Authored against a 1275x900 full-wrap viewBox (back cover 0-600, spine 600-675, front
// cover 675-1275); Typst stretches the result to the real trim size, so the exact ratio only
// needs to be roughly right.

import type {PaletteScheme} from './design.js'
import {VECTOR_BG_IMAGE_SVGS} from './generated/vector_bg_images_data.js'

export interface VectorBackgroundDef {
    id:string
    name:string
    color_count:number
    scheme:PaletteScheme
    // Render the full design to an SVG string given resolved hex colors (length === color_count)
    render(colors:string[]):string
}

// Placeholder colors used in the source SVGs (generator/vector_bg_images/*.svg) for c1/c2/c3
const PLACEHOLDER_COLORS = ['#6e79ac', '#be89b3', '#76538e']

/** Swap each placeholder color for its resolved palette color. A plain case-insensitive text
 *  substitution rather than DOM parsing, so it still works if an SVG editor moves a color into
 *  a <style> block or CSS class instead of leaving it as an inline fill/stroke attribute. */
function recolor_svg(svg:string, colors:string[]):string {
    let out = svg
    for (let i = 0; i < PLACEHOLDER_COLORS.length && i < colors.length; i++) {
        // Negative lookahead guards against an editor re-exporting with an 8-digit alpha hex
        // (e.g. #ff0000aa), which would otherwise partial-match on the 6-digit placeholder
        out = out.replace(new RegExp(`${PLACEHOLDER_COLORS[i]}(?![0-9a-f])`, 'gi'), colors[i])
    }
    return out
}

/** Build a render() for a VectorBackgroundDef that recolors the given design's source SVG */
function render_bg_image(id:string):(colors:string[]) => string {
    return colors => recolor_svg(VECTOR_BG_IMAGE_SVGS[id], colors)
}

// All current designs share these — per-entry overrides can be reintroduced if a future
// design needs a different color count or hue scheme
const DEFAULT_COLOR_COUNT = 3
const DEFAULT_SCHEME:PaletteScheme = 'accent_tones'

/** Turn a design id ('big-leaf-cluster') into a display name ('Big Leaf Cluster') */
function humanize(id:string):string {
    return id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')
}

// Derived from the bundled SVGs (generator/vector_bg_images/*.svg via
// generated/vector_bg_images_data.ts) — adding a design is just dropping a new source SVG in,
// no list entry needed here
const VECTOR_BACKGROUNDS:VectorBackgroundDef[] = Object.keys(VECTOR_BG_IMAGE_SVGS).sort().map(id => ({
    id,
    name: humanize(id),
    color_count: DEFAULT_COLOR_COUNT,
    scheme: DEFAULT_SCHEME,
    render: render_bg_image(id),
}))

export function list_vector_backgrounds():VectorBackgroundDef[] {
    return VECTOR_BACKGROUNDS.map(v => ({...v}))
}

export function find_vector_background(id:string):VectorBackgroundDef | undefined {
    return VECTOR_BACKGROUNDS.find(v => v.id === id)
}
