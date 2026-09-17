// Widget-side vector background helpers — built on top of the generator's
// list_vector_backgrounds()/generate_palette()

import {list_vector_backgrounds, generate_palette} from 'bookcover-web'
import type {VectorBackgroundDef} from 'bookcover-web'

export type {VectorBackgroundDef}

// The order designs appear in the picker, listed by hand so it can be arranged by eye rather
// than alphabetically. Purely a UI concern: the generator's list_vector_backgrounds() stays
// alphabetical, and a stored record names a bg_vector_id, never a position. Safe to reorder
// freely — an id here that no longer exists is skipped, and a design missing from the list
// still shows, appended at the end.
const DESIGN_ORDER:string[] = [
    // Pattern
    'arc-rings',
    'aurora-ribbons',
    'chevron-stack',
    'facet-corner',
    'mountain-ridge',
    'checkerboard-diamond',
    'grid-dots',
    'labyrinth-lines',
    'orbit-rings',
    'stacked-bars',
    'staircase',
    'broken-frame',
    // Nature
    'big-leaf-cluster',
    'cloud-drift',
    'feathers',
    'seagulls',
    'fish',
    'mountain-valley',
    'teardrop-cluster',
    'constellation',
    'star-scatter',
    'plus-marks-scatter',
    'pebble-stack',
    // Humanity
    'arch-doorway',
    'sailboat-silhouette',
    'lighthouse-beacon',
    'coin-stacks',
    'kite-trio',
    'confetti-triangles',
    // Christian
    'cross',
    'calvary-hill',
    'crown-of-thorns',
    'church',
    'bethlehem-star',
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

/** Look up a vector background by ID */
export function find_vector_background(id:string):VectorBackgroundDef | undefined {
    return VECTOR_BACKGROUNDS.find(v => v.id === id)
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
