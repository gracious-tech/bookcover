
import {describe, it, expect} from 'vitest'

import {make_blank_form_values} from 'bookcover-web'
import type {FormState} from '../src/form_state'
import {compute_cover_dims} from '../src/dimensions'

/** A complete form, overridden field by field */
function make_form(overrides:Partial<FormState> = {}):FormState {
    return {...make_blank_form_values(), ...overrides}
}


describe('compute_cover_dims', () => {

    it('resolves dimensions straight from a form', () => {
        const dims = compute_cover_dims(make_form({service_id: 'kdp', size_id: 'us_trade'}))
        expect(dims.cover_face_width.toNumber()).toBeCloseTo(152.4, 4)
        expect(dims.cover_spine.toNumber()).toBeGreaterThan(0)
    })

    it('passes paper_type and ink_type through to the spine calculation', () => {
        // This wrapper used to reimplement the lookup and drop these two, so the preview
        // disagreed with what generate() computed for KDP and ctrlprint
        const kdp = (paper:string) => compute_cover_dims(
            make_form({service_id: 'kdp', size_id: 'us_trade', paper_type: paper}))
            .cover_spine.toNumber()
        expect(kdp('cream')).not.toBe(kdp('white'))
    })

    it('tracks the page count', () => {
        const spine = (pages:number) => compute_cover_dims(
            make_form({page_count: pages})).cover_spine.toNumber()
        expect(spine(600)).toBeGreaterThan(spine(100))
    })

    it('reads the custom trim fields once size_id is cleared, as the record requires', () => {
        const dims = compute_cover_dims(make_form({size_mode: 'custom', size_id: '',
            custom_unit: 'mm', custom_trim_width: 140, custom_trim_height: 216}))
        expect(dims.cover_face_width.toNumber()).toBeCloseTo(140, 4)
        expect(dims.cover_face_height.toNumber()).toBeCloseTo(216, 4)
    })

    it('ignores a stale size_id in custom mode, as build_schema does', () => {
        // A record may still carry the previous preset id (hosts hold records the editor wrote
        // before select_custom() started clearing it), and resolve_dimensions keys off size_id
        // alone — so custom mode must drop it here, or the preview resolves the preset size
        // while generate() renders the custom trim
        const dims = compute_cover_dims(make_form({size_mode: 'custom', size_id: 'us_trade',
            custom_unit: 'mm', custom_trim_width: 140, custom_trim_height: 216}))
        expect(dims.cover_face_width.toNumber()).toBeCloseTo(140, 4)
        expect(dims.cover_face_height.toNumber()).toBeCloseTo(216, 4)
    })

    it('throws on an incomplete form, which callers catch while the user is mid-edit', () => {
        expect(() => compute_cover_dims(make_form({service_id: 'nonsense'}))).toThrow()
    })
})
