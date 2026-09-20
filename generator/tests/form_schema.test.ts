
import {describe, it, expect} from 'vitest'

import {build_schema, curly_quotes, parse_font_family, normalize_font_family,
    font_families_in_form} from '../src/form_schema.js'
import {cover_schema} from '../src/schema.js'
import {FORM_DEFAULTS} from '../src/defaults.js'
import {make_form} from './helpers.js'

/** A blurb document with a single paragraph of the given text */
function blurb_doc(text:string) {
    return {type: 'doc', content: [{type: 'paragraph', content: [{type: 'text', text}]}]}
}

// The fields build_schema is allowed to leave out, and only to request a derivation that
// can't be a constant. Anything else missing would make a stored record depend on a default
const DERIVED_FIELDS = new Set([
    'title1_color', 'title2_color', 'title3_color', 'subtitle_color', 'author_color',
    'blurb_color', 'blurb_bg_color', 'spine_title_color', 'spine_author_color',
    'title1_font', 'title2_font', 'title3_font', 'subtitle_font', 'author_font', 'blurb_font',
    'spine_title_font', 'spine_author_font',
    'spine_title', 'spine_author', 'blurb', 'bg_color', 'icon_id', 'icon_mode', 'icon_color',
    'pattern_id', 'pattern_scale', 'pattern_color', 'bg_vector_id', 'ink_type', 'paper_type',
    'cjk_variant',
])


describe('curly_quotes', () => {

    it('opens and closes double quotes', () => {
        expect(curly_quotes('He said "hello" loudly')).toBe('He said “hello” loudly')
    })

    it('opens a quote at the start of a line and after an opening bracket', () => {
        expect(curly_quotes('"start"')).toBe('“start”')
        expect(curly_quotes('("inner")')).toBe('(“inner”)')
    })

    it('curls an apostrophe as a closing single quote', () => {
        expect(curly_quotes("don't")).toBe('don’t')
        expect(curly_quotes("'quoted'")).toBe('‘quoted’')
    })

    it('opens a quote on every line of a multi-line field', () => {
        expect(curly_quotes('"one"\n"two"')).toBe('“one”\n“two”')
    })

    it('leaves text without quotes untouched', () => {
        expect(curly_quotes('plain text')).toBe('plain text')
    })
})


describe('parse_font_family', () => {

    it('accepts a plain family name', () => {
        expect(parse_font_family('Playfair Display')).toBe('Playfair Display')
        expect(parse_font_family('  Playfair Display  ')).toBe('Playfair Display')
    })

    it('pulls the family out of a Google Fonts specimen URL', () => {
        expect(parse_font_family('https://fonts.google.com/specimen/Playwrite+AR+Guides'))
            .toBe('Playwrite AR Guides')
        expect(parse_font_family('https://fonts.google.com/specimen/Roboto?query=x')).toBe('Roboto')
    })

    it('rejects input that is neither, so it never reaches a record as a family', () => {
        // A URL stored as a family resolves in neither the WASM nor the CLI render
        for (const bad of ['', 'https://example.com/fonts', 'Font!', 'A'])
            expect(parse_font_family(bad), bad).toBeNull()
    })

    it('normalize_font_family returns an empty string for unusable input', () => {
        expect(normalize_font_family('https://fonts.google.com/specimen/Roboto')).toBe('Roboto')
        expect(normalize_font_family('nonsense!!')).toBe('')
        expect(normalize_font_family('')).toBe('')
    })
})


describe('font_families_in_form', () => {

    it('collects every family named in the form, deduped and in field order', () => {
        const form = make_form({title1_font: 'Playfair Display', title2_font: 'Playfair Display',
            author_font: 'Test Sans'})
        expect(font_families_in_form(form)).toEqual(['Playfair Display', 'Test Sans'])
    })

    it('normalises a pasted specimen URL like the rest of the form does', () => {
        const form = make_form({title1_font: 'https://fonts.google.com/specimen/Roboto'})
        expect(font_families_in_form(form)).toEqual(['Roboto'])
    })

    it('returns families this package has never heard of, rather than dropping them', () => {
        // Callers intersect against their own library — silent dropping would lose an upload
        expect(font_families_in_form(make_form({title1_font: 'Some Uploaded Family'})))
            .toEqual(['Some Uploaded Family'])
    })

    it('returns nothing for a form with no fonts chosen', () => {
        expect(font_families_in_form(make_form())).toEqual([])
    })
})


