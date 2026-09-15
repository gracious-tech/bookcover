
// Pure functions for building the cover generator schema from form state

import {pm_to_typst} from 'pm-to-typst'
import type {PmDoc} from 'pm-to-typst'
import type {FontStyle} from 'typst-fonts'
import type {EmbedFormState} from './form_state.js'
import {hex_override_to_hsl} from './colors.js'
import {find_pattern} from './patterns.js'
import {warn_unknown} from './utils.js'

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

/** Normalise a font field's raw input to a bare family name, for storing. Editors should call
 *  this when the field is committed so a pasted Google Fonts URL never reaches the record — a
 *  URL stored as a family resolves in neither the WASM nor the CLI render. Returns '' when the
 *  input is empty or unrecognisable (meaning "use the default family"). */
export function normalize_font_family(text:string):string {
    return parse_font_family(text) ?? ''
}

/** Every font family named anywhere in a form, deduped, in field order. Returned UNFILTERED —
 *  callers that care about which families they can supply (e.g. to snapshot uploaded fonts with
 *  a saved version) intersect against their own library, so families this package doesn't know
 *  about are never silently dropped. */
export function font_families_in_form(form:EmbedFormState):string[] {
    const families:string[] = []
    for (const [key, value] of Object.entries(form)) {
        if (!key.endsWith('_font') || typeof value !== 'string')
            continue
        const family = parse_font_family(value)
        if (family && !families.includes(family))
            families.push(family)
    }
    return families
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

/**
 * Assemble the full flat schema object from form values.
 *
 * Every field backed by a fixed default is emitted EXPLICITLY — this function knows nothing
 * about default values and never omits a field for matching one. That is what makes a stored
 * record deterministic: the render can't drift when a default in this package changes, and the
 * schema alone (plus RENDER_VERSION) determines the output.
 *
 * A field is left out only to request a DERIVATION that can't be a constant because it depends
 * on other fields — auto-contrast text colors, the blurb background, spine text falling back to
 * the titles, an icon color sampled from the image. Each of those is driven by an explicit
 * sentinel in the form ('auto'/null/''), never by a missing key in the record.
 *
 * custom_fonts supplies the sniffed serif/sans style of user-uploaded families (their bytes
 * travel separately to the compiler). Never reads a background image — that too is passed to
 * the generators out-of-band.
 */
export function build_schema(
    form:EmbedFormState,
    custom_fonts?:CustomFontStyle[],
):Record<string, unknown> {
    const q = curly_quotes

    // Size/print fields. A 'custom' service has no print spec, so bleed and spine come from the
    // form; every real service computes them from the page count instead
    const size_fields:Record<string, unknown> = {}
    if (form.service_id === 'custom') {
        size_fields['custom_bleed'] = form.custom_bleed
        size_fields['custom_spine'] = form.custom_spine
        size_fields['custom_unit'] = form.custom_unit
    } else {
        size_fields['page_count'] = form.page_count
    }
    if (form.size_mode === 'custom') {
        size_fields['custom_trim_width'] = form.custom_trim_width
        size_fields['custom_trim_height'] = form.custom_trim_height
        size_fields['custom_unit'] = form.custom_unit
    } else {
        size_fields['size_id'] = form.size_id
    }

    // Pattern ID resolves to its tile size here; the generator resolves the ID to SVG
    let pattern_fields:Record<string, unknown> = {}
    if (form.pattern_id) {
        const pat = find_pattern(form.pattern_id)
        if (pat) {
            pattern_fields = {
                pattern: form.pattern_id,
                pattern_tile_mm: pat.tile_mm * form.pattern_scale,
            }
        } else {
            warn_unknown('pattern_id', form.pattern_id)
        }
    }

    return {
        // Text
        title1: q(form.title1),
        title1_font: build_font_config(form.title1_font, custom_fonts),
        title1_size: form.title1_size,
        title1_weight: form.title1_weight,
        title1_italic: form.title1_italic,
        title1_color: hex_override_to_hsl(form.title1_color) ?? undefined,

        title2: q(form.title2),
        title2_font: build_font_config(form.title2_font, custom_fonts),
        title2_size: form.title2_size,
        title2_weight: form.title2_weight,
        title2_italic: form.title2_italic,
        title2_color: hex_override_to_hsl(form.title2_color) ?? undefined,

        title3: q(form.title3),
        title3_font: build_font_config(form.title3_font, custom_fonts),
        title3_size: form.title3_size,
        title3_weight: form.title3_weight,
        title3_italic: form.title3_italic,
        title3_color: hex_override_to_hsl(form.title3_color) ?? undefined,

        title_alignment: form.title_alignment,
        title_position: form.title_position,
        title_spacing: form.title_spacing,
        title_margin_top: form.title_margin_top,
        title_margin_bottom: form.title_margin_bottom,

        subtitle: q(form.subtitle),
        subtitle_font: build_font_config(form.subtitle_font, custom_fonts),
        subtitle_size: form.subtitle_size,
        subtitle_weight: form.subtitle_weight,
        subtitle_italic: form.subtitle_italic,
        subtitle_color: hex_override_to_hsl(form.subtitle_color) ?? undefined,
        subtitle_alignment: form.subtitle_alignment,
        subtitle_position: form.subtitle_position,
        subtitle_spacing: form.subtitle_spacing,
        subtitle_margin_top: form.subtitle_margin_top,
        subtitle_margin_bottom: form.subtitle_margin_bottom,

        author: q(form.author),
        author_font: build_font_config(form.author_font, custom_fonts),
        author_size: form.author_size,
        author_weight: form.author_weight,
        author_italic: form.author_italic,
        author_color: hex_override_to_hsl(form.author_color) ?? undefined,
        author_alignment: form.author_alignment,
        author_position: form.author_position,
        author_margin_top: form.author_margin_top,
        author_margin_bottom: form.author_margin_bottom,

        // An empty blurb stays absent — there is nothing to render, not a default to apply
        blurb: build_blurb(form.blurb),
        blurb_font: build_font_config(form.blurb_font, custom_fonts),
        blurb_size: form.blurb_size,
        blurb_color: hex_override_to_hsl(form.blurb_color) ?? undefined,
        // 'auto' asks resolve_colors() to derive it; null is an explicit transparent
        blurb_bg_color: form.blurb_bg_color === 'auto'
            ? undefined
            : form.blurb_bg_color === null
                ? null
                : hex_override_to_hsl(form.blurb_bg_color) ?? undefined,
        blurb_alignment: form.blurb_alignment,
        blurb_padding: form.blurb_padding,
        blurb_width: form.blurb_width,
        blurb_spacing: form.blurb_spacing,

        // Empty spine text asks the generator to derive it from the titles/author
        spine_title: form.spine_title || undefined,
        spine_title_font: build_font_config(form.spine_title_font, custom_fonts),
        spine_title_size: form.spine_title_size,
        spine_title_weight: form.spine_title_weight,
        spine_title_italic: form.spine_title_italic,
        spine_title_color: hex_override_to_hsl(form.spine_title_color) ?? undefined,

        spine_author: form.spine_author || undefined,
        spine_author_font: build_font_config(form.spine_author_font, custom_fonts),
        spine_author_size: form.spine_author_size,
        spine_author_weight: form.spine_author_weight,
        spine_author_italic: form.spine_author_italic,
        spine_author_color: hex_override_to_hsl(form.spine_author_color) ?? undefined,

        // Size & print
        service_id: form.service_id,
        binding_type: form.service_id === 'custom' ? 'paperback' : form.binding_type,
        ink_type: form.ink_type || undefined,
        paper_type: form.paper_type || undefined,
        ...size_fields,

        margin_front: form.margin_front,
        margin_back: form.margin_back,
        home_print_margin: form.home_print_margin,

        // Background
        bg_image_coverage: form.bg_image_coverage,
        bg_color: hex_override_to_hsl(form.bg_color) ?? undefined,
        bg_color_gradient: form.bg_color_gradient,

        // icon_mode only means something with an icon; icon_color unset is derived from the
        // image/background rather than defaulted
        ...(form.icon_id ? {icon_id: form.icon_id, icon_mode: form.icon_mode} : {}),
        icon_size: form.icon_size,
        icon_color: form.icon_color || undefined,
        icon_spine: form.icon_spine,

        ...pattern_fields,
        pattern_color: form.pattern_color || undefined,

        bg_vector_id: form.bg_vector_id || undefined,

        spine_color: hex_override_to_hsl(form.spine_color),

        // Other
        isbn: form.isbn,
        cjk_variant: form.cjk_variant !== 'auto' ? form.cjk_variant : undefined,
    }
}
