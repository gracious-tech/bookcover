
// Shared fixtures: a stand-in font manifest, plus schema/form/dimension factories so each test
// states only the fields it actually cares about

import {init_fonts} from 'typst-fonts'
import type {BundledFont} from 'typst-fonts'
import type {CoverSchema} from '../src/schema.js'
import type {EmbedFormState} from '../src/form_state.js'
import {FORM_DEFAULTS} from '../src/defaults.js'
import {resolve_dimensions} from '../src/dimensions.js'
import type {DimensionInputs, GetDimensionsResult} from '../src/dimensions.js'

// A curated manifest standing in for the real assets/fonts/manifest.json, which isn't committed
// (see .bin/download_fonts). Noto Serif must stay first — base_font() is defined as entry one —
// and the other two cover the serif/sans split that Noto fallback selection keys off
const TEST_MANIFEST:BundledFont[] = [
    {family: 'Noto Serif', group: 'Noto', style: 'serif',
        files: ['NotoSerif-Regular.ttf'], preview_file: 'NotoSerif-Regular.ttf'},
    {family: 'Playfair Display', group: 'Serif', style: 'serif',
        files: ['PlayfairDisplay-Regular.ttf'], preview_file: 'PlayfairDisplay-Regular.ttf'},
    {family: 'Test Sans', group: 'Sans', style: 'sans',
        files: ['TestSans-Regular.ttf'], preview_file: 'TestSans-Regular.ttf'},
]

/** Load the stand-in manifest — anything touching fonts.ts or build() needs this first, since
 *  typst-fonts throws on every lookup until a loader has run (generator itself never loads) */
export function init_test_fonts():void {
    init_fonts({font_manifest: TEST_MANIFEST})
}

/** A minimal valid CoverSchema — only the fields with no default are filled in, so anything a
 *  test doesn't override stays genuinely unset (which is what the derivation paths key off) */
export function make_schema(overrides:Partial<CoverSchema> = {}):CoverSchema {
    return {
        title1: 'The',
        title2: 'Art of Code',
        title3: '',
        title_position: 'top',
        subtitle: 'A journey through software craft',
        subtitle_position: 'middle',
        author: 'Alice Chen',
        author_position: 'bottom',
        blurb: 'A deep dive into great software.',
        service_id: 'kdp',
        binding_type: 'paperback',
        ink_type: 'bw',
        paper_type: 'white',
        size_id: 'us_trade',
        page_count: 300,
        isbn: '978-3-16-148410-0',
        ...overrides,
    }
}

/** A complete stored form record — FORM_DEFAULTS with the blurb doc cloned, so a test mutating
 *  one form can't leak into the next */
export function make_form(overrides:Partial<EmbedFormState> = {}):EmbedFormState {
    return {...FORM_DEFAULTS, blurb: structuredClone(FORM_DEFAULTS.blurb), ...overrides}
}

/** Resolved dimensions for the default KDP US Trade paperback, or any variation on it */
export function make_dims(overrides:Partial<DimensionInputs> = {}):GetDimensionsResult {
    return resolve_dimensions({
        service_id: 'kdp',
        size_id: 'us_trade',
        page_count: 300,
        binding_type: 'paperback',
        ink_type: 'bw',
        paper_type: 'white',
        ...overrides,
    })
}
