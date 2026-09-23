
// Widget-side schema helpers. The form->schema conversion itself lives in bookcover-core
// (build_schema) — this wraps it with the widget's custom-font store. The background image to
// render with comes from read_render_image in services/backgrounds.ts

import {toRaw} from 'vue'
import {build_schema as build_schema_core} from 'bookcover-web'
import type {FormState} from './form_state'
import {custom_font_families} from './fonts'

/** Assemble the full flat schema object from current form state, supplying the uploaded
 *  families' sniffed serif/sans styles for Noto fallback selection. Carries no color
 *  derivation of its own — unset color fields (including bg_color) are filled in downstream by
 *  resolve_colors() inside generate(), using whatever's passed as GenerateOptions.image_regions
 *  (see image_regions_cache.ts and PreviewPane.vue's generate() calls) */
export function build_schema(form:FormState):Record<string, unknown> {
    return build_schema_core(form, toRaw(custom_font_families))
}

/** Parse SVG dimensions from width/height attributes (values in pt from Typst's SVG renderer) */
export function parse_svg_size(svg:string):{width:number, height:number} {
    const w = svg.match(/width="([\d.]+)(?:pt)?"/)
    const h = svg.match(/height="([\d.]+)(?:pt)?"/)
    if (!w || !h)
        throw new Error('Could not parse SVG dimensions')
    return {width: parseFloat(w[1]), height: parseFloat(h[1])}
}
