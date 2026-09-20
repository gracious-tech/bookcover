
// Property tests: invariants that must hold for EVERY valid input, not just the cases the
// other suites name. These are the ones a stored record depends on — a schema that always
// validates, dimensions that always add up, and colors that are always readable.

import {describe, it, expect, beforeAll} from 'vitest'
import fc from 'fast-check'
import chroma from 'chroma-js'

import {build_schema, curly_quotes} from '../src/form_schema.js'
import {cover_schema} from '../src/schema.js'
import {resolve_dimensions} from '../src/dimensions.js'
import {resolve_colors, generate_palette, tinted_contrast_text, pick_vivid_tint,
    synthesize_fill} from '../src/design.js'
import type {PaletteScheme, RegionStats} from '../src/design.js'
import {calculate_crop_regions, calculate_pixel_crop_regions} from '../src/split.js'
import {calculate_font_sizes} from '../src/font_sizes.js'
import {get_service, list_services} from 'printing-services'
import {collect_all_fonts} from '../src/fonts.js'
import {make_form, make_schema, init_test_fonts} from './helpers.js'

const HSL_PATTERN = /^hsl\(\d+deg, \d+%, \d+%\)$/

/** An hsl(Hdeg, S%, L%) string, the only color notation the schema accepts */
const hsl_color = fc.tuple(fc.integer({min: 0, max: 359}), fc.integer({min: 0, max: 100}),
    fc.integer({min: 0, max: 100})).map(([h, s, l]) => `hsl(${h}deg, ${s}%, ${l}%)`)

/** Parse an hsl(Hdeg, S%, L%) string the way design.ts does, into an unrounded color.
 *  Letting chroma parse the CSS string instead would quantise it to 8-bit RGB first, and the
 *  contrast curve is steep enough around the white/near-black crossover (~L 0.2) that half a
 *  channel step moves the ratio by ~0.07 — enough to flip which text color looks better and
 *  make these assertions disagree with a pipeline that never rounded in the first place */
function as_color(hsl_str:string):chroma.Color {
    const m = hsl_str.match(/hsl\((\d+(?:\.\d+)?)deg,\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%\)/)
    if (!m)
        throw new Error(`Invalid HSL color: ${hsl_str}`)
    return chroma.hsl(parseFloat(m[1]), parseFloat(m[2]) / 100, parseFloat(m[3]) / 100)
}

/** WCAG contrast between two hsl(Hdeg, S%, L%) strings, measured without rounding either */
function contrast_between(a:string, b:string):number {
    return chroma.contrast(as_color(a), as_color(b))
}

/** A hex color, as the form stores its overrides */
const hex_color = fc.tuple(fc.integer({min: 0, max: 255}), fc.integer({min: 0, max: 255}),
    fc.integer({min: 0, max: 255})).map(([r, g, b]) => chroma(r, g, b).hex())

/** A sampled image region */
const region_stats:fc.Arbitrary<RegionStats> = fc.record({
    hue: fc.integer({min: 0, max: 359}),
    saturation: fc.float({min: 0, max: 1, noNaN: true}),
    lightness: fc.float({min: 0, max: 1, noNaN: true}),
    lightness_spread: fc.float({min: 0, max: 0.5, noNaN: true}),
})

/** Any print configuration a real service actually offers — the options are drawn from
 *  printing-services itself, so every service's own sizes/bindings/stocks get exercised */
const print_config = fc.constantFrom(...list_services().map(service => service.id))
    .chain(service_id => {
        const service = get_service(service_id)
        return fc.record({
            service_id: fc.constant(service_id as string),
            size_id: fc.constantFrom(...service.get_sizes().map(size => size.id as string)),
            binding_type: fc.constantFrom(
                ...service.get_binding_types().map(binding => binding.id as string)),
            ink_type: fc.constantFrom(...service.get_ink_types().map(ink => ink.id as string)),
            paper_type: fc.constantFrom(...service.get_paper_types().map(paper => paper.id as string)),
            page_count: fc.integer({min: 24, max: 800}),
            size_mode: fc.constant('preset' as const),
        })
    })

