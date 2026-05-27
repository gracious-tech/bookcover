
// Public API for the paper cover generator

import {cover_schema} from './schema.js'
import {resolve_dimensions} from './dimensions.js'
import type {GetDimensionsResult} from './dimensions.js'
import type {CoverSchema} from './schema.js'
import {default_spine_title} from './utils.js'
import {calculate_font_sizes} from './font_sizes.js'
import {resolve_colors, resolve_font_families, darken_hsl, mix_hsl} from './design.js'
import {build_cover_files} from './build_files.js'
import type {Templates, ImageInput} from './build_files.js'
import {resolve_icon} from './icon_cache.js'
import {find_pattern} from './patterns.js'
import type {FrameImageFn} from './frame.js'

export type {CoverSchema, TitlePosition, FontConfig} from './schema.js'
export {default_spine_title} from './utils.js'
export {BUNDLED_FONTS, get_fonts, get_bundled_font, collect_fonts, all_fonts_bundled, BASE_FONT} from './fonts.js'
export type {BundledFont} from './fonts.js'
export {asset_path, FONTS_DIR, FRAMES_DIR, BACKGROUNDS_DIR,
    TYPST_DIR, TEMPLATE_FILES} from './assets.js'
export {list_patterns} from './patterns.js'
export type {PatternDef} from './patterns.js'
export type {FontSizes} from './font_sizes.js'
export type {ResolvedColors} from './design.js'
export type {ImageInput, Templates} from './build_files.js'
export type {CropRegion, PixelCropRegion, SplitResult, PngCropFn} from './split.js'
export type {FrameImageFn} from './frame.js'

export type OutputFormat = 'pdf' | 'svg' | 'png'

export interface BuildResult {
    // Virtual filesystem of filename → bytes, ready for typst compilation
    files:Map<string, Uint8Array>
    // Resolved cover dimensions from printing-services
    dims:GetDimensionsResult
}

// Re-export lower-level functions needed by generator-node and generator-web
export {cover_schema, calculate_font_sizes, resolve_colors, resolve_font_families, darken_hsl}
export {resolve_dimensions} from './dimensions.js'
export type {GetDimensionsResult} from './dimensions.js'
export {calculate_crop_regions, calculate_pixel_crop_regions,
    split_svg, split_png, split_pdf} from './split.js'
export {resolve_icon} from './icon_cache.js'
export {frame_image, frame_asset_path} from './frame.js'

/**
 * Validate schema, compute all derived values, and build every file needed
 * for typst compilation — entirely in memory.
 *
 * Returns the virtual filesystem (filename → bytes) and the resolved cover
 * dimensions so callers can use them for splitting without a second lookup.
 */
