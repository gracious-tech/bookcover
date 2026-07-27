
// Pure functions for building the cover generator schema from form state

import {pm_to_typst} from 'pm-to-typst'
import type {PmDoc} from 'pm-to-typst'
import type {FontStyle} from 'typst-fonts'
import type {EmbedFormState} from './form_state.js'
import {derive_colors, hex_override_to_hsl} from './colors.js'
import {find_pattern} from './patterns.js'

/** Minimal shape build_schema needs to style custom fonts — typst-fonts' CustomFont is
 *  assignable, so callers can pass their uploaded-font store directly */
export interface CustomFontStyle {
    family:string
    style:FontStyle
}

/** Replace straight quotes with typographic curly quotes */
export function curly_quotes(text:string):string {
    return text
        // Opening double quote: after start-of-line, whitespace, or opening bracket
        .replace(/(^|[\s([{])"(?=\S)/gm, '$1“')
        // Remaining double quotes become closing
        .replace(/"/g, '”')
        // Opening single quote: after start-of-line, whitespace, or opening bracket
        .replace(/(^|[\s([{])'(?=\S)/gm, '$1‘')
        // Remaining single quotes become closing (also covers apostrophes)
        .replace(/'/g, '’')
}

/**
 * Render the blurb document to Typst markup. pm_to_typst escapes the text and the blurb is
 * emitted as a Typst content block (see data_file.ts), so Typst's own smartquote curls the
 * quotes — no manual curling needed here, unlike the plain-string title fields below.
 * Returns undefined when the blurb is empty.
 */
function build_blurb(doc:PmDoc):string | undefined {
    const typst = pm_to_typst(doc)
    return typst.trim() ? typst : undefined
}

/** Parse a font family name from user input. Accepts:
 *  - Plain font name: "Playwrite AR Guides"
 *  - Specimen URL:    https://fonts.google.com/specimen/Playwrite+AR+Guides
 */
export function parse_font_family(text:string):string | null {
    text = text.trim()

    // Specimen page URL: fonts.google.com/specimen/Font+Name[?...]
    const specimen = text.match(/fonts\.google\.com\/specimen\/([\w+%]+)/)
    if (specimen) {
        return decodeURIComponent(specimen[1].replace(/\+/g, ' '))
    }

    // Plain font name: letters, spaces, numbers only
    if (/^[A-Za-z0-9][A-Za-z0-9 ]+$/.test(text)) {
        return text
    }

    return null
}

/** Build an optional FontConfig from a raw font name or Google Fonts URL.
 *  Returns undefined when the string is empty or unrecognisable. */
function build_font_config(
    raw:string,
    custom_fonts?:CustomFontStyle[],
):{family:string, style?:'serif' | 'sans'} | undefined {
    if (!raw.trim())
        return undefined
    const family = parse_font_family(raw)
    if (!family)
        return undefined
    // Custom fonts aren't in the curated manifest, so pass their sniffed serif/sans style
    // for the generator's Noto fallback selection (bundled fonts carry their own)
    const custom = custom_fonts?.find(f => f.family === family)
    return custom ? {family, style: custom.style} : {family}
}

/** Assemble the full flat schema object from form values. custom_fonts supplies the sniffed
 *  serif/sans style of user-uploaded families (their bytes travel separately to the compiler).
 *  Never reads a background image — that too is passed to the generators out-of-band. */
export function build_schema(
    form:EmbedFormState,
    custom_fonts?:CustomFontStyle[],
):Record<string, unknown> {
    const q = curly_quotes

    // Derive colors from bg_color + spine_color, then apply per-field overrides
    const colors = derive_colors(form.bg_color, form.spine_color)

    // Build size/print fields
    const size_fields:Record<string, unknown> = {}
    if (form.service_id === 'custom') {
        size_fields['custom_bleed'] = form.custom_bleed
        size_fields['custom_spine'] = form.custom_spine
        size_fields['custom_unit'] = form.custom_unit
        if (form.size_id) {
            size_fields['size_id'] = form.size_id
        } else {
            size_fields['custom_trim_width'] = form.custom_trim_width
            size_fields['custom_trim_height'] = form.custom_trim_height
        }
    } else {
        size_fields['page_count'] = form.page_count
        if (form.size_id) {
            size_fields['size_id'] = form.size_id
        } else {
            size_fields['custom_trim_width'] = form.custom_trim_width
            size_fields['custom_trim_height'] = form.custom_trim_height
            size_fields['custom_unit'] = form.custom_unit
        }
    }

    // Pass pattern ID + scaled tile size (generator resolves ID to SVG)
    let pattern_fields:Record<string, unknown> = {}
    if (form.pattern_id) {
        const pat = find_pattern(form.pattern_id)
        if (pat) {
            pattern_fields = {
                pattern: form.pattern_id,
                pattern_tile_mm: pat.tile_mm * form.pattern_scale,
            }
        }
    }

    return {
        // Text
        title1: q(form.title1) || undefined,
        title1_font: build_font_config(form.title1_font, custom_fonts),
        title1_size: form.title1_size,
        title1_weight: form.title1_weight,
        title1_italic: form.title1_italic || undefined,
        title1_color: hex_override_to_hsl(form.title1_color) ?? undefined,

        title2: q(form.title2) || undefined,
        title2_font: build_font_config(form.title2_font, custom_fonts),
        title2_size: form.title2_size,
        title2_weight: form.title2_weight,
        title2_italic: form.title2_italic || undefined,
        title2_color: hex_override_to_hsl(form.title2_color) ?? undefined,

        title3: q(form.title3) || undefined,
        title3_font: build_font_config(form.title3_font, custom_fonts),
        title3_size: form.title3_size,
        title3_weight: form.title3_weight,
        title3_italic: form.title3_italic || undefined,
        title3_color: hex_override_to_hsl(form.title3_color) ?? undefined,

        title_alignment: form.title_alignment !== 'center' ? form.title_alignment : undefined,
        title_position: form.title_position,
        title_spacing: form.title_spacing !== 3 ? form.title_spacing : undefined,
        title_margin_top: form.title_margin_top !== 10 ? form.title_margin_top : undefined,
        title_margin_bottom: form.title_margin_bottom !== 10 ? form.title_margin_bottom : undefined,

        subtitle: form.subtitle ? q(form.subtitle) : undefined,
        subtitle_font: build_font_config(form.subtitle_font, custom_fonts),
        subtitle_size: form.subtitle_size,
        subtitle_weight: form.subtitle_weight,
        subtitle_italic: form.subtitle_italic || undefined,
        subtitle_color: hex_override_to_hsl(form.subtitle_color) ?? colors.front_subtitle,
        subtitle_alignment: form.subtitle_alignment !== 'center' ? form.subtitle_alignment : undefined,
        subtitle_position: form.subtitle_position,
        subtitle_spacing: form.subtitle_spacing !== 1.5 ? form.subtitle_spacing : undefined,
        subtitle_margin_top: form.subtitle_margin_top !== 10 ? form.subtitle_margin_top : undefined,
        subtitle_margin_bottom: form.subtitle_margin_bottom !== 10 ? form.subtitle_margin_bottom : undefined,

        author: form.author ? q(form.author) : undefined,
        author_font: build_font_config(form.author_font, custom_fonts),
        author_size: form.author_size,
        author_weight: form.author_weight,
        author_italic: form.author_italic || undefined,
        author_color: hex_override_to_hsl(form.author_color) ?? colors.front_author,
        author_alignment: form.author_alignment !== 'center' ? form.author_alignment : undefined,
        author_position: form.author_position,
        author_margin_top: form.author_margin_top !== 10 ? form.author_margin_top : undefined,
        author_margin_bottom: form.author_margin_bottom !== 10 ? form.author_margin_bottom : undefined,

        blurb: build_blurb(form.blurb),
        blurb_font: build_font_config(form.blurb_font, custom_fonts),
        blurb_size: form.blurb_size,
        blurb_color: hex_override_to_hsl(form.blurb_color) ?? colors.blurb,
        blurb_bg_color: form.blurb_bg_color === undefined
            ? colors.blurb_background  // auto-derived from bg_color
            : form.blurb_bg_color === null
                ? null  // transparent
                : hex_override_to_hsl(form.blurb_bg_color) ?? colors.blurb_background,
        blurb_alignment: form.blurb_alignment !== 'left' ? form.blurb_alignment : undefined,
        blurb_padding: form.blurb_padding !== 7 ? form.blurb_padding : undefined,
        blurb_width: form.blurb_width !== 80 ? form.blurb_width : undefined,
        blurb_spacing: form.blurb_spacing !== 1 ? form.blurb_spacing : undefined,

        spine_title: form.spine_title || undefined,
        spine_title_font: build_font_config(form.spine_title_font, custom_fonts),
        spine_title_size: form.spine_title_size,
        spine_title_weight: form.spine_title_weight,
        spine_title_italic: form.spine_title_italic || undefined,
        spine_title_color: hex_override_to_hsl(form.spine_title_color) ?? colors.spine_title,

        spine_author: form.spine_author || undefined,
        spine_author_font: build_font_config(form.spine_author_font, custom_fonts),
        spine_author_size: form.spine_author_size,
        spine_author_weight: form.spine_author_weight,
        spine_author_italic: form.spine_author_italic || undefined,
        spine_author_color: hex_override_to_hsl(form.spine_author_color) ?? colors.spine_author,

        // Size & print
        service_id: form.service_id === 'custom' ? 'custom' : form.service_id,
        binding_type: form.service_id === 'custom' ? 'paperback' : form.binding_type,
        ink_type: form.ink_type || undefined,
        paper_type: form.paper_type || undefined,
        ...size_fields,

        margin_front: form.margin_front !== 10 ? form.margin_front : undefined,
        margin_back: form.margin_back !== 10 ? form.margin_back : undefined,
        home_print_margin: form.home_print_margin || undefined,

        // Background
        bg_image_coverage: form.bg_image_coverage,
        bg_color: colors.front_background,
        bg_color_gradient: form.bg_color_gradient || undefined,

        ...(form.icon_id ? {icon_id: form.icon_id, icon_mode: form.icon_mode} : {}),
        icon_size: form.icon_size !== 1 ? form.icon_size : undefined,
        icon_color: form.icon_color || undefined,
        icon_spine: form.icon_spine || undefined,

        ...pattern_fields,
        pattern_color: form.pattern_color || undefined,

        spine_color: colors.spine_background,

        // Other
        isbn: form.isbn || undefined,
        cjk_variant: form.cjk_variant !== 'auto' ? form.cjk_variant : undefined,
    }
}