/** The form fields that shape a schema, layered over a complete blank record */
const form_values = fc.record({
    title1: fc.string({maxLength: 40}),
    title2: fc.string({maxLength: 40}),
    title3: fc.string({maxLength: 40}),
    subtitle: fc.string({maxLength: 60}),
    author: fc.string({maxLength: 40}),
    spine_title: fc.string({maxLength: 40}),
    isbn: fc.constantFrom('', '978-3-16-148410-0'),
    title1_color: fc.option(hex_color, {nil: null}),
    bg_color: fc.option(hex_color, {nil: null}),
    spine_color: fc.option(hex_color, {nil: null}),
    blurb_bg_color: fc.oneof(fc.constant('auto'), fc.constant(null), hex_color),
    title1_size: fc.float({min: 0.5, max: 2, noNaN: true}),
    title1_weight: fc.integer({min: 1, max: 9}).map(n => n * 100),
    blurb_padding: fc.float({min: 0, max: 50, noNaN: true}),
    blurb_width: fc.float({min: Math.fround(0.1), max: 100, noNaN: true}),
    margin_front: fc.float({min: 0, max: 50, noNaN: true}),
    margin_back: fc.float({min: 0, max: 50, noNaN: true}),
    title_position: fc.constantFrom('top', 'middle', 'bottom'),
    subtitle_position: fc.constantFrom('top', 'middle', 'bottom'),
    author_position: fc.constantFrom('top', 'middle', 'bottom'),
    bg_image_coverage: fc.constantFrom('full', 'front', 'painted', 'feature', 'front_partial'),
    cjk_variant: fc.constantFrom('auto', 'JP', 'KR', 'SC', 'TC', 'HK'),
})

beforeAll(() => {
    init_test_fonts()
})


describe('build_schema always produces a valid schema', () => {

    it('validates for any combination of form values', () => {
        fc.assert(fc.property(form_values, print_config, (values, print) => {
            const form = make_form({...values, ...print} as Parameters<typeof make_form>[0])
            expect(() => cover_schema.parse(build_schema(form))).not.toThrow()
        }))
    })

    it('emits colors only in the one notation the schema accepts', () => {
        fc.assert(fc.property(form_values, values => {
            const schema = build_schema(make_form(values as Parameters<typeof make_form>[0]))
            for (const [key, value] of Object.entries(schema)) {
                if (key.endsWith('_color') && typeof value === 'string')
                    expect(value, key).toMatch(HSL_PATTERN)
            }
        }))
    })

    it('never emits a NaN or an infinite number', () => {
        fc.assert(fc.property(form_values, print_config, (values, print) => {
            const schema = build_schema(make_form({...values, ...print} as Parameters<typeof make_form>[0]))
            for (const [key, value] of Object.entries(schema)) {
                if (typeof value === 'number')
                    expect(Number.isFinite(value), key).toBe(true)
            }
        }))
    })
})


describe('dimensions always add up', () => {

    it('composes the total from the faces, spine and bleed', () => {
        fc.assert(fc.property(print_config, print => {
            const dims = resolve_dimensions(print)
            expect(dims.cover_face_width.toNumber()).toBeGreaterThan(0)
            expect(dims.cover_spine.toNumber()).toBeGreaterThanOrEqual(0)
            // A jacket adds flaps either side, so only a plain cover is two faces plus a spine
            if (dims.cover_has_flaps)
                return
            expect(dims.cover_total_width.toNumber()).toBeCloseTo(
                dims.cover_face_width.toNumber() * 2 + dims.cover_spine.toNumber()
                + dims.cover_bleed.toNumber() * 2, 6)
        }))
    })

    it('tiles the crop regions with no gap, at any PPI', () => {
        fc.assert(fc.property(print_config, fc.integer({min: 36, max: 1200}), (print, ppi) => {
            const dims = resolve_dimensions(print)
            const regions = calculate_pixel_crop_regions(dims, ppi)
            for (let i = 1; i < regions.length; i++)
                expect(regions[i].x).toBe(regions[i - 1].x + regions[i - 1].width)
            for (const region of regions) {
                expect(region.width).toBeGreaterThan(0)
                expect(region.height).toBeGreaterThan(0)
            }
        }))
    })

    it('keeps every crop region inside the canvas', () => {
        fc.assert(fc.property(print_config, print => {
            const dims = resolve_dimensions(print)
            for (const region of calculate_crop_regions(dims)) {
                expect(region.x).toBeGreaterThanOrEqual(0)
                expect(region.x + region.width).toBeLessThanOrEqual(
                    dims.cover_total_width.toNumber() + 1e-9)
                expect(region.y + region.height).toBeLessThanOrEqual(
                    dims.cover_total_height.toNumber() + 1e-9)
            }
        }))
    })
})


