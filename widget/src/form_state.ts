
// Shared reactive form state and injection keys for the cover generator. The FormState type
// and blank values now live in bookcover-core (re-exported here via bookcover-web) so hosts
// can build schemas from stored forms — this module keeps only the Vue-specific parts

import {reactive} from 'vue'
import type {InjectionKey, Ref, ShallowRef} from 'vue'
import {make_blank_form_values} from 'bookcover-web'
import type {FormState} from 'bookcover-web'
import type {PmDoc, PmNode} from 'pm-to-typst'
import type {GeneratorWorkerClient} from './generator_client'

// Re-export so the many widget importers keep working unchanged
export {make_blank_form_values}
export type {FormState}


// Injection keys for provide/inject across the component tree
export const FORM_KEY: InjectionKey<FormState> = Symbol('form')
export const IS_MOBILE_KEY: InjectionKey<Ref<boolean>> = Symbol('is_mobile')
export const FULL_SVG_KEY: InjectionKey<Ref<string | null>> = Symbol('full_svg')
export const GENERATOR_KEY: InjectionKey<ShallowRef<GeneratorWorkerClient | null>> =
    Symbol('generator')
export const INIT_ERROR_KEY: InjectionKey<Ref<string | null>> = Symbol('init_error')


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


/** Create a reactive FormState with no demo content — used when an embed host seeds the form,
 *  so fields the preset doesn't cover come out blank rather than leaking demo text/colors */
export function make_blank_form(): FormState {
    return reactive(make_blank_form_values())
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
        bg_vector_id: 'seagulls',
        pattern_id: 'morphing-diamonds',
    })
}
