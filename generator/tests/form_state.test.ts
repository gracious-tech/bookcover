// make_blank_form_values() is the starting point for every new form, so it must be a complete
// record (see "Absence means nothing" in CLAUDE.md) and never share mutable state between forms

import {describe, it, expect} from 'vitest'

import {make_blank_form_values} from '../src/form_state.js'
import {FORM_DEFAULTS} from '../src/defaults.js'

describe('make_blank_form_values', () => {

    it('is exactly the form defaults', () => {
        expect(make_blank_form_values()).toEqual(FORM_DEFAULTS)
    })

    it('gives every field an explicit value', () => {
        for (const [key, value] of Object.entries(make_blank_form_values()))
            expect(value, key).not.toBeUndefined()
    })

    it('gives each form its own blurb document', () => {
        const first = make_blank_form_values()
        const second = make_blank_form_values()
        expect(first.blurb).not.toBe(second.blurb)
        expect(first.blurb).not.toBe(FORM_DEFAULTS.blurb)
        // Mutating one form's blurb leaves the defaults and other forms untouched
        const before = structuredClone(FORM_DEFAULTS.blurb)
        first.blurb.content = [{type: 'paragraph'}]
        expect(second.blurb).toEqual(before)
        expect(FORM_DEFAULTS.blurb).toEqual(before)
    })

    it('returns a fresh object each call', () => {
        const form = make_blank_form_values()
        form.title1 = 'Changed'
        expect(make_blank_form_values().title1).toBe(FORM_DEFAULTS.title1)
    })
})
