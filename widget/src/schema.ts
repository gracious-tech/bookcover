
// Widget-side schema/image helpers. The form->schema conversion itself lives in
// bookcover-core (build_schema) — this wraps it with the widget's custom-font store and
// keeps the DOM-only image helpers

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

/** Return the background image as a Blob if one is selected */
export function read_image(form:FormState):Blob | undefined {
    return form.bg_image ?? undefined
}

/** Resize image to fit within max_w × max_h as JPEG Blob; returns original if already small enough */
async function resize_to_jpeg(blob:Blob, max_w:number, max_h:number):Promise<Blob> {
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1.0, max_w / bitmap.width, max_h / bitmap.height)
    if (scale === 1.0) {
        bitmap.close()
        return blob
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.85))
}

/** Read and downscale background image to fit the preview dimensions */
export async function read_image_preview(form:FormState, max_w:number, max_h:number):Promise<Blob | undefined> {
    const blob = read_image(form)
    if (!blob)
        return undefined
    return resize_to_jpeg(blob, max_w, max_h)
}

/** Parse SVG dimensions from width/height attributes (values in pt from Typst's SVG renderer) */
export function parse_svg_size(svg:string):{width:number, height:number} {
    const w = svg.match(/width="([\d.]+)(?:pt)?"/)
    const h = svg.match(/height="([\d.]+)(?:pt)?"/)
    if (!w || !h)
        throw new Error('Could not parse SVG dimensions')
    return {width: parseFloat(w[1]), height: parseFloat(h[1])}
}
