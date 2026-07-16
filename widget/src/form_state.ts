
// Shared reactive form state and injection key for the cover generator

import {reactive} from 'vue'
import type {InjectionKey, Ref, ShallowRef} from 'vue'
import type {CjkVariant} from 'bookcover-web'
import type {PmDoc, PmNode} from 'pm-to-typst'
import type {GeneratorWorkerClient} from './generator_client'

/** All form fields for the book cover generator */
export interface FormState {

    // TEXT

    title1: string
    title1_font: string
    title1_size: number  // Text size is a relative x0.5 -> x2 modifier on the default font size
    title1_weight: number  // Defaults to 400
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
    blurb_bg_color: string | null | undefined
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
    size_id: string    // service size ID, or '' for custom
    page_count: number
    binding_type: string
    ink_type: string
    paper_type: string

    custom_unit: string    // custom size unit affecting both trim and bleed/spine
    custom_trim_width: number    // custom size width (used when size_id is '')
    custom_trim_height: number    // custom size height (used when size_id is '')
    custom_bleed: number
    custom_spine: number

    margin_front:number
    margin_back:number

    // BACKGROUND

    bg_image: File | null
    bg_image_coverage: 'full' | 'front' | 'painted' | 'feature' | 'front_partial'

    bg_color: string
    bg_color_gradient: boolean

    icon_id: string | null
    icon_mode: 'center' | 'offset' | 'echo' | 'background'
    icon_size: number  // Relative size multiplier
    icon_color: string | null
    icon_spine: boolean

    pattern_id: string | null
    pattern_scale: number
    pattern_color: string | null

    spine_color: string | null

    // OTHER

    isbn: string
    cjk_variant: CjkVariant | 'auto'  // Regional glyph style for Han characters
}


// Injection keys for provide/inject across the component tree
export const FORM_KEY: InjectionKey<FormState> = Symbol('form')
export const IS_MOBILE_KEY: InjectionKey<Ref<boolean>> = Symbol('is_mobile')
export const FULL_SVG_KEY: InjectionKey<Ref<string | null>> = Symbol('full_svg')
export const GENERATOR_KEY: InjectionKey<ShallowRef<GeneratorWorkerClient | null>> =
    Symbol('generator')
export const INIT_ERROR_KEY: InjectionKey<Ref<string | null>> = Symbol('init_error')

/** Plain object with blank/empty values — no demo content, white background, no icon or pattern */
export function make_blank_form_values(): FormState {
    return {

        // TEXT — all empty, styles at their defaults

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

        blurb: empty_doc(),
        blurb_font: '',
        blurb_size: 1,
        blurb_color: null,
        blurb_bg_color: undefined,
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

        // SIZE — keep service defaults so print config is preserved

        service_id: 'lulu',
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
        margin_back: 8,

        // BACKGROUND — white, no image, no icon, no pattern

        bg_image: null,
        bg_image_coverage: 'full',

        bg_color: '#ffffff',
        bg_color_gradient: false,

        icon_id: null,
        icon_mode: 'center',
        icon_size: 1,
        icon_color: null,
        icon_spine: true,

        pattern_id: null,
        pattern_scale: 1,
        pattern_color: null,

        spine_color: null,

        // OTHER

        isbn: '',
        cjk_variant: 'auto',
    }
}


// Small builders for composing the demo blurb as a ProseMirror document
function text(value:string):PmNode {
    return {type: 'text', text: value}
}
function bold(value:string):PmNode {
    return {type: 'text', text: value, marks: [{type: 'bold'}]}
}
function para(...content:PmNode[]):PmNode {
    return {type: 'paragraph', content}
}
function heading(level:number, value:string):PmNode {
    return {type: 'heading', attrs: {level}, content: [text(value)]}
}
function item(...content:PmNode[]):PmNode {
    return {type: 'listItem', content: [{type: 'paragraph', content}]}
}

/** An empty document — the blank-form blurb value */
function empty_doc():PmDoc {
    return {type: 'doc', content: [{type: 'paragraph'}]}
}

// Demo blurb shown in the initial preview, as ProseMirror/Tiptap document JSON
const default_blurb:PmDoc = {
    type: 'doc',
    content: [
        heading(1, 'Instant book covers that actually look kinda decent...'),
        para(text('This is a free tool that generates print-ready book covers — front, back, '
            + 'spine, and all.')),
        para(text('Designing a book cover can be complicated. You need to understand concepts '
            + 'like bleed and spine width, otherwise your cover will end up the wrong size. '
            + 'Changing the type of paper or adding some pages will affect the size of your '
            + 'cover as well.')),
        para(text("This app takes care of all of those things for you, so you don't need to "
            + 'worry about them.')),
        heading(2, 'Here are a few tips as you get started:'),
        {type: 'bulletList', content: [
            item(text('COVER TEXT and BOOK SIZE options need to be correct, the rest is just '
                + 'aesthetics.')),
            item(text('Decide on your background before touching any other style options. If '
                + 'you use a custom image, choose one with an empty area at the top (like sky) '
                + 'to place your title (see our suggested images for examples of this).')),
            item(text('White or black text will work 90% of the time. Be careful putting '
                + 'colorful text on a colorful background as it can be hard to get right.')),
            item(text('Use the zoom tool in the "Parts" and "Print" views to know exactly how '
                + 'big the book will be.')),
            item(text("Need to change something that the app doesn't allow? Simply \"Save "
                + 'Image" in the "Print" view to get an SVG you can edit in a free app like '),
                bold('Inkscape'),
                text(" and export to PDF when you're done.")),
        ]},
        heading(2, 'Go make a great cover!'),
    ],
}


/** Create a reactive FormState with demo values for initial preview */
export function make_form(): FormState {
    return reactive({
        ...make_blank_form_values(),

        // Text
        title1: 'The',
        title2: 'Book Cover',
        subtitle: 'Read the back...',
        author: 'Gracious Tech',
        blurb: default_blurb,

        // Font
        title1_size: 0.75,
        title2_size: 2,

        // Demo background
        bg_image_coverage: 'front',
        bg_color: '#8ab0b4',
        pattern_id: 'bank-note',
        spine_color: '#f291c5',
    })
}
