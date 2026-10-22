
// Built-in procedural vector backgrounds — full-cover SVG designs recolored at generate time
// from a palette derived from the user's chosen background color (see design.ts's
// generate_palette, scheme 'accent_tones'). Source SVGs live in generator/vector_bg_images/ (open
// any one directly in an SVG editor — Inkscape, Illustrator, Figma — and edit freely; they use
// #6e79ac/#be89b3/#76538e as placeholder colors for c1/c2/c3, plus an optional dark and light
// variant of each (see PLACEHOLDER_COLORS), swapped for the real palette by
// recolor_vector_svg() below) and are bundled into generated/ by .bin/gen_vector_bg_images at
// build time, so no filesystem/network access is needed at generate time. Each design is its own
// generated module, reached only through load_vector_background_svg()'s dynamic import, so a
// bundler gives every design its own chunk: listing designs costs nothing but their ids, and an
// app downloads only the designs it actually renders. Authored against a 1275x900 full-wrap viewBox (back cover 0-600, spine 600-675, front
// cover 675-1275); Typst stretches the result to the real trim size, so the exact ratio only
// needs to be roughly right.
// A released design is never edited in place, since a stored cover names it by id: a changed
// design is a new file with the next version suffix (`arc-rings` -> `arc-rings-v2` ->
// `arc-rings-v3`) beside the untouched old one. Only the newest version of each design is
// listed for pickers; find_vector_background() still resolves every version.

import chroma from 'chroma-js'
import type {PaletteScheme} from './design.js'
import {VECTOR_BG_IDS, VECTOR_BG_IMAGE_LOADERS} from './generated/vector_bg_images_data.js'

export interface VectorBackgroundDef {
    id:string
    name:string
    color_count:number
    scheme:PaletteScheme
}

// How far each slot's dark/light variant sits from its base (chroma-js darken/brighten steps)
const VARIANT_DARKEN = 0.9
const VARIANT_BRIGHTEN = 0.8

/** A slot's [base, dark, light] tones, in PLACEHOLDER_COLORS order. The base passes through
 *  unchanged, so designs using only the three bases render exactly as they did before variants */
export function slot_tones(base:string):string[] {
    const color = chroma(base)
    return [base, color.darken(VARIANT_DARKEN).hex(), color.brighten(VARIANT_BRIGHTEN).hex()]
}

// Placeholder colors used in the source SVGs (generator/vector_bg_images/*.svg): for each of
// c1/c2/c3, its base then a dark and light variant. The variants are slot_tones() of the
// bases, written out so an SVG author can copy them; a design may use any subset
export const PLACEHOLDER_COLORS = [
    '#6e79ac', '#455281', '#949ed4', // c1 base, dark, light
    '#be89b3', '#926088', '#e7b0db', // c2 base, dark, light
    '#76538e', '#4d2d65', '#9c77b5', // c3 base, dark, light
]
const TONES_PER_SLOT = 3

/** Swap each placeholder color in a design's source SVG (see vector_backgrounds_svg.ts) for its
 *  resolved palette tone, given hex colors (length === color_count). A plain case-insensitive text
 *  substitution rather than DOM parsing, so it still works if an SVG editor moves a color into
 *  a <style> block or CSS class instead of leaving it as an inline fill/stroke attribute.
 *  All placeholders are swapped in ONE pass: a palette color can itself be a placeholder value
 *  (e.g. bg #c8b0d8 generates exactly the placeholder set, permuted), and replacing them one at
 *  a time would let a later pass re-replace an earlier pass's output, collapsing two slots onto
 *  the same color. */
export function recolor_vector_svg(svg:string, colors:string[]):string {
    const tones = colors.flatMap(slot_tones)
        // Negative lookahead guards against an editor re-exporting with an 8-digit alpha hex
        // (e.g. #ff0000aa), which would otherwise partial-match on the 6-digit placeholder
    const pattern = new RegExp(`(?:${PLACEHOLDER_COLORS.join('|')})(?![0-9a-f])`, 'gi')
    return svg.replace(pattern, match => {
        const i = PLACEHOLDER_COLORS.indexOf(match.toLowerCase())
        return (i >= 0 && i < colors.length * TONES_PER_SLOT) ? tones[i] : match
    })
}

// All current designs share these — per-entry overrides can be reintroduced if a future
// design needs a different color count or hue scheme
const DEFAULT_COLOR_COUNT = 3
const DEFAULT_SCHEME:PaletteScheme = 'accent_tones'

// A design id's trailing version suffix ('-v2'); an id without one is version 1
const VERSION_RE = /-v(\d+)$/

/** A design id split into its base name and version ('arc-rings-v2' -> ['arc-rings', 2]) */
function parse_id(id:string):[string, number] {
    const match = VERSION_RE.exec(id)
    return match ? [id.slice(0, match.index), Number(match[1])] : [id, 1]
}

/** Turn a design id ('big-leaf-cluster-v2') into a display name ('Big Leaf Cluster'), dropping
 *  its version suffix */
function humanize(id:string):string {
    return parse_id(id)[0].split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ')
}

// Derived from the bundled SVGs' ids (generator/vector_bg_images/*.svg via
// generated/vector_bg_images_data.ts) — adding a design is just dropping a new source SVG in,
// no list entry needed here
const ALL_VECTOR_BACKGROUNDS:VectorBackgroundDef[] = VECTOR_BG_IDS.map(id => ({
    id,
    name: humanize(id),
    color_count: DEFAULT_COLOR_COUNT,
    scheme: DEFAULT_SCHEME,
}))

// Designs dropped from pickers with no replacement. Their files stay, so stored covers naming
// them still render; deleting one instead would break those covers
export const RETIRED_VECTOR_BACKGROUNDS = ['plus-marks-scatter', 'broken-frame', 'grid-dots', 'feathers']

// Each design's newest version, keyed by base name, retired designs left out
const newest = new Map<string, string>()
for (const id of VECTOR_BG_IDS) {
    if (RETIRED_VECTOR_BACKGROUNDS.includes(id)) continue
    const [base, version] = parse_id(id)
    const held = newest.get(base)
    if (held === undefined || parse_id(held)[1] < version) newest.set(base, id)
}
const CURRENT_IDS = new Set(newest.values())

/** Every design's newest version, for pickers (superseded versions and retired designs are
 *  left out) */
export function list_vector_backgrounds():VectorBackgroundDef[] {
    return ALL_VECTOR_BACKGROUNDS.filter(v => CURRENT_IDS.has(v.id)).map(v => ({...v}))
}

/** Look up a design by id, superseded versions included (stored covers still name them) */
export function find_vector_background(id:string):VectorBackgroundDef | undefined {
    return ALL_VECTOR_BACKGROUNDS.find(v => v.id === id)
}

/** Load a design's source SVG (placeholder colors still in — see recolor_vector_svg()),
 *  superseded versions included. Fetches only that design's own chunk */
export async function load_vector_background_svg(id:string):Promise<string | undefined> {
    return VECTOR_BG_IMAGE_LOADERS[id]?.()
}
