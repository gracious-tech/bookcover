
// Public API for the paper cover generator

import {cover_schema} from './schema.js'
import {resolve_dimensions} from './dimensions.js'
import type {GetDimensionsResult} from './dimensions.js'
import type {CoverSchema} from './schema.js'
import {default_spine_title} from './utils.js'
import {calculate_font_sizes} from './font_sizes.js'
import {resolve_colors, resolve_font_configs, darken_hsl, mix_hsl, generate_palette} from './design.js'
import {build_cover_files} from './build_files.js'
import type {Templates, ImageInput} from './build_files.js'
import {DEFAULT_TEMPLATES} from './generated/templates_data.js'
import {resolve_icon} from './icon_cache.js'
import {find_pattern} from './patterns.js'
import {find_vector_background} from './vector_backgrounds.js'
import type {FrameImageFn} from './frame.js'
import {resolve_fallback_chain, cjk_segments, cjk_family, font_style} from 'typst-fonts'
import type {CjkVariant, FontStyle} from 'typst-fonts'
import {resolve_field_cjk_variant, collect_fallback_fonts} from './fonts.js'
import type {FontConfig} from './schema.js'
import {escape_typst_str} from 'typst-utils'

export type {CoverSchema, TitlePosition, FontConfig} from './schema.js'
export {default_spine_title} from './utils.js'
export {collect_fonts, collect_all_fonts, collect_fallback_fonts, all_fonts_bundled,
    resolve_cjk_variant, resolve_field_cjk_variant} from './fonts.js'
export {asset_path, FRAMES_DIR, BACKGROUNDS_DIR} from './assets.js'
export {DEFAULT_TEMPLATES} from './generated/templates_data.js'
export {list_patterns, find_pattern} from './patterns.js'
export type {PatternDef} from './patterns.js'
export {list_vector_backgrounds, find_vector_background} from './vector_backgrounds.js'
export type {VectorBackgroundDef} from './vector_backgrounds.js'
export {generate_palette} from './design.js'
export type {PaletteScheme} from './design.js'
export {tinted_contrast_text, pick_vivid_tint, synthesize_fill, blend_regions, region_hex} from './design.js'
export type {RegionStats} from './design.js'
export {make_blank_form_values} from './form_state.js'
export type {FormState, EmbedFormState} from './form_state.js'
export {build_schema, curly_quotes, parse_font_family} from './form_schema.js'
export type {CustomFontStyle, ImageRegions} from './form_schema.js'
export {derive_colors, hex_override_to_hsl, hex_to_hsl, is_dark_color} from './colors.js'
export type {DerivedColors} from './colors.js'
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
export {cover_schema, calculate_font_sizes, resolve_colors, darken_hsl}
export {resolve_font_families, resolve_font_configs} from './design.js'
export {resolve_dimensions} from './dimensions.js'
export type {GetDimensionsResult} from './dimensions.js'
export {calculate_crop_regions, calculate_pixel_crop_regions,
    split_svg, split_png, split_pdf} from './split.js'
export {resolve_icon} from './icon_cache.js'
export {frame_image, frame_asset_path} from './frame.js'

/**
 * Wrap each CJK sentence segment of the blurb markup in a #text(font:) span putting that
 * sentence's regional family first, so a blurb mixing e.g. Japanese and Chinese sentences
 * renders each language with its own glyph shapes (per-glyph font fallback alone can't tell
 * shared Han characters apart). Safe on Typst markup: the wrapped ranges contain only CJK
 * characters, which are never Typst syntax.
 */
function wrap_blurb_cjk(
    markup:string,
    han_variant:CjkVariant,
    style:FontStyle,
    chain:string[],
):string {
    const segments = cjk_segments(markup, han_variant)
    if (segments.length === 0) {
        return markup
    }
    let out = ''
    let pos = 0
    for (const segment of segments) {
        const family = cjk_family(segment.region, style)
        if (!family) {
            continue
        }
        // The chosen font stays first (it rarely covers CJK, and wins when it does), then
        // the segment's regional family, then the rest of the field chain as a safety net
        const fonts = [chain[0], family, ...chain.slice(1).filter(f => f !== family)]
        const font_list = fonts.map(f => `"${escape_typst_str(f)}"`).join(', ')
        out += markup.slice(pos, segment.start)
        out += `#text(font: (${font_list},))[${markup.slice(segment.start, segment.end)}]`
        pos = segment.end
    }
    return out + markup.slice(pos)
}

