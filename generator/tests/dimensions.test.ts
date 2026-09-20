
import {describe, it, expect} from 'vitest'

import {resolve_dimensions} from '../src/dimensions.js'
import {make_dims, make_form} from './helpers.js'


describe('resolve_dimensions with a print service', () => {

    it('returns a full spread: two faces plus the spine, plus bleed on each side', () => {
        const dims = make_dims()
        const total = dims.cover_total_width.toNumber()
        const expected = dims.cover_face_width.toNumber() * 2
            + dims.cover_spine.toNumber() + dims.cover_bleed.toNumber() * 2
        expect(total).toBeCloseTo(expected, 6)
        expect(dims.cover_total_height.toNumber()).toBeCloseTo(
            dims.cover_face_height.toNumber() + dims.cover_bleed.toNumber() * 2, 6)
    })

    it('grows the spine with the page count', () => {
        const thin = make_dims({page_count: 100}).cover_spine.toNumber()
        const thick = make_dims({page_count: 600}).cover_spine.toNumber()
        expect(thick).toBeGreaterThan(thin)
    })

    it('passes paper_type through to services whose spine calc needs it', () => {
        // KDP sets cover_calc_requires_paper, and its cream stock is thicker than its white
        const white = make_dims({paper_type: 'white'}).cover_spine.toNumber()
        const cream = make_dims({paper_type: 'cream'}).cover_spine.toNumber()
        expect(cream).not.toBe(white)
    })

    it('passes ink_type through to services whose spine calc needs it', () => {
        // KDP sets cover_calc_requires_ink, and its premium color stock is thicker than the rest
        const bw = make_dims({ink_type: 'bw'}).cover_spine.toNumber()
        const premium = make_dims({ink_type: 'color_premium'}).cover_spine.toNumber()
        expect(premium).not.toBe(bw)
    })

    it('lays the panels out left to right with no gap or overlap', () => {
        const dims = make_dims()
        const back = dims.cover_region_back
        const spine = dims.cover_region_spine
        const front = dims.cover_region_front
        expect(back.x.plus(back.w).toNumber()).toBeCloseTo(spine.x.toNumber(), 6)
        expect(spine.x.plus(spine.w).toNumber()).toBeCloseTo(front.x.toNumber(), 6)
        expect(spine.w.toNumber()).toBeCloseTo(dims.cover_spine.toNumber(), 6)
    })

    it('resolves a size given as raw trim measurements instead of a preset id', () => {
        const dims = resolve_dimensions({
            service_id: 'kdp',
            page_count: 300,
            binding_type: 'paperback',
            ink_type: 'bw',
            paper_type: 'white',
            custom_unit: 'mm',
            custom_trim_width: 152.4,
            custom_trim_height: 228.6,
        })
        expect(dims.cover_face_width.toNumber()).toBeCloseTo(152.4, 4)
        expect(dims.cover_face_height.toNumber()).toBeCloseTo(228.6, 4)
    })
})


describe('resolve_dimensions with a custom service', () => {

    it('takes bleed and spine from the form rather than a page count', () => {
        const dims = resolve_dimensions({
            service_id: 'custom',
            binding_type: 'paperback',
            custom_unit: 'mm',
            custom_trim_width: 152,
            custom_trim_height: 229,
            custom_bleed: 3,
            custom_spine: 10,
        })
        expect(dims.cover_spine.toNumber()).toBeCloseTo(10, 6)
        expect(dims.cover_bleed.toNumber()).toBeCloseTo(3, 6)
        expect(dims.cover_face_width.toNumber()).toBeCloseTo(152, 6)
    })

    it('converts every custom measurement from inches, not just the trim', () => {
        const dims = resolve_dimensions({
            service_id: 'custom',
            binding_type: 'paperback',
            custom_unit: 'inch',
            custom_trim_width: 6,
            custom_trim_height: 9,
            custom_bleed: 0.125,
            custom_spine: 0.5,
        })
        expect(dims.cover_face_width.toNumber()).toBeCloseTo(152.4, 4)
        expect(dims.cover_face_height.toNumber()).toBeCloseTo(228.6, 4)
        expect(dims.cover_bleed.toNumber()).toBeCloseTo(3.175, 4)
        expect(dims.cover_spine.toNumber()).toBeCloseTo(12.7, 4)
    })

    it('falls back to the schema defaults for an omitted bleed and spine', () => {
        const dims = resolve_dimensions({
            service_id: 'custom',
            binding_type: 'paperback',
            custom_trim_width: 152,
            custom_trim_height: 229,
        })
        expect(dims.cover_bleed.toNumber()).toBe(0)
        expect(dims.cover_spine.toNumber()).toBe(0)
        expect(dims.cover_has_spine).toBe(false)
    })
})


describe('DimensionInputs and FormState', () => {

    it('accepts a form record directly — the widget relies on this structural match', () => {
        // FormState's print fields are always-populated versions of DimensionInputs' own, so a
        // form can be passed straight in (see widget/src/dimensions.ts)
        const dims = resolve_dimensions(make_form({service_id: 'lulu', size_id: 'us_trade'}))
        expect(dims.cover_face_width.toNumber()).toBeGreaterThan(0)
    })

    it('reads size_id in preset mode and ignores the stale custom trim alongside it', () => {
        const form = make_form({size_id: 'us_trade', custom_trim_width: 999, custom_trim_height: 999})
        expect(resolve_dimensions(form).cover_face_width.toNumber()).toBeCloseTo(152.4, 4)
    })
})
