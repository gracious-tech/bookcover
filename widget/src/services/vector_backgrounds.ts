// Widget-side vector background helpers — built on top of the generator's
// list_vector_backgrounds()/generate_palette()

import {list_vector_backgrounds, find_vector_background as find_any_vector_background, generate_palette}
    from 'bookcover-web'
import type {VectorBackgroundDef} from 'bookcover-web'

export type {VectorBackgroundDef}

// The order designs appear in the picker, listed by hand so it can be arranged by eye rather
// than alphabetically. Purely a UI concern: the generator's list_vector_backgrounds() stays
// alphabetical, and a stored record names a bg_vector_id, never a position. Safe to reorder
// freely — an id here that no longer exists is skipped, and a design missing from the list
// still shows, appended at the end.
const DESIGN_ORDER:string[] = [
    // Pattern
    'arc-rings-v2',
    'aurora-ribbons-v2',
    'chevron-stack',
    'facet-corner',
    'mountain-ridge-v2',
    'checkerboard-diamond',
    'labyrinth-lines-v2',
    'orbit-rings-v2',
    'stacked-bars-v2',
    'staircase-v2',
    // Nature
    'big-leaf-cluster-v2',
    'cloud-drift-v2',
    'seagulls',
    'fish',
    'mountain-valley-v2',
    'teardrop-cluster-v2',
    'constellation-v2',
    'star-scatter-v2',
    'pebble-stack-v2',
    // Humanity
    'arch-doorway-v2',
    'sailboat-silhouette-v2',
    'lighthouse-beacon-v2',
    'coin-stacks-v2',
    'kite-trio-v2',
    'confetti-triangles-v2',
    // Christian
    'cross-v2',
    'calvary-hill-v2',
    'crown-of-thorns-v2',
    'church-v2',
    'bethlehem-star-v2',
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

/** Generate a CSS background-image data URL for the preview thumbnail, deriving the
 *  design's palette live from the given background color (hex or hsl() string). Designs are
 *  full-wrap (1275x900, front face is the rightmost 600px); callers show just the front face
 *  with a 2:3 thumbnail box plus background-size:cover and background-position:right. */
export function get_preview_url(design:VectorBackgroundDef | undefined, base_color:string):string {
    if (!design) return ''
    const palette = generate_palette(base_color, design.color_count, design.scheme)
    const svg = design.render(palette)
    return 'url(\'data:image/svg+xml,' + encodeURIComponent(svg) + '\')'
}
