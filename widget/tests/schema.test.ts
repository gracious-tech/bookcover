
import {describe, it, expect} from 'vitest'

import {cover_schema, make_blank_form_values} from 'bookcover-web'
import type {FormState} from '../src/form_state'
import {build_schema, parse_svg_size} from '../src/schema'

/** A complete form, overridden field by field */
function make_form(overrides:Partial<FormState> = {}):FormState {
    return {...make_blank_form_values(), ...overrides}
}


describe('build_schema', () => {

    it('produces a schema the generator validator accepts', () => {
        expect(() => cover_schema.parse(build_schema(make_form({title1: 'A Book'})))).not.toThrow()
    })

    it('carries the form values through the core conversion', () => {
        const schema = build_schema(make_form({title1: '"Quoted"', page_count: 250}))
        expect(schema['title1']).toBe('“Quoted”')
        expect(schema['page_count']).toBe(250)
    })

    it('derives nothing itself — unset colors stay unset for resolve_colors', () => {
        const schema = build_schema(make_form({bg_color: null, title1_color: null}))
        expect(schema['bg_color']).toBeUndefined()
        expect(schema['title1_color']).toBeUndefined()
    })
})


describe('parse_svg_size', () => {

    it('reads the pt dimensions Typst puts on the root element', () => {
        const svg = '<svg class="typst-doc" viewBox="0 0 930.71 665.95" width="930.71pt" '
            + 'height="665.95pt"></svg>'
        expect(parse_svg_size(svg)).toEqual({width: 930.71, height: 665.95})
    })

    it('accepts dimensions with no unit suffix', () => {
        expect(parse_svg_size('<svg width="100" height="50"></svg>'))
            .toEqual({width: 100, height: 50})
    })

    it('throws when the dimensions are missing, rather than returning NaN', () => {
        expect(() => parse_svg_size('<svg viewBox="0 0 10 10"></svg>')).toThrow(/dimensions/)
    })
})