describe('build_schema record determinism', () => {

    it('emits every non-derived field explicitly, never relying on a default', () => {
        const schema = build_schema(make_form())
        for (const key of Object.keys(FORM_DEFAULTS)) {
            if (DERIVED_FIELDS.has(key) || key === 'schema_version' || key === 'size_mode')
                continue
            // The image is a binary, passed to the generators out-of-band (see below)
            if (key === 'bg_image')
                continue
            // Size fields are mode-dependent and checked separately below
            if (key.startsWith('custom_') || key === 'size_id' || key === 'page_count')
                continue
            expect(schema[key], key).toBeDefined()
        }
    })

    it('produces a schema the validator accepts', () => {
        expect(() => cover_schema.parse(build_schema(make_form()))).not.toThrow()
    })

    it('is unaffected by a change to any SCHEMA_DEFAULTS value', () => {
        // The point of emitting everything: nothing in the output can trace back to a default
        const schema = build_schema(make_form({title1_size: 1.5, blurb_padding: 7}))
        expect(schema['title1_size']).toBe(1.5)
        expect(schema['blurb_padding']).toBe(7)
    })

    it('carries no binary — the image and font bytes travel separately', () => {
        const schema = build_schema(make_form())
        expect(schema['bg_image']).toBeUndefined()
        expect(Object.keys(schema).some(k => k.includes('image') && k !== 'bg_image_coverage'))
            .toBe(false)
    })
})


describe('build_schema size handling', () => {

    it('sends a preset size as an id and omits the custom trim', () => {
        const schema = build_schema(make_form({size_mode: 'preset', size_id: 'us_trade'}))
        expect(schema['size_id']).toBe('us_trade')
        expect(schema['custom_trim_width']).toBeUndefined()
    })

    it('sends a custom size as trim measurements and omits the stale preset id', () => {
        const schema = build_schema(make_form({size_mode: 'custom', size_id: 'us_trade',
            custom_trim_width: 140, custom_trim_height: 216, custom_unit: 'mm'}))
        expect(schema['size_id']).toBeUndefined()
        expect(schema['custom_trim_width']).toBe(140)
        expect(schema['custom_unit']).toBe('mm')
    })

    it('sends a page count for a real service, and bleed/spine for a custom one', () => {
        const service = build_schema(make_form({service_id: 'kdp', page_count: 250}))
        expect(service['page_count']).toBe(250)
        expect(service['custom_spine']).toBeUndefined()
        const custom = build_schema(make_form({service_id: 'custom', custom_bleed: 3, custom_spine: 11}))
        expect(custom['page_count']).toBeUndefined()
        expect(custom['custom_bleed']).toBe(3)
        expect(custom['custom_spine']).toBe(11)
    })

    it('forces a plain paperback binding for the custom service, which has no binding list', () => {
        expect(build_schema(make_form({service_id: 'custom', binding_type: 'hardcover'}))
            ['binding_type']).toBe('paperback')
    })
})