/**
 * Validate schema, compute all derived values, and build every file needed
 * for typst compilation — entirely in memory.
 *
 * Returns the virtual filesystem (filename → bytes) and the resolved cover
 * dimensions so callers can use them for splitting without a second lookup.
 *
 * templates defaults to the cover.typ/_helpers.typ baked into this package version
 * (see generated/templates_data.ts) — pass an override only to test unreleased template changes.
 */
export async function build(
    schema:CoverSchema,
    image?:{data:Uint8Array, ext:string},
    frame_fn?:FrameImageFn,
    frame_data?:Blob,
    templates:Templates = DEFAULT_TEMPLATES,
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
    const configs = resolve_font_configs(schema_resolved)
    const font_sizes = calculate_font_sizes(schema_resolved, dims)

    // Build each field's Typst font fallback list: the chosen family first, then one Noto
    // family per non-Latin script in that field's own text, matching the field font's
    // serif/sans style where Noto covers it (Typst tries fonts in array order and skips
    // glyphs it can't find). Han-only sentences tiebreak against the field's own region
    // in auto mode (an explicit cjk_variant applies cover-wide).
    const fallback_chain = (config:FontConfig, text:string):string[] => {
        const style = font_style(config.family, config.style)
        const cjk_variant = resolve_field_cjk_variant(schema_resolved, text)
        const extra = resolve_fallback_chain(text, cjk_variant, style)
        return [config.family, ...extra.filter(f => f !== config.family)]
    }
    const font_title1_family_arr = fallback_chain(configs.title1, schema_resolved.title1 ?? '')
    const font_title2_family_arr = fallback_chain(configs.title2, schema_resolved.title2 ?? '')
    const font_title3_family_arr = fallback_chain(configs.title3, schema_resolved.title3 ?? '')
    const font_subtitle_family_arr = fallback_chain(configs.subtitle, schema_resolved.subtitle ?? '')
    const font_author_family_arr = fallback_chain(configs.author, schema_resolved.author ?? '')
    const font_blurb_family_arr = fallback_chain(configs.blurb, schema_resolved.blurb ?? '')
    const font_spine_title_family_arr = fallback_chain(configs.spine_title, schema_resolved.spine_title ?? '')
    const font_spine_author_family_arr = fallback_chain(configs.spine_author, schema_resolved.spine_author ?? '')

    // Body is the document-wide default font list: the base family plus every fallback any
    // field chain references — a safety net for text rendered outside the field boxes that
    // never pulls in font families the fields haven't already loaded
    const font_body_family_arr = [
        configs.body.family,
        ...collect_fallback_fonts(schema_resolved).filter(f => f !== configs.body.family),
    ]

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

    // Resolve a built-in vector background into SVG bytes when no photo was supplied — the
    // palette is derived from the resolved front background color so it always tracks bg_color
    let vector_image:ImageInput | undefined
    if (!image && schema_resolved.bg_vector_id) {
        const design = find_vector_background(schema_resolved.bg_vector_id)
        if (design) {
            const palette = generate_palette(colors.front_background, design.color_count, design.scheme)
            vector_image = {data: encoder.encode(design.render(palette)), ext: '.svg', is_vector: true}
        }
    }

    // Pre-process image with frame effect when bg_image_coverage is 'painted' and a frame_fn was
    // injected — never applies to a generated vector background (canvas framing needs a photo)
    let processed_image = image ?? vector_image
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

    // Wrap mixed-language CJK sentences in the blurb with their own regional fonts. Only
    // the copy handed to file assembly is wrapped — font sizing above uses the raw text.
    const schema_files = {
        ...schema_resolved,
        blurb: wrap_blurb_cjk(
            schema_resolved.blurb ?? '',
            resolve_field_cjk_variant(schema_resolved, schema_resolved.blurb ?? ''),
            font_style(configs.blurb.family, configs.blurb.style),
            font_blurb_family_arr,
        ),
    }

    const files = build_cover_files(
        templates, schema_files, dims, colors,
        font_body_family_arr,
        font_title1_family_arr, font_title2_family_arr, font_title3_family_arr,
        font_subtitle_family_arr, font_author_family_arr, font_blurb_family_arr,
        font_spine_title_family_arr, font_spine_author_family_arr,
        font_sizes, processed_image, icon_main, icon_ghost, icon_ghost2, icon_spine, icon_bg, pattern_file,
    )
    return {files, dims}
}
