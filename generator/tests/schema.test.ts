
import {describe, it, expect} from 'vitest'

import {cover_schema} from '../src/schema.js'
import type {CoverSchema} from '../src/schema.js'
import {make_schema} from './helpers.js'


describe('cover_schema', () => {

    it('accepts a complete schema unchanged', () => {
        const parsed = cover_schema.parse(make_schema())
        expect(parsed.title1).toBe('The')
        expect(parsed.service_id).toBe('kdp')
    })

    it('requires the fields with no sensible default', () => {
        for (const field of ['title_position', 'subtitle_position', 'author_position',
            'service_id', 'binding_type']) {
            const input = make_schema() as Record<string, unknown>
            delete input[field]
            expect(() => cover_schema.parse(input), field).toThrow()
        }
    })

    it('defaults the text fields to empty rather than leaving them undefined', () => {
        const input = make_schema() as Record<string, unknown>
        for (const field of ['title1', 'title2', 'title3', 'subtitle', 'author', 'blurb', 'isbn'])
            delete input[field]
        const parsed = cover_schema.parse(input)
        expect(parsed.title1).toBe('')
        expect(parsed.blurb).toBe('')
        expect(parsed.isbn).toBe('')
    })

    it('leaves an omitted optional field undefined, so derivation paths can detect it', () => {
        const parsed = cover_schema.parse(make_schema())
        expect(parsed.title1_color).toBeUndefined()
        expect(parsed.spine_title).toBeUndefined()
        expect(parsed.blurb_bg_color).toBeUndefined()
    })
})


describe('color validation', () => {

    it('accepts the hsl(Hdeg, S%, L%) form both Typst and CSS understand', () => {
        expect(cover_schema.parse(make_schema({bg_color: 'hsl(200deg, 50%, 30%)'})).bg_color)
            .toBe('hsl(200deg, 50%, 30%)')
        expect(cover_schema.parse(make_schema({bg_color: 'hsl(200.5deg, 50.25%, 30%)'})).bg_color)
            .toBe('hsl(200.5deg, 50.25%, 30%)')
    })

    it('rejects any other color notation', () => {
        for (const bad of ['#ff0000', 'red', 'rgb(255, 0, 0)', 'hsl(200, 50%, 30%)',
            'hsl(200deg 50% 30%)']) {
            expect(() => cover_schema.parse(make_schema({bg_color: bad})), bad).toThrow()
        }
    })

    it('distinguishes null (transparent/none) from omitted (derive) on the nullable colors', () => {
        expect(cover_schema.parse(make_schema({blurb_bg_color: null})).blurb_bg_color).toBeNull()
        expect(cover_schema.parse(make_schema({spine_color: null})).spine_color).toBeNull()
        expect(cover_schema.parse(make_schema()).blurb_bg_color).toBeUndefined()
    })

    it('rejects null on a color that has no "none" meaning', () => {
        expect(() => cover_schema.parse(make_schema({title1_color: null as unknown as string})))
            .toThrow()
    })
})


describe('numeric bounds', () => {

    it('accepts weights across the CSS range and rejects anything outside it', () => {
        expect(cover_schema.parse(make_schema({title1_weight: 100})).title1_weight).toBe(100)
        expect(cover_schema.parse(make_schema({title1_weight: 900})).title1_weight).toBe(900)
        expect(() => cover_schema.parse(make_schema({title1_weight: 50}))).toThrow()
        expect(() => cover_schema.parse(make_schema({title1_weight: 1000}))).toThrow()
        expect(() => cover_schema.parse(make_schema({title1_weight: 450.5}))).toThrow()
    })

    it('rejects a non-positive size and a non-integer page count', () => {
        expect(() => cover_schema.parse(make_schema({title1_size: 0}))).toThrow()
        expect(() => cover_schema.parse(make_schema({page_count: 0}))).toThrow()
        expect(() => cover_schema.parse(make_schema({page_count: 12.5}))).toThrow()
    })

    it('caps the percent-of-trim spacing fields at 50', () => {
        expect(cover_schema.parse(make_schema({title_spacing: 50})).title_spacing).toBe(50)
        expect(() => cover_schema.parse(make_schema({title_spacing: 51}))).toThrow()
        expect(() => cover_schema.parse(make_schema({title_spacing: -1}))).toThrow()
    })

    it('caps blurb_width at 100 percent of the face width', () => {
        expect(cover_schema.parse(make_schema({blurb_width: 100})).blurb_width).toBe(100)
        expect(() => cover_schema.parse(make_schema({blurb_width: 101}))).toThrow()
    })
})


describe('enum fields', () => {

    it('accepts every documented value and rejects the rest', () => {
        const cases:[string, string[], string][] = [
            ['title_position', ['top', 'middle', 'bottom'], 'centre'],
            ['blurb_alignment', ['center', 'left', 'right', 'justified'], 'justify'],
            ['bg_image_coverage', ['full', 'front', 'painted', 'feature', 'front_partial'], 'half'],
            ['icon_mode', ['center', 'offset', 'echo'], 'tiled'],
            ['cjk_variant', ['auto', 'JP', 'KR', 'SC', 'TC', 'HK'], 'CN'],
        ]
        for (const [field, valid, invalid] of cases) {
            const with_field = (value:string) => make_schema({[field]: value} as Partial<CoverSchema>)
            for (const value of valid)
                expect(() => cover_schema.parse(with_field(value)), value).not.toThrow()
            expect(() => cover_schema.parse(with_field(invalid)), invalid).toThrow()
        }
    })

    it('takes a font config as a family plus an optional sniffed style', () => {
        const font = {family: 'Playfair Display', style: 'serif' as const}
        expect(cover_schema.parse(make_schema({title1_font: font})).title1_font).toEqual(font)
        expect(cover_schema.parse(make_schema({title1_font: {family: 'X'}})).title1_font)
            .toEqual({family: 'X'})
        expect(() => cover_schema.parse(make_schema({title1_font: {family: ''}}))).toThrow()
        expect(() => cover_schema.parse(make_schema({
            title1_font: {family: 'X', style: 'script' as unknown as 'serif'}}))).toThrow()
    })
})
