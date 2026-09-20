
import {describe, it, expect} from 'vitest'

import {calculate_font_sizes} from '../src/font_sizes.js'
import {make_schema, make_dims} from './helpers.js'
import type {CoverSchema} from '../src/schema.js'

/** calculate_font_sizes runs on an already-resolved schema — build() derives the spine text
 *  from the titles before calling it, so these fixtures carry spine fields that are never
 *  undefined */
function spine_schema(overrides:Partial<CoverSchema> = {}):CoverSchema {
    return make_schema({spine_title: '', spine_author: '', ...overrides})
}

// Spine text is suppressed below 5mm, and the author line needs 7.5mm
const NARROW_SPINE = {service_id: 'custom', binding_type: 'paperback', size_id: undefined,
    custom_unit: 'mm', custom_trim_width: 152, custom_trim_height: 229,
    custom_spine: 3, custom_bleed: 0}


describe('subtitle lines', () => {

    it('splits on the user\'s own line break', () => {
        const sizes = calculate_font_sizes(spine_schema({subtitle: 'First line\nSecond line'}), make_dims())
        expect(sizes.subtitle_lines).toEqual(['First line', 'Second line'])
    })

    it('keeps an unbroken subtitle as one line, however long', () => {
        const long = 'A very long subtitle that would never fit across the cover in one go'
        expect(calculate_font_sizes(spine_schema({subtitle: long}), make_dims()).subtitle_lines)
            .toEqual([long])
    })

    it('takes only the first two lines', () => {
        const sizes = calculate_font_sizes(spine_schema({subtitle: 'one\ntwo\nthree'}), make_dims())
        expect(sizes.subtitle_lines).toEqual(['one', 'two'])
    })

    it('trims each line and collapses runs of spaces', () => {
        const sizes = calculate_font_sizes(spine_schema({subtitle: '  spaced   out  '}), make_dims())
        expect(sizes.subtitle_lines).toEqual(['spaced out'])
    })

    it('drops blank lines rather than emitting empty strings', () => {
        const sizes = calculate_font_sizes(spine_schema({subtitle: '\n  \nreal line\n'}), make_dims())
        expect(sizes.subtitle_lines).toEqual(['real line'])
    })

    it('returns no lines for an empty subtitle', () => {
        expect(calculate_font_sizes(spine_schema({subtitle: ''}), make_dims()).subtitle_lines)
            .toEqual([])
    })
})


describe('spine text sizing', () => {

    it('sizes the spine title within the spine width', () => {
        const dims = make_dims()
        const sizes = calculate_font_sizes(spine_schema({spine_title: 'The Art of Code'}), dims)
        expect(sizes.spine_title).toBeGreaterThan(0)
        expect(sizes.spine_title).toBeLessThanOrEqual(dims.cover_spine.toNumber() * 0.65)
    })

    it('suppresses spine text entirely on a spine under 5mm', () => {
        const sizes = calculate_font_sizes(
            spine_schema({spine_title: 'Title', spine_author: 'Author', ...NARROW_SPINE}),
            make_dims(NARROW_SPINE))
        expect(sizes.spine_title).toBe(0)
        expect(sizes.spine_author).toBe(0)
    })

    it('sets the spine author at about three quarters of the spine title', () => {
        const sizes = calculate_font_sizes(
            spine_schema({spine_title: 'The Art of Code', spine_author: 'Alice Chen'}), make_dims())
        expect(sizes.spine_author).toBeCloseTo(sizes.spine_title * 0.75, 6)
    })

    it('leaves the spine author at zero when there is no author text', () => {
        const sizes = calculate_font_sizes(spine_schema({spine_title: 'Title', spine_author: ''}),
            make_dims())
        expect(sizes.spine_title).toBeGreaterThan(0)
        expect(sizes.spine_author).toBe(0)
    })

    it('drops the author line on a spine too narrow to carry both', () => {
        // Between the 5mm spine-text floor and the 7.5mm the author line needs
        const narrow = {...NARROW_SPINE, custom_spine: 6}
        const sizes = calculate_font_sizes(
            spine_schema({spine_title: 'Title', spine_author: 'Author', ...narrow}),
            make_dims(narrow))
        expect(sizes.spine_title).toBeGreaterThan(0)
        expect(sizes.spine_author).toBe(0)
    })

    it('shrinks a longer title to keep it on one line', () => {
        const dims = make_dims()
        const short = calculate_font_sizes(spine_schema({spine_title: 'Code'}), dims).spine_title
        const long = calculate_font_sizes(
            spine_schema({spine_title: 'An Extremely Long Book Title That Runs The Whole Spine'}),
            dims).spine_title
        expect(long).toBeLessThan(short)
    })

    it('never shrinks the spine title below the 2.5mm floor', () => {
        const wall_of_text = 'x'.repeat(2000)
        const sizes = calculate_font_sizes(spine_schema({spine_title: wall_of_text}), make_dims())
        expect(sizes.spine_title).toBeGreaterThanOrEqual(2.5)
    })

    it('caps the spine title at 65% of the spine width on a very wide spine', () => {
        const dims = make_dims({page_count: 800})
        const sizes = calculate_font_sizes(spine_schema({spine_title: 'A'}), dims)
        expect(sizes.spine_title).toBeLessThanOrEqual(dims.cover_spine.toNumber() * 0.65)
    })
})


describe('blurb sizing', () => {

    it('uses a fixed blurb size, since blurb length varies too much to fit', () => {
        const short = calculate_font_sizes(spine_schema({blurb: 'Short.'}), make_dims())
        const long = calculate_font_sizes(spine_schema({blurb: 'word '.repeat(400)}), make_dims())
        expect(short.back_blurb).toBe(long.back_blurb)
        expect(short.back_blurb).toBeGreaterThan(0)
    })
})
