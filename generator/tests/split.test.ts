
import {describe, it, expect} from 'vitest'

import {calculate_crop_regions, calculate_pixel_crop_regions, split_svg, split_pdf,
    split_png} from '../src/split.js'
import {make_dims} from './helpers.js'

// Panels are cut out of the trim area, so mm↔pt uses Typst's own 72pt-per-inch coordinate system
const MM_TO_PT = 72 / 25.4

/** A minimal Typst-shaped SVG covering the full cover */
function full_svg(dims = make_dims()):string {
    const w = (dims.cover_total_width.toNumber() * MM_TO_PT).toFixed(4)
    const h = (dims.cover_total_height.toNumber() * MM_TO_PT).toFixed(4)
    return `<svg class="typst-doc" viewBox="0 0 ${w} ${h}" width="${w}pt" height="${h}pt" `
        + 'xmlns="http://www.w3.org/2000/svg"><g><path d="M0 0"/></g></svg>'
}

/** Read the numbers out of an attribute like viewBox="a b c d" */
function attr_numbers(svg:string, name:string):number[] {
    const match = new RegExp(`${name}="([^"]*)"`).exec(svg)
    return (match?.[1] ?? '').split(/[\s]+/).map(parseFloat)
}

/** A tiny PDF with a page dict and a traditional xref table, for CropBox injection */
function fake_pdf():Uint8Array {
    const body = '%PDF-1.7\n'
        + '1 0 obj\n<< /Type /Page /MediaBox [0 0 930.71 665.95] >>\nendobj\n'
        + '2 0 obj\n<< /Type /Catalog >>\nendobj\n'
        + 'xref\n0 3\n'
        + '0000000000 65535 f \n0000000009 00000 n \n0000000200 00000 n \n'
        + 'trailer\n<< /Size 3 >>\nstartxref\n300\n%%EOF\n'
    return new Uint8Array([...body].map(c => c.charCodeAt(0)))
}

/** Decode PDF bytes back to latin1 text for inspection */
function pdf_text(pdf:Uint8Array):string {
    return [...pdf].map(b => String.fromCharCode(b)).join('')
}


describe('calculate_crop_regions', () => {

    it('returns the three panels in cover order', () => {
        expect(calculate_crop_regions(make_dims()).map(r => r.label))
            .toEqual(['back', 'spine', 'front'])
    })

    it('omits the spine when the cover has none', () => {
        const spineless = {service_id: 'custom', binding_type: 'paperback', size_id: undefined,
            custom_unit: 'mm', custom_trim_width: 152, custom_trim_height: 229,
            custom_spine: 0, custom_bleed: 0}
        const regions = calculate_crop_regions(make_dims(spineless))
        expect(regions.map(r => r.label)).toEqual(['back', 'front'])
    })

    it('excludes bleed — panels start at the trim edge', () => {
        const dims = make_dims()
        const [back] = calculate_crop_regions(dims)
        expect(back.x).toBeCloseTo(dims.cover_bleed.toNumber(), 6)
        expect(back.y).toBeCloseTo(dims.cover_bleed.toNumber(), 6)
        expect(back.height).toBeCloseTo(dims.cover_face_height.toNumber(), 6)
    })

    it('tiles the panels edge to edge with no gap or overlap', () => {
        const regions = calculate_crop_regions(make_dims())
        for (let i = 1; i < regions.length; i++) {
            const previous = regions[i - 1]
            expect(regions[i].x).toBeCloseTo(previous.x + previous.width, 6)
        }
    })
})


describe('calculate_pixel_crop_regions', () => {

    it('scales the regions by the requested PPI', () => {
        const dims = make_dims()
        const [back] = calculate_pixel_crop_regions(dims, 300)
        expect(back.width).toBe(Math.round(dims.cover_face_width.toNumber() / 25.4 * 300))
    })

    it('leaves no rounding gap or overlap between adjacent panels', () => {
        // Sizes are derived from rounded edges, not rounded independently
        for (const ppi of [72, 144, 150, 300, 601]) {
            const regions = calculate_pixel_crop_regions(make_dims(), ppi)
            for (let i = 1; i < regions.length; i++) {
                const previous = regions[i - 1]
                expect(regions[i].x, `${ppi}`).toBe(previous.x + previous.width)
            }
        }
    })

    it('tiles even when a panel edge is not float-exact', () => {
        // Here the spine's right edge (x + width, in floating point) lands an ulp past the
        // front panel's x, which used to round the two apart into a 1px seam at some PPIs
        const dims = make_dims({service_id: 'lulu', size_id: 'pocket_book',
            binding_type: 'hardcover_jacket', page_count: 800})
        const mm = calculate_crop_regions(dims)
        const spine = mm.findIndex(r => r.label === 'spine')
        expect(mm[spine].x + mm[spine].width).not.toBe(mm[spine + 1].x)
        for (const ppi of [44, 52, 76, 116, 140, 150, 300]) {
            const pixels = calculate_pixel_crop_regions(dims, ppi)
            expect(pixels[spine + 1].x, `${ppi}`).toBe(pixels[spine].x + pixels[spine].width)
        }
    })

    it('returns whole pixels only', () => {
        for (const region of calculate_pixel_crop_regions(make_dims(), 150)) {
            for (const value of [region.x, region.y, region.width, region.height])
                expect(Number.isInteger(value)).toBe(true)
        }
    })
})


