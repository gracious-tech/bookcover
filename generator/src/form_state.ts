
// Form state types for cover-editing UIs, and blank default values. The form is the
// user-facing editing model; build_schema (form_schema.ts) converts it to the generator schema

import type {CjkVariant} from 'typst-fonts'
import type {PmDoc} from 'pm-to-typst'
import {FORM_DEFAULTS} from './defaults.js'

/** JSON-safe form values — every form field except the bg_image binary. This is the shape
 *  hosts store and round-trip (e.g. via the widget's embed protocol).
 *
 *  Two invariants hosts can rely on, and must preserve:
 *  - NO BINARIES. The background image and custom font bytes are never in this record; they
 *    are referenced out-of-band by the host, which owns their storage and identity. The widget
 *    reports which built-in background the user picked as an advisory protocol field, never as
 *    a field in here (see generator-web's embed_types.ts).
 *  - ABSENCE MEANS NOTHING. Every field is always present and explicitly valued. Where a value
 *    is meant to be derived at render time, it says so with an explicit sentinel ('auto'/null),
 *    never by omitting the key — so a record's meaning can't shift when a default changes. */
export interface EmbedFormState {

    // Shape of this record — see SCHEMA_VERSION in defaults.ts
    schema_version: number

    // TEXT

    title1: string
    title1_font: string
    title1_size: number  // Text size is a relative x0.5 -> x2 modifier on the default font size
    title1_weight: number  // CSS-style numeric weight
    title1_italic: boolean
    title1_color: string | null  // Defaults to white/black 90% opacity on primary color

    // title2 style defaults to whatever title1 has
    title2: string
    title2_font: string
    title2_size: number
    title2_weight: number
    title2_italic: boolean
    title2_color: string | null

    // title3 style defaults to whatever title1 has
    title3: string
    title3_font: string
    title3_size: number
    title3_weight: number
    title3_italic: boolean
    title3_color: string | null

    title_alignment:'center'|'left'|'right'
    title_position:'top'|'middle'|'bottom'
    title_spacing:number
    title_margin_top:number
    title_margin_bottom:number

    subtitle: string
    subtitle_font: string
    subtitle_size: number
    subtitle_weight: number
    subtitle_italic: boolean
    subtitle_color: string | null
    subtitle_alignment:'center'|'left'|'right'
    subtitle_position:'top'|'middle'|'bottom'
    subtitle_spacing:number
    subtitle_margin_top:number
    subtitle_margin_bottom:number

    author: string
    author_font: string
    author_size: number
    author_weight: number
    author_italic: boolean
    author_color: string | null
    author_alignment:'center'|'left'|'right'
    author_position:'top'|'middle'|'bottom'
    author_margin_top:number
    author_margin_bottom:number

    blurb: PmDoc  // ProseMirror/Tiptap document JSON (rendered to Typst via pm-to-typst)
    blurb_font: string
    blurb_size: number
    blurb_color: string | null
    // 'auto' = derive from bg_color at render time; null = transparent; otherwise an explicit color
    blurb_bg_color: string | 'auto' | null
    blurb_alignment:'center'|'left'|'right'|'justified'
    blurb_padding:number
    blurb_width:number
    blurb_spacing:number

    spine_title: string  // Defaults to title1 + title2 + title3
    spine_title_font: string
    spine_title_size: number
    spine_title_weight: number
    spine_title_italic: boolean
    spine_title_color: string | null

    spine_author: string  // Defaults to author
    spine_author_font: string
    spine_author_size: number
    spine_author_weight: number
    spine_author_italic: boolean
    spine_author_color: string | null

    // SIZE

    service_id: string
    // Whether size comes from the service's size list or from the custom_trim_* fields. Replaces
    // the old sentinels (size_id: '' / service_id: 'custom'), which overloaded id fields whose
    // values come from printing-services
    size_mode: 'preset' | 'custom'
    // Service size ID. Always present (like every field here) — when size_mode is 'custom' it is
    // ignored, NOT omitted, so write '' rather than leaving a stale preset ID spread in from a
    // stored form. build_schema is what drops it from the schema in custom mode
    size_id: string
    page_count: number
    binding_type: string
    ink_type: string
    paper_type: string

    custom_unit: string    // custom size unit affecting both trim and bleed/spine
    custom_trim_width: number    // custom size width (used when size_mode is 'custom')
    custom_trim_height: number    // custom size height (used when size_mode is 'custom')
    custom_bleed: number
    custom_spine: number

    margin_front:number
    margin_back:number
    home_print_margin:boolean    // white rounded margin for home inkjet printers

    // BACKGROUND

    bg_image_coverage: 'full' | 'front' | 'painted' | 'feature' | 'front_partial'

    bg_color: string | null  // null = auto (complements the background image, white if none)
    bg_color_gradient: boolean

    // Icon ID only ('builtin:cross', or an Iconify ID like 'game-icons:sailboat') — never raw
    // SVG. CoverSchema.icon_id additionally accepts raw SVG for direct API callers; keeping it
    // out of the stored record keeps records small and single-typed
    icon_id: string | null
    icon_mode: 'center' | 'offset' | 'echo'
    icon_size: number  // Relative size multiplier
    icon_color: string | null
    icon_spine: boolean

    pattern_id: string | null
    pattern_scale: number
    pattern_color: string | null

    bg_vector_id: string | null

    spine_color: string | null

    // OTHER

    isbn: string
    cjk_variant: CjkVariant | 'auto'  // Regional glyph style for Han characters
}

/** Live form values — adds the background image File, which is held only in the browser and
 *  never serialized with the rest of the form */
export interface FormState extends EmbedFormState {
    bg_image: File | null
}

/** Plain object with blank/empty values — no demo content, white background, no icon or
 *  pattern. Values come from FORM_DEFAULTS; the blurb document is cloned so each form gets its
 *  own mutable ProseMirror doc. */
export function make_blank_form_values(): FormState {
    return {...FORM_DEFAULTS, blurb: structuredClone(FORM_DEFAULTS.blurb)}
}