export async function build(
    templates:Templates,
    schema:CoverSchema,
    image?:{data:Uint8Array, ext:string},
    frame_fn?:FrameImageFn,
    frame_data?:Blob,
):Promise<BuildResult> {

    // Resolve spine text — undefined means derive from titles/author; '' means explicitly empty
    const schema_resolved = {
        ...schema,
        spine_title: schema.spine_title
            ?? default_spine_title(schema.title1, schema.title2, schema.title3),
        spine_author: schema.spine_author ?? schema.author,
    }

    // Get cover dimensions from printing-services
    const dims = resolve_dimensions(schema)

    const colors = resolve_colors(schema_resolved)
    const {
        body: font_body_family,
        title1: font_title1_family,
        title2: font_title2_family,
        title3: font_title3_family,
        subtitle: font_subtitle_family,
        author: font_author_family,
        blurb: font_blurb_family,
        spine_title: font_spine_title_family,
        spine_author: font_spine_author_family,
    } = resolve_font_families(schema_resolved)
    const font_sizes = calculate_font_sizes(schema_resolved, dims)

    // Resolve and recolor icon SVG variants when an icon is specified
    const encoder = new TextEncoder()
    let icon_main:{data:Uint8Array, ext:string} | undefined
    let icon_ghost:{data:Uint8Array, ext:string} | undefined
    let icon_ghost2:{data:Uint8Array, ext:string} | undefined
    let icon_spine:{data:Uint8Array, ext:string} | undefined
    let icon_bg:{data:Uint8Array, ext:string} | undefined

    if (schema_resolved.icon_id) {
        // Main icon: use explicit icon_color if set, otherwise 50% darker than front
        // Ghost copies: faded toward background from main color; spine/bg: derived from bg
        const color_main = schema_resolved.icon_color ?? darken_hsl(colors.front_background, 0.5)
        const color_ghost = mix_hsl(color_main, colors.front_background, 0.7)
        const color_ghost2 = mix_hsl(color_main, colors.front_background, 0.84)
        const color_spine = darken_hsl(colors.spine_background ?? colors.front_background, 0.5)
        const color_bg = darken_hsl(colors.front_background, 0.08)
        const [svg_main, svg_ghost, svg_ghost2, svg_spine, svg_bg] = await Promise.all([
            resolve_icon(schema_resolved.icon_id, color_main),
            resolve_icon(schema_resolved.icon_id, color_ghost),
            resolve_icon(schema_resolved.icon_id, color_ghost2),
            resolve_icon(schema_resolved.icon_id, color_spine),
            resolve_icon(schema_resolved.icon_id, color_bg),
        ])
        icon_main = {data: encoder.encode(svg_main), ext: '.svg'}
        icon_ghost = {data: encoder.encode(svg_ghost), ext: '.svg'}
        icon_ghost2 = {data: encoder.encode(svg_ghost2), ext: '.svg'}
        icon_spine = {data: encoder.encode(svg_spine), ext: '.svg'}
        icon_bg = {data: encoder.encode(svg_bg), ext: '.svg'}
    }

    // Resolve and recolor pattern SVG when a pattern is specified
    // schema.pattern can be a known pattern ID or a raw SVG string
    let pattern_file:ImageInput | undefined
    if (schema_resolved.pattern) {
        // Use explicit pattern_color if set; otherwise match bg exactly if gradient,
        // or darken slightly when no gradient
        const color_pattern = schema_resolved.pattern_color
            ?? (schema_resolved.bg_color_gradient
                ? colors.front_background
                : darken_hsl(colors.front_background, 0.05))
        const pat = find_pattern(schema_resolved.pattern)
        const svg = await resolve_icon(pat ? pat.svg : schema_resolved.pattern, color_pattern)
        // Parse natural SVG dimensions to preserve aspect ratio when tiling
        const svg_w = parseFloat(svg.match(/\bwidth="([0-9.]+)"/)?.[1] ?? '1')
        const svg_h = parseFloat(svg.match(/\bheight="([0-9.]+)"/)?.[1] ?? '1')
        const aspect_ratio = (svg_w > 0 && svg_h > 0) ? svg_w / svg_h : 1
        pattern_file = {data: encoder.encode(svg), ext: '.svg', aspect_ratio}
    }

    // Pre-process image with frame effect when bg_image_coverage is 'painted' and a frame_fn was injected
    let processed_image = image
    if (image && schema_resolved.bg_image_coverage === 'painted' && frame_fn) {
        const margin_mm = 15
        const painted_w = dims.cover_face_width.toNumber() - 2 * margin_mm
        const painted_h = dims.cover_face_height.toNumber() * 0.5 // sync: cover.typ painted_h = face_height * 0.5
        const width_px = Math.round(painted_w / 25.4 * 300)
        const height_px = Math.round(painted_h / 25.4 * 300)
        const mime = image.ext === '.png' ? 'image/png' : 'image/jpeg'
        const src_blob = new Blob([image.data as unknown as BlobPart], {type: mime})
        const out_blob = await frame_fn(src_blob, frame_data!, colors.front_background, width_px, height_px)
        processed_image = {data: new Uint8Array(await out_blob.arrayBuffer()), ext: '.png'}
    }

    const files = build_cover_files(
        templates, schema_resolved, dims, colors,
        font_body_family,
        font_title1_family, font_title2_family, font_title3_family,
        font_subtitle_family, font_author_family, font_blurb_family,
        font_spine_title_family, font_spine_author_family,
        font_sizes, processed_image, icon_main, icon_ghost, icon_ghost2, icon_spine, icon_bg, pattern_file,
    )
    return {files, dims}
}
