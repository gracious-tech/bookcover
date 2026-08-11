// Widget-side vector background helpers — built on top of the generator's
// list_vector_backgrounds()/generate_palette()

import {list_vector_backgrounds, generate_palette} from 'bookcover-web'
import type {VectorBackgroundDef} from 'bookcover-web'

export type {VectorBackgroundDef}

export const VECTOR_BACKGROUNDS:VectorBackgroundDef[] = list_vector_backgrounds()

/** Look up a vector background by ID */
export function find_vector_background(id:string):VectorBackgroundDef | undefined {
    return VECTOR_BACKGROUNDS.find(v => v.id === id)
}

/** Generate a CSS background-image data URL for the preview thumbnail, deriving the
 *  design's palette live from the given background color (hex or hsl() string) */
export function get_preview_url(design:VectorBackgroundDef | undefined, base_color:string):string {
    if (!design) return ''
    const palette = generate_palette(base_color, design.color_count, design.scheme)
    const svg = design.render(palette)
    return 'url(\'data:image/svg+xml,' + encodeURIComponent(svg) + '\')'
}
