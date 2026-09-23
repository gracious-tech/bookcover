
// Version markers and the single source of truth for every fixed default.
//
// Two distinct kinds of default live here and they deliberately do NOT have to agree:
//
//   SCHEMA_DEFAULTS — what an OMITTED CoverSchema field means at render time. Only direct
//     CoverSchema callers reach these; build_schema() always emits a value for every field
//     backed by one, so a stored form never depends on them (see form_schema.ts).
//   FORM_DEFAULTS — the blank starting values of the editing form. A UI concern only.
//
// Fields whose unset meaning is DERIVED from other fields (auto-contrast text colors, the
// blurb background, spine text falling back to the titles) have no entry here — they can't be
// a constant, so they stay resolved in design.ts and are requested with an explicit sentinel
// ('auto'/null) rather than by omitting the key. Absence never carries meaning.

import type {FormState} from './form_state.js'

/** Shape of the stored record (EmbedFormState). Bump only when the record's SHAPE changes in a
 *  way a reader must branch on — not for render changes, which RENDER_VERSION covers. */
export const SCHEMA_VERSION = 1

/** Bumped whenever anything that can change rendered output changes: the Typst templates,
 *  SCHEMA_DEFAULTS, the derivations in design.ts/font_sizes.ts, font fallback resolution, or
 *  the bundled pattern/vector/icon data. Hosts that re-render a frozen record later should
 *  record this at freeze time (alongside the typst version their wrapper reports) so a drifted
 *  reprint is detectable instead of silent. */
export const RENDER_VERSION = 2

/** What an omitted CoverSchema field resolves to at render time. Derived fields are absent by
 *  design — see the note at the top of this file. */
export const SCHEMA_DEFAULTS = {

    // Text styling
    title1_size: 1,
    title1_weight: 700,
    title1_italic: false,
    title2_size: 1,
    title2_weight: 700,
    title2_italic: false,
    title3_size: 1,
    title3_weight: 700,
    title3_italic: false,
    subtitle_size: 1,
    subtitle_weight: 100,
    subtitle_italic: false,
    author_size: 1,
    author_weight: 400,
    author_italic: false,
    spine_title_size: 1,
    spine_title_weight: 700,
    spine_title_italic: false,
    spine_author_size: 1,
    spine_author_weight: 400,
    spine_author_italic: false,
    blurb_size: 1,

    // Alignment and position
    title_alignment: 'center',
    subtitle_alignment: 'center',
    author_alignment: 'center',
    blurb_alignment: 'left',

    // Spacing and margins (percent of trim height unless noted)
    title_spacing: 3,
    title_margin_top: 3,
    title_margin_bottom: 3,
    subtitle_spacing: 1.5,
    subtitle_margin_top: 3,
    subtitle_margin_bottom: 3,
    author_margin_top: 3,
    author_margin_bottom: 3,
    blurb_padding: 3,
    blurb_width: 100,
    blurb_spacing: 1,
    margin_front: 8,
    margin_back: 5,
    home_print_margin: false,

    // Background
    bg_image_coverage: 'front',
    icon_mode: 'center',
    icon_size: 1,
    icon_spine: false,
    pattern_tile_mm: 80,

    // Custom size
    custom_unit: 'mm',
    custom_bleed: 0,
    custom_spine: 0,

} as const

/** Blank starting values for the editing form. Every field is written explicitly, so a stored
 *  record is always complete and changing a default here can never shift an existing cover. */
export const FORM_DEFAULTS:FormState = {

    schema_version: SCHEMA_VERSION,

    // TEXT — all empty, styles at their form defaults

    title1: '',
    title1_font: '',
    title1_size: 1,
    title1_weight: 700,
    title1_italic: false,
    title1_color: null,

    title2: '',
    title2_font: '',
    title2_size: 1,
    title2_weight: 700,
    title2_italic: false,
    title2_color: null,

    title3: '',
    title3_font: '',
    title3_size: 1,
    title3_weight: 700,
    title3_italic: false,
    title3_color: null,

    title_alignment: 'center',
    title_position: 'top',
    title_spacing: 3,
    title_margin_top: 3,
    title_margin_bottom: 3,

    subtitle: '',
    subtitle_font: '',
    subtitle_size: 1,
    subtitle_weight: 700,
    subtitle_italic: false,
    subtitle_color: null,
    subtitle_alignment: 'center',
    subtitle_position: 'top',
    subtitle_spacing: 1.5,
    subtitle_margin_top: 3,
    subtitle_margin_bottom: 3,

    author: '',
    author_font: '',
    author_size: 1,
    author_weight: 700,
    author_italic: false,
    author_color: null,
    author_alignment: 'center',
    author_position: 'bottom',
    author_margin_top: 3,
    author_margin_bottom: 3,

    blurb: {type: 'doc', content: [{type: 'paragraph'}]},
    blurb_font: '',
    blurb_size: 1,
    blurb_color: null,
    blurb_bg_color: 'auto',
    blurb_alignment: 'left',
    blurb_padding: 3,
    blurb_width: 100,
    blurb_spacing: 1,

    spine_title: '',
    spine_title_font: '',
    spine_title_size: 1,
    spine_title_weight: 700,
    spine_title_italic: false,
    spine_title_color: null,

    spine_author: '',
    spine_author_font: '',
    spine_author_size: 1,
    spine_author_weight: 400,
    spine_author_italic: false,
    spine_author_color: null,

    // SIZE — service defaults, so print config is always preserved

    service_id: 'lulu',
    size_mode: 'preset',
    size_id: 'us_trade',
    page_count: 300,
    binding_type: 'paperback',
    ink_type: 'bw',
    paper_type: 'white',

    custom_unit: 'mm',
    custom_trim_width: 152,
    custom_trim_height: 229,
    custom_bleed: 3,
    custom_spine: 10,

    margin_front: 8,
    margin_back: 5,
    home_print_margin: false,

    // BACKGROUND — white, no image, no icon, no pattern

    bg_image: null,
    bg_image_builtin: null,
    bg_image_coverage: 'full',

    bg_color: null,
    bg_color_gradient: false,

    icon_id: null,
    icon_mode: 'center',
    icon_size: 1,
    icon_color: null,
    icon_spine: true,

    pattern_id: null,
    pattern_scale: 1,
    pattern_color: null,

    bg_vector_id: null,

    spine_color: null,

    // OTHER

    isbn: '',
    cjk_variant: 'auto',
}
