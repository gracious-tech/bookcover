
import {describe, it, expect} from 'vitest'

import {make_blank_form_values} from 'bookcover-web'
import type {FormState} from '../src/form_state'
import {compute_cover_dims} from '../src/dimensions'
import {check_bg_image_dpi} from '../src/dpi'
import en from '../src/locales/en'

/** A complete form, overridden field by field */
function make_form(overrides:Partial<FormState> = {}):FormState {
    return {...make_blank_form_values(), ...overrides}
}

/** The box (mm) each coverage places the image in, mirrored from cover.typ independently of dpi.ts */
function target_mm(form:FormState):{width:number, height:number} {
    const dims = compute_cover_dims(form)
    const face_w = dims.cover_face_width.toNumber()
    const face_h = dims.cover_face_height.toNumber()
    switch (form.bg_image_coverage) {
        case 'full':
            return {width: dims.cover_total_width.toNumber(), height: dims.cover_total_height.toNumber()}
        case 'front':
            return {width: face_w + dims.cover_bleed.toNumber(), height: dims.cover_total_height.toNumber()}
        case 'front_partial':
            return {width: face_w, height: face_h * 2 / 3}
        default:
            return {width: face_w - 30, height: face_h * 0.5}
    }
}

/** Pixel size that prints at exactly `dpi` across a form's target box */
function px_at(form:FormState, dpi:number):[number, number] {
    const box = target_mm(form)
    return [Math.ceil(box.width / 25.4 * dpi), Math.ceil(box.height / 25.4 * dpi)]
}

/** Pixel size formatted the way the warning shows it */
function px_label(form:FormState, dpi:number):string {
    const box = target_mm(form)
    return `${Math.round(box.width / 25.4 * dpi)}×${Math.round(box.height / 25.4 * dpi)}px`
}

const COVERAGES:FormState['bg_image_coverage'][] =
    ['full', 'front', 'front_partial', 'painted', 'feature']


describe('check_bg_image_dpi', () => {

    it.each(COVERAGES)('needs no warning at 300dpi or more (%s)', coverage => {
        const form = make_form({bg_image_coverage: coverage})
        expect(check_bg_image_dpi(form, ...px_at(form, 300))).toBeNull()
    })

    it.each(COVERAGES)('warns "low" between 150 and 300dpi (%s)', coverage => {
        const form = make_form({bg_image_coverage: coverage})
        const [w, h] = px_at(form, 200)
        expect(check_bg_image_dpi(form, w, h)).toEqual({
            level: 'low',
            title: en.dpi_warning.title_low,
            body: en.dpi_warning.body_low,
            actual_size: `${w}×${h}px`,
            acceptable_size: undefined,
            recommended_size: px_label(form, 300),
        })
    })

    it.each(COVERAGES)('warns "very_low" under 150dpi, with the floor size (%s)', coverage => {
        const form = make_form({bg_image_coverage: coverage})
        const warning = check_bg_image_dpi(form, 10, 10)
        expect(warning?.level).toBe('very_low')
        expect(warning?.title).toBe(en.dpi_warning.title_very_low)
        expect(warning?.acceptable_size).toBe(px_label(form, 150))
        expect(warning?.recommended_size).toBe(px_label(form, 300))
    })

    it.each(COVERAGES)('accepts an image exactly the recommended size it shows (%s)', coverage => {
        // The requirement is fractional; rounding it down for display mustn't leave it unmet
        const form = make_form({bg_image_coverage: coverage})
        const [w, h] = px_label(form, 300).slice(0, -2).split('×').map(Number)
        expect(check_bg_image_dpi(form, w, h)).toBeNull()
        const [w150, h150] = px_label(form, 150).slice(0, -2).split('×').map(Number)
        expect(check_bg_image_dpi(form, w150, h150)?.level).toBe('low')
    })

    it('judges by the thinnest axis, since cover fit stretches that one most', () => {
        const form = make_form({bg_image_coverage: 'full'})
        const [w, h] = px_at(form, 400)
        // Plenty of width can't make up for too little height
        expect(check_bg_image_dpi(form, w * 10, Math.floor(h / 2))?.level).toBe('low')
        expect(check_bg_image_dpi(form, Math.floor(w / 2), h * 10)?.level).toBe('low')
    })

    it('suggests front-only use when the smallest placement would still print', () => {
        // Enough pixels for the feature box at 150dpi, far too few for the full wrap
        const feature = make_form({bg_image_coverage: 'feature'})
        const [w, h] = px_at(feature, 160)
        for (const coverage of ['full', 'front'] as const) {
            const warning = check_bg_image_dpi(make_form({bg_image_coverage: coverage}), w, h)
            expect(warning?.level).toBe('very_low')
            expect(warning?.body).toBe(en.dpi_warning.body_very_low
                + en.dpi_warning.body_front_suffix)
        }
    })

    it('makes no front-only suggestion when even the smallest placement is too small', () => {
        const warning = check_bg_image_dpi(make_form({bg_image_coverage: 'full'}), 10, 10)
        expect(warning?.body).toBe(en.dpi_warning.body_very_low)
    })

    it('makes no front-only suggestion for placements already on the front', () => {
        const feature = make_form({bg_image_coverage: 'feature'})
        const [w, h] = px_at(feature, 160)
        const warning = check_bg_image_dpi(make_form({bg_image_coverage: 'front_partial'}), w, h)
        expect(warning?.body).not.toContain(en.dpi_warning.body_front_suffix)
    })

    it('scales with the trim size', () => {
        // The same pixels print fine on a small book and poorly on a large one
        const small = make_form({size_mode: 'custom', custom_unit: 'mm', custom_trim_width: 100,
            custom_trim_height: 150})
        const large = make_form({size_mode: 'custom', custom_unit: 'mm', custom_trim_width: 200,
            custom_trim_height: 300})
        const [w, h] = px_at(small, 310)
        expect(check_bg_image_dpi(small, w, h)).toBeNull()
        expect(check_bg_image_dpi(large, w, h)?.level).toBe('low')
    })
})