describe('build_schema derivation sentinels', () => {

    it('curls the quotes in every plain-text field', () => {
        const schema = build_schema(make_form({title1: '"Quoted"', author: "O'Brien"}))
        expect(schema['title1']).toBe('“Quoted”')
        expect(schema['author']).toBe('O’Brien')
    })

    it('renders the blurb document to Typst markup', () => {
        const schema = build_schema(make_form({blurb: blurb_doc('A blurb.')}))
        expect(schema['blurb']).toBe('A blurb.')
    })

    it('leaves an empty blurb out — there is nothing to render', () => {
        expect(build_schema(make_form())['blurb']).toBeUndefined()
    })

    it('omits empty spine text so the generator derives it from the titles', () => {
        const derived = build_schema(make_form({spine_title: '', spine_author: ''}))
        expect(derived['spine_title']).toBeUndefined()
        expect(derived['spine_author']).toBeUndefined()
        const explicit = build_schema(make_form({spine_title: 'On The Spine'}))
        expect(explicit['spine_title']).toBe('On The Spine')
    })

    it('maps the blurb background sentinels onto omitted, null, and a color', () => {
        expect(build_schema(make_form({blurb_bg_color: 'auto'}))['blurb_bg_color']).toBeUndefined()
        expect(build_schema(make_form({blurb_bg_color: null}))['blurb_bg_color']).toBeNull()
        expect(build_schema(make_form({blurb_bg_color: '#ff0000'}))['blurb_bg_color'])
            .toBe('hsl(0deg, 100%, 50%)')
    })

    it('converts every explicit color override from hex to the schema HSL form', () => {
        const schema = build_schema(make_form({title1_color: '#ff0000', bg_color: '#0000ff'}))
        expect(schema['title1_color']).toBe('hsl(0deg, 100%, 50%)')
        expect(schema['bg_color']).toBe('hsl(240deg, 100%, 50%)')
    })

    it('omits an unset color so it auto-contrasts at render time', () => {
        const schema = build_schema(make_form({title1_color: null, bg_color: null}))
        expect(schema['title1_color']).toBeUndefined()
        expect(schema['bg_color']).toBeUndefined()
    })

    it('omits an auto cjk_variant, and passes an explicit one through', () => {
        expect(build_schema(make_form({cjk_variant: 'auto'}))['cjk_variant']).toBeUndefined()
        expect(build_schema(make_form({cjk_variant: 'JP'}))['cjk_variant']).toBe('JP')
    })

    it('sends icon_mode only alongside an icon', () => {
        const none = build_schema(make_form({icon_id: null, icon_mode: 'echo'}))
        expect(none['icon_id']).toBeUndefined()
        expect(none['icon_mode']).toBeUndefined()
        const some = build_schema(make_form({icon_id: 'game-icons:sailboat', icon_mode: 'echo'}))
        expect(some['icon_id']).toBe('game-icons:sailboat')
        expect(some['icon_mode']).toBe('echo')
    })
})


describe('build_schema patterns and fonts', () => {

    it('resolves a pattern id to its tile size, scaled by the form', () => {
        const schema = build_schema(make_form({pattern_id: 'bamboo', pattern_scale: 2}))
        expect(schema['pattern']).toBe('bamboo')
        expect(schema['pattern_tile_mm']).toBeGreaterThan(0)
        const unscaled = build_schema(make_form({pattern_id: 'bamboo', pattern_scale: 1}))
        expect(schema['pattern_tile_mm']).toBe((unscaled['pattern_tile_mm'] as number) * 2)
    })

    it('warns and drops a pattern id this version no longer has', () => {
        // A pruned asset id means a stored cover can't be reproduced — never silently
        const warnings:unknown[] = []
        const original = console.warn
        console.warn = (...args:unknown[]) => warnings.push(args)
        try {
            const schema = build_schema(make_form({pattern_id: 'no-such-pattern'}))
            expect(schema['pattern']).toBeUndefined()
        } finally {
            console.warn = original
        }
        expect(warnings).toHaveLength(1)
        expect(String(warnings[0])).toContain('no-such-pattern')
    })

    it('builds a font config from a family name, and none from an empty field', () => {
        expect(build_schema(make_form({title1_font: 'Playfair Display'}))['title1_font'])
            .toEqual({family: 'Playfair Display'})
        expect(build_schema(make_form({title1_font: ''}))['title1_font']).toBeUndefined()
    })

    it('attaches a custom family\'s sniffed style, which the manifest can\'t supply', () => {
        const custom = [{family: 'Uploaded Sans', style: 'sans' as const}]
        expect(build_schema(make_form({title1_font: 'Uploaded Sans'}), custom)['title1_font'])
            .toEqual({family: 'Uploaded Sans', style: 'sans'})
    })

    it('leaves a bundled family without a style, so the manifest classifies it', () => {
        const custom = [{family: 'Uploaded Sans', style: 'sans' as const}]
        expect(build_schema(make_form({title1_font: 'Playfair Display'}), custom)['title1_font'])
            .toEqual({family: 'Playfair Display'})
    })
})
