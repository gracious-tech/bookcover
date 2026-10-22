// Widget-side vector background helpers — built on top of the generator's
// list_vector_backgrounds()/generate_palette()
//
// Design METADATA (id/name/palette settings) loads with the app. Each design's SVG is its own
// lazy chunk, fetched the first time a thumbnail asks for it (see get_preview_url below), so the
// app starts with only the selected design and the rest arrive when the picker opens.

import {ref} from 'vue'
import {list_vector_backgrounds, find_vector_background as find_any_vector_background, generate_palette,
    load_vector_background_svg, recolor_vector_svg} from 'bookcover-web'
import type {VectorBackgroundDef} from 'bookcover-web'
import {report_error} from '../error_report'
import {svg_css_url} from '../svg_utils'

export type {VectorBackgroundDef}

// The order designs appear in the picker, listed by hand so it can be arranged by eye rather
// than alphabetically. Purely a UI concern: the generator's list_vector_backgrounds() stays
// alphabetical, and a stored record names a bg_vector_id, never a position. Safe to reorder
// freely — an id here that no longer exists is skipped, and a design missing from the list
// still shows, appended at the end.
const DESIGN_ORDER:string[] = [
    // Nature
    'mountain-ridge-v2',
    'mountain-valley-v2',
    'big-leaf-cluster-v2',
    'teardrop-cluster-v2',
    'pebble-stack-v2',
    // Sky
    'cloud-drift-v2',
    // Animals
    'seagulls',
    'fish',
    // Humanity
    'sailboat-silhouette-v2',
    'lighthouse-beacon-v2',
    'arch-doorway-v2',
    'coin-stacks-v2',
    'kite-trio-v2',
    // Pattern
    'chevron-stack',
    'facet-corner',
    'checkerboard-diamond',
    'arc-rings-v2',
    'orbit-rings-v2',
    'labyrinth-lines-v2',
    'stacked-bars-v2',
    'staircase-v2',
    // Decorative
    'aurora-ribbons-v2',
    'constellation-v2',
    'star-scatter-v2',
    'confetti-triangles-v2',
    // Christian
    'cross-v2',
    'calvary-hill-v2',
    'church-v2',
    'bethlehem-star-v2',
    'crown-of-thorns-v2',
]

/** DESIGN_ORDER applied to the generator's designs, with anything unlisted kept on the end */
function order_designs(designs:VectorBackgroundDef[]):VectorBackgroundDef[] {
    const listed = DESIGN_ORDER
        .map(id => designs.find(d => d.id === id))
        .filter((d):d is VectorBackgroundDef => d !== undefined)
    const unlisted = designs.filter(d => !DESIGN_ORDER.includes(d.id))
    return [...listed, ...unlisted]
}

export const VECTOR_BACKGROUNDS:VectorBackgroundDef[] = order_designs(list_vector_backgrounds())

/** Look up a vector background by ID, including a superseded design a stored cover still names
 *  (it never appears in the picker, but keeps its preview and palette suggestions) */
export function find_vector_background(id:string):VectorBackgroundDef | undefined {
    return VECTOR_BACKGROUNDS.find(v => v.id === id) ?? find_any_vector_background(id)
}

// Each design's source SVG once loaded, keyed by id. Reactive so a thumbnail (blank meanwhile)
// fills in when its SVG arrives
const design_svgs = ref<Record<string, string>>({})

// Each design's in-flight or finished load, so concurrent thumbnails share one rather than racing
const loads = new Map<string, Promise<void>>()

/** Load a design's SVG on demand. Safe to call repeatedly — each design is fetched once.
 *  Callers don't need to await it: thumbnails render blank until it resolves and then fill in */
export function load_design_svg(id:string):Promise<void> {
    let load = loads.get(id)
    if (!load) {
        load = load_vector_background_svg(id).then(svg => {
            if (svg) design_svgs.value = {...design_svgs.value, [id]: svg}
        }).catch((error:unknown) => {
            // Leave the thumbnail blank rather than breaking the picker — the design still
            // applies to the cover itself, since the worker loads its SVG independently
            console.error(`Failed to load vector background ${id}:`, error)
            report_error(error, 'Failed to load vector background SVG')
            loads.delete(id)
        })
        loads.set(id, load)
    }
    return load
}

/** Generate a CSS background-image data URL for the preview thumbnail, deriving the
 *  design's palette live from the given background color (hex or hsl() string). Blank until the
 *  design's SVG has loaded, which this requests. Designs are full-wrap (1275x900, front face is
 *  the rightmost 600px); callers show just the front face with a 2:3 thumbnail box plus
 *  background-size:cover and background-position:right. */
export function get_preview_url(design:VectorBackgroundDef | undefined, base_color:string):string {
    if (!design) return ''
    const svg = design_svgs.value[design.id]
    if (!svg) {
        void load_design_svg(design.id)
        return ''
    }
    const palette = generate_palette(base_color, design.color_count, design.scheme)
    return svg_css_url(recolor_vector_svg(svg, palette))
}
