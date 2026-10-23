
import {describe, it, expect} from 'vitest'
import {isReactive} from 'vue'

import {cover_schema, make_blank_form_values} from 'bookcover-web'
import {make_form, make_blank_form} from '../src/form_state'
import {build_schema} from '../src/schema'


describe('form factories', () => {

    it('makes a reactive blank form with no demo content', () => {
        const form = make_blank_form()
        expect(isReactive(form)).toBe(true)
        expect({...form}).toEqual(make_blank_form_values())
    })

    it('makes a fresh object each time', () => {
        const a = make_blank_form()
        a.title1 = 'changed'
        expect(make_blank_form().title1).not.toBe('changed')
        expect(make_form()).not.toBe(make_form())
    })

    it('makes a reactive demo form whose cover validates', () => {
        const form = make_form()
        expect(isReactive(form)).toBe(true)
        expect(form.title2).toBe('Book Cover')
        expect(form.bg_vector_id).toBe('mountain-ridge-v2')
        expect(form.blurb?.type).toBe('doc')
        expect(() => cover_schema.parse(build_schema(form))).not.toThrow()
    })
})