describe('resolve_colors always returns renderable colors', () => {

    it('returns a parseable color for every field', () => {
        fc.assert(fc.property(hsl_color, fc.option(hsl_color, {nil: null}), (bg, spine) => {
            const colors = resolve_colors(make_schema({bg_color: bg, spine_color: spine}))
            for (const [key, value] of Object.entries(colors)) {
                if (value === null)
                    continue
                expect(value, key).toMatch(HSL_PATTERN)
                expect(() => chroma(value.replace('deg', '')), key).not.toThrow()
            }
        }))
    })

    it('picks whichever of white and near-black reads better on the background', () => {
        // Not every background can clear 4.5:1 — a mid-gray caps out below it against either
        // option — so the invariant is that the better of the two always wins
        fc.assert(fc.property(hsl_color, bg => {
            const title = resolve_colors(make_schema({bg_color: bg})).front_title1
            const chosen = contrast_between(title, bg)
            const other = title.includes('100%')
                ? contrast_between('hsl(0deg, 0%, 10%)', bg)
                : contrast_between('hsl(0deg, 0%, 100%)', bg)
            expect(chosen).toBeGreaterThanOrEqual(other)
        }))
    })

    it('never lands auto text on a mid-gray', () => {
        // Auto colors are always white or near-black without an image to sample
        fc.assert(fc.property(hsl_color, bg => {
            const colors = resolve_colors(make_schema({bg_color: bg}))
            for (const field of [colors.front_title1, colors.front_author, colors.blurb]) {
                const l = chroma(field.replace('deg', '')).hsl()[2] || 0
                expect(l <= 0.11 || l >= 0.89, field).toBe(true)
            }
        }))
    })

    it('keeps blurb text readable against its own container', () => {
        fc.assert(fc.property(hsl_color, bg => {
            const colors = resolve_colors(make_schema({bg_color: bg}))
            const backdrop = colors.blurb_background ?? colors.front_background
            expect(contrast_between(colors.blurb, backdrop)).toBeGreaterThan(4.5)
        }))
    })
})


describe('image-derived colors', () => {

    it('generates a palette of the requested size for any base and scheme', () => {
        const schemes:PaletteScheme[] = ['triadic', 'analogous', 'split_complementary',
            'complementary', 'accent_tones']
        fc.assert(fc.property(hex_color, fc.integer({min: 1, max: 8}),
            fc.constantFrom(...schemes), (base, count, scheme) => {
                const palette = generate_palette(base, count, scheme)
                expect(palette).toHaveLength(count)
                for (const color of palette)
                    expect(color).toMatch(/^#[0-9a-f]{6}$/)
            }))
    })

    it('synthesizes a valid fill from any set of sampled regions', () => {
        fc.assert(fc.property(fc.array(region_stats, {minLength: 1, maxLength: 4}), regions => {
            expect(synthesize_fill(regions)).toMatch(/^#[0-9a-f]{6}$/)
            expect(synthesize_fill(regions, 0.45)).toMatch(/^#[0-9a-f]{6}$/)
        }))
    })

    it('meets the contrast target whenever it is reachable at all', () => {
        fc.assert(fc.property(fc.integer({min: 0, max: 359}),
            fc.float({min: 0, max: 1, noNaN: true}), hex_color, (hue, sat, bg) => {
                const color = tinted_contrast_text(hue, sat, bg, 4.5)
                const best = Math.max(chroma.contrast('#ffffff', bg), chroma.contrast('#000000', bg))
                if (best >= 4.5)
                    expect(chroma.contrast(color, bg)).toBeGreaterThan(4.4)
            }))
    })

    it('never picks a washed mid-tone with no color in it', () => {
        fc.assert(fc.property(fc.array(region_stats, {minLength: 1, maxLength: 3}), region_stats,
            (candidates, backdrop) => {
                const picked = pick_vivid_tint(candidates, backdrop)
                const [, saturation, lightness] = chroma(picked).hsl()
                // Either it carries real color, or it went to an extreme — never a flat gray
                expect(saturation > 0.05 || lightness < 0.2 || lightness > 0.8, picked).toBe(true)
            }))
    })
})


describe('text handling', () => {

    it('leaves no straight quote behind', () => {
        fc.assert(fc.property(fc.string(), text => {
            const curled = curly_quotes(text)
            expect(curled).not.toContain('"')
            expect(curled).not.toContain("'")
            expect(curled.length).toBe(text.length)
        }))
    })

    it('sizes the spine within its width for any title', () => {
        fc.assert(fc.property(fc.string({maxLength: 200}), print_config, (title, print) => {
            const dims = resolve_dimensions(print)
            const sizes = calculate_font_sizes(
                make_schema({spine_title: title, spine_author: 'Author', ...print}), dims)
            expect(sizes.spine_title).toBeLessThanOrEqual(dims.cover_spine.toNumber() * 0.65)
            expect(sizes.spine_title === 0 || sizes.spine_title >= 2.5).toBe(true)
            expect(sizes.subtitle_lines.length).toBeLessThanOrEqual(2)
        }))
    })

    it('always asks for the base font, whatever the cover says', () => {
        fc.assert(fc.property(fc.string({maxLength: 60}), text => {
            const fonts = collect_all_fonts(make_schema({title1: text, blurb: text}))
            expect(fonts[0]).toBe('Noto Serif')
            expect(fonts).toEqual([...new Set(fonts)])
        }))
    })
})
