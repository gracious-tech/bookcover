
// Widget-side schema helpers. The form->schema conversion itself lives in bookcover-core
// (build_schema) — this wraps it with the widget's custom-font store. The background image to
// render with comes from read_render_image in services/backgrounds.ts

import {toRaw} from 'vue'
import {build_schema as build_schema_core} from 'bookcover-web'
import type {FormState} from './form_state'
import {custom_font_families} from './fonts'

// The embed host's marker -> Typst map (InitMessage.typst_substitutions), applied to every
// render but never to the form. Empty when standalone or the host sent none
let typst_substitutions:Record<string, string> = {}

/** Store the host's marker substitutions, set once from the embed 'init' message */
export function set_typst_substitutions(substitutions:Record<string, string>):void {
    typst_substitutions = substitutions
}

/** True when the host sent any marker substitutions */
export function has_typst_substitutions():boolean {
    return Object.keys(typst_substitutions).length > 0
}

/** Assemble the full flat schema object from current form state, supplying the uploaded
 *  families' sniffed serif/sans styles for Noto fallback selection and the host's marker
 *  substitutions (pass substitute = false to render the markers as typed). Carries no color
 *  derivation of its own — unset color fields (including bg_color) are filled in downstream by
 *  resolve_colors() inside generate(), using whatever's passed as GenerateOptions.image_regions
 *  (see image_regions_cache.ts and PreviewPane.vue's generate() calls) */
export function build_schema(form:FormState, substitute = true):Record<string, unknown> {
    return build_schema_core(form, toRaw(custom_font_families),
        substitute ? {typst_substitutions} : {})
}

/** Parse SVG dimensions from width/height attributes (values in pt from Typst's SVG renderer) */
export function parse_svg_size(svg:string):{width:number, height:number} {
    const w = svg.match(/width="([\d.]+)(?:pt)?"/)
    const h = svg.match(/height="([\d.]+)(?:pt)?"/)
    if (!w || !h)
        throw new Error('Could not parse SVG dimensions')
    return {width: parseFloat(w[1]), height: parseFloat(h[1])}
}