describe('split_svg', () => {

    it('returns one SVG per panel', () => {
        const parts = split_svg(full_svg(), make_dims())
        expect(parts.front).toContain('<svg')
        expect(parts.back).toContain('<svg')
        expect(parts.spine).toContain('<svg')
    })

    it('moves the viewBox onto each panel and resizes to match', () => {
        const dims = make_dims()
        const parts = split_svg(full_svg(dims), dims)
        const [x, y, w, h] = attr_numbers(parts.front, 'viewBox')
        const front = dims.cover_region_front
        expect(x).toBeCloseTo(front.x.toNumber() * MM_TO_PT, 3)
        expect(y).toBeCloseTo(front.y.toNumber() * MM_TO_PT, 3)
        expect(w).toBeCloseTo(front.w.toNumber() * MM_TO_PT, 3)
        expect(h).toBeCloseTo(front.h.toNumber() * MM_TO_PT, 3)
        expect(attr_numbers(parts.front, 'width')[0]).toBeCloseTo(w, 3)
        expect(attr_numbers(parts.front, 'height')[0]).toBeCloseTo(h, 3)
    })

    it('gives the spine panel the narrowest viewBox of the three', () => {
        const parts = split_svg(full_svg(), make_dims())
        const width_of = (svg:string) => attr_numbers(svg, 'viewBox')[2]
        expect(width_of(parts.spine!)).toBeLessThan(width_of(parts.front))
        expect(width_of(parts.front)).toBeCloseTo(width_of(parts.back), 3)
    })

    it('adds a viewBox to an SVG that has none', () => {
        const no_viewbox = '<svg width="100pt" height="50pt" xmlns="http://www.w3.org/2000/svg"></svg>'
        const parts = split_svg(no_viewbox, make_dims())
        expect(parts.front).toMatch(/viewBox="[\d.\s]+"/)
    })

    it('keeps the document content — only the root element changes', () => {
        const parts = split_svg(full_svg(), make_dims())
        expect(parts.front).toContain('<path d="M0 0"/>')
        expect(parts.front).toContain('class="typst-doc"')
    })

    it('leaves the spine undefined when the cover has none', () => {
        const spineless = {service_id: 'custom', binding_type: 'paperback', size_id: undefined,
            custom_unit: 'mm', custom_trim_width: 152, custom_trim_height: 229,
            custom_spine: 0, custom_bleed: 0}
        const dims = make_dims(spineless)
        expect(split_svg(full_svg(dims), dims).spine).toBeUndefined()
    })
})


describe('split_pdf', () => {

    it('injects a CropBox for each panel and keeps the MediaBox', () => {
        const parts = split_pdf(fake_pdf(), make_dims())
        const front = pdf_text(parts.front)
        expect(front).toContain('/MediaBox [0 0 930.71 665.95]')
        expect(front).toMatch(/\/CropBox \[[\d.]+ [\d.]+ [\d.]+ [\d.]+\]/)
    })

    it('flips the y axis — PDF origin is bottom-left, regions are top-left', () => {
        const dims = make_dims()
        const front = pdf_text(split_pdf(fake_pdf(), dims).front)
        const box = /\/CropBox \[([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)\]/.exec(front)!
        const [x1, y1, x2, y2] = box.slice(1).map(parseFloat)
        const total_h_pt = dims.cover_total_height.toNumber() * MM_TO_PT
        const region = dims.cover_region_front
        expect(x1).toBeCloseTo(region.x.toNumber() * MM_TO_PT, 1)
        expect(y2 - y1).toBeCloseTo(region.h.toNumber() * MM_TO_PT, 1)
        expect(y2).toBeCloseTo(total_h_pt - region.y.toNumber() * MM_TO_PT, 1)
    })

    it('gives each panel its own crop of the same full page', () => {
        const parts = split_pdf(fake_pdf(), make_dims())
        const crop_of = (pdf:Uint8Array) => /\/CropBox \[[^\]]*\]/.exec(pdf_text(pdf))![0]
        expect(crop_of(parts.front)).not.toBe(crop_of(parts.back))
        expect(crop_of(parts.spine!)).not.toBe(crop_of(parts.front))
    })

    it('repairs the xref offsets it shifted, and leaves earlier ones alone', () => {
        const injected = pdf_text(split_pdf(fake_pdf(), make_dims()).front)
        const entries = [...injected.matchAll(/(\d{10}) (\d{5}) n/g)].map(m => parseInt(m[1], 10))
        const insertion_point = injected.indexOf('/CropBox')
        const shift = injected.length - pdf_text(fake_pdf()).length
        // The object before the insertion keeps its offset; the one after it moves by the shift
        expect(entries[0]).toBe(9)
        expect(entries[1]).toBe(200 + shift)
        expect(insertion_point).toBeGreaterThan(0)
        expect(/startxref\s+(\d+)/.exec(injected)![1]).toBe(String(300 + shift))
    })

    it('returns the PDF untouched when there is no MediaBox to anchor to', () => {
        const no_page = new Uint8Array([...'%PDF-1.7\nnothing here\n'].map(c => c.charCodeAt(0)))
        expect(split_pdf(no_page, make_dims()).front).toEqual(no_page)
    })
})


describe('split_png', () => {

    it('hands each panel\'s pixel region to the platform crop callback', async () => {
        const calls:number[][] = []
        const crop = async (data:Uint8Array, x:number, y:number, w:number, h:number) => {
            calls.push([x, y, w, h])
            return new Uint8Array([data.length, w, h])
        }
        const dims = make_dims()
        const parts = await split_png(new Uint8Array([1, 2, 3]), dims, 150, crop)
        expect(calls).toHaveLength(3)
        expect(calls).toEqual(calculate_pixel_crop_regions(dims, 150)
            .map(r => [r.x, r.y, r.width, r.height]))
        expect(parts.front).toBeInstanceOf(Uint8Array)
        expect(parts.spine).toBeDefined()
    })
})
