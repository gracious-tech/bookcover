
// Build all typst compilation files in memory — no disk I/O

import {build_data_file} from './data_file.js'
import {generate_isbn_barcode} from './barcode.js'
import type {CoverSchema} from './schema.js'
import type {GetDimensionsResult} from 'printing-services'
import type {ResolvedColors} from './design.js'
import type {FontSizes} from './font_sizes.js'

const encoder = new TextEncoder()

export interface ImageInput {
    // Raw image bytes
    data:Uint8Array
    // File extension including dot: '.jpg', '.png', '.webp'
    ext:string
    // Natural width/height ratio — used for pattern SVGs to preserve aspect ratio when tiling
    aspect_ratio?:number
    // True when this is a procedurally-generated vector background rather than a photo —
    // drives cover.typ to stretch (not crop) the image to fill its placement box
    is_vector?:boolean
}

/**
 * Build all files needed for typst compilation, entirely in memory.
 * Returns a map of filename → bytes ready to write into a working directory.
 */
export interface Templates {
    // Contents of cover.typ
    cover:string
    // Contents of _helpers.typ
    helpers:string
}

export function build_cover_files(
    templates:Templates,
    schema:CoverSchema,
    dims:GetDimensionsResult,
    colors:ResolvedColors,
    font_body_family:string[],
    font_title1_family:string[],
    font_title2_family:string[],
    font_title3_family:string[],
    font_subtitle_family:string[],
    font_author_family:string[],
    font_blurb_family:string[],
    font_spine_title_family:string[],
    font_spine_author_family:string[],
    font_sizes:FontSizes,
    image?:ImageInput,
    icon_main?:ImageInput,
    icon_ghost?:ImageInput,
    icon_ghost2?:ImageInput,
    icon_spine?:ImageInput,
    icon_bg?:ImageInput,
    pattern?:ImageInput,
):Map<string, Uint8Array> {
    const files = new Map<string, Uint8Array>()

    // Templates
    files.set('cover.typ', encoder.encode(templates.cover))
    files.set('_helpers.typ', encoder.encode(templates.helpers))

    // Image asset
    let image_filename:string | null = null
    if (image) {
        const ext = image.ext.startsWith('.') ? image.ext : `.${image.ext}`
        image_filename = `background${ext}`
        files.set(image_filename, image.data)
    }

    // Icon assets (pre-colored SVG variants)
    if (icon_main) files.set('icon_main.svg', icon_main.data)
    if (icon_ghost) files.set('icon_ghost.svg', icon_ghost.data)
    if (icon_ghost2) files.set('icon_ghost2.svg', icon_ghost2.data)
    if (icon_spine) files.set('icon_spine.svg', icon_spine.data)
    if (icon_bg) files.set('icon_bg.svg', icon_bg.data)

    // Pattern tile (pre-colored SVG for tiling across the full cover)
    if (pattern) files.set('pattern.svg', pattern.data)

    // Barcode (SVG — platform-independent, supported by Typst)
    const has_barcode = !!(schema.isbn)
    if (has_barcode) {
        const {w, h} = dims.cover_region_barcode
        const barcode_bytes = generate_isbn_barcode(schema.isbn!, w.toNumber(), h.toNumber())
        files.set('barcode.svg', barcode_bytes)
    }

    // Data file
    const data_content = build_data_file(
        schema, dims, colors, font_body_family,
        font_title1_family, font_title2_family, font_title3_family,
        font_subtitle_family, font_author_family, font_blurb_family,
        font_spine_title_family, font_spine_author_family,
        font_sizes, image_filename, image?.is_vector ?? false,
        has_barcode, icon_main !== undefined, pattern !== undefined, pattern?.aspect_ratio,
    )
    files.set('_data.typ', encoder.encode(data_content))

    return files
}
