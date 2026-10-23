// analyze_rect/analyze_pixel_regions sample a decoded image's dominant colours per cover
// region. They're pure, so these feed them synthetic RGBA buffers with known colours.

import {describe, it, expect} from 'vitest'

import {analyze_rect, analyze_pixel_regions} from '../src/image_regions.js'
import type {RegionStats} from '../src/design.js'
import type {Region} from 'printing-services'
import {make_dims} from './helpers.js'

type Rgba = [number, number, number, number]

const RED:Rgba = [255, 0, 0, 255]
const GREEN:Rgba = [0, 255, 0, 255]
const BLUE:Rgba = [0, 0, 255, 255]
const BLACK:Rgba = [0, 0, 0, 255]
const WHITE:Rgba = [255, 255, 255, 255]
const GRAY:Rgba = [128, 128, 128, 255]
const CLEAR:Rgba = [255, 0, 0, 0]

/** An RGBA buffer of the given size, each pixel coloured by a callback */
function image(width:number, height:number, color:(x:number, y:number) => Rgba):Uint8ClampedArray {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++)
            data.set(color(x, y), (y * width + x) * 4)
    }
    return data
}

/** Analyze the whole of a solid-colour 4x4 image */
function solid(color:Rgba):RegionStats {
    return analyze_rect(image(4, 4, () => color), 4, 4, {x: 0, y: 0, w: 4, h: 4})
}

/** Angular distance between two hues, in degrees */
function hue_gap(a:number, b:number):number {
    const d = Math.abs(a - b) % 360
    return Math.min(d, 360 - d)
}


describe('analyze_rect', () => {

    it('reads a solid primary\'s hue, full saturation and mid lightness', () => {
        for (const [color, hue] of [[RED, 0], [GREEN, 120], [BLUE, 240]] as const) {
            const stats = solid(color)
            expect(stats.hue).toBeCloseTo(hue, 6)
            expect(stats.saturation).toBeCloseTo(1, 6)
            expect(stats.lightness).toBeCloseTo(0.5, 6)
            expect(stats.lightness_spread).toBeCloseTo(0, 6)
        }
    })

    it('gives a neutral gray no hue or saturation', () => {
        const stats = solid(GRAY)
        expect(stats.hue).toBe(0)
        expect(stats.saturation).toBe(0)
        expect(stats.lightness).toBeCloseTo(128 / 255, 6)
    })

    it('reports a half-black, half-white region as mid lightness with a wide spread', () => {
        const data = image(4, 4, x => x < 2 ? BLACK : WHITE)
        const stats = analyze_rect(data, 4, 4, {x: 0, y: 0, w: 4, h: 4})
        expect(stats.lightness).toBeCloseTo(0.5, 6)
        expect(stats.lightness_spread).toBeCloseTo(0.5, 6)
    })

    it('averages hue on the circle, so hues either side of red average to red', () => {
        // Hue ~350 and hue ~10 would average to ~180 (cyan) as plain numbers
        const data = image(2, 1, x => x === 0 ? [255, 0, 43, 255] : [255, 43, 0, 255])
        const stats = analyze_rect(data, 2, 1, {x: 0, y: 0, w: 2, h: 1})
        expect(hue_gap(stats.hue, 0)).toBeLessThan(1)
    })

    it('weights hue by saturation, so a muddy pixel barely pulls a vivid one', () => {
        // One vivid red beside one barely-blue gray
        const data = image(2, 1, x => x === 0 ? RED : [120, 120, 140, 255])
        const stats = analyze_rect(data, 2, 1, {x: 0, y: 0, w: 2, h: 1})
        expect(hue_gap(stats.hue, 0)).toBeLessThan(10)
    })

    it('ignores mostly-transparent pixels', () => {
        const data = image(4, 1, x => x === 0 ? BLUE : CLEAR)
        const stats = analyze_rect(data, 4, 1, {x: 0, y: 0, w: 4, h: 1})
        expect(stats.hue).toBeCloseTo(240, 6)
        expect(stats.saturation).toBeCloseTo(1, 6)
    })

    it('falls back to a neutral mid-gray when no pixel counts', () => {
        const neutral = {hue: 0, saturation: 0, lightness: 0.5, lightness_spread: 0}
        expect(solid(CLEAR)).toEqual(neutral)
        // A rect wholly outside the image samples nothing either
        const data = image(4, 4, () => RED)
        expect(analyze_rect(data, 4, 4, {x: 10, y: 10, w: 5, h: 5})).toEqual(neutral)
    })

    it('clamps a rect that overhangs the image to its bounds', () => {
        const data = image(4, 4, x => x < 2 ? RED : BLUE)
        // Overhangs to the left, so only the red half is really inside it
        const stats = analyze_rect(data, 4, 4, {x: -10, y: -10, w: 12, h: 20})
        expect(stats.hue).toBeCloseTo(0, 6)
    })
})


describe('analyze_pixel_regions', () => {

    it('samples the top third and bottom quarter of the whole image as the front', () => {
        // Rows 0-3 red (top third of 12), rows 9-11 blue (bottom quarter), green between
        const data = image(4, 12, (_x, y) => y < 4 ? RED : y >= 9 ? BLUE : GREEN)
        const regions = analyze_pixel_regions(data, 4, 12, null)
        expect(regions.front_top.hue).toBeCloseTo(0, 6)
        expect(regions.front_bottom.hue).toBeCloseTo(240, 6)
    })

    it('leaves the full-wrap regions null without dimensions', () => {
        const regions = analyze_pixel_regions(image(4, 4, () => RED), 4, 4, null)
        expect(regions.front_top_full).toBeNull()
        expect(regions.front_bottom_full).toBeNull()
        expect(regions.back).toBeNull()
        expect(regions.spine).toBeNull()
    })

    it('locates the front, back and spine within a full-wrap image', () => {
        const dims = make_dims()
        // 4px per mm, with each pixel coloured by the panel its centre falls in
        const px_per_mm = 4
        const width = Math.round(dims.cover_total_width.toNumber() * px_per_mm)
        const height = Math.round(dims.cover_total_height.toNumber() * px_per_mm)
        const within = (region:Region, x:number) => {
            const mm = (x + 0.5) / px_per_mm
            return mm >= region.x.toNumber() && mm < region.x.toNumber() + region.w.toNumber()
        }
        const data = image(width, height, x =>
            within(dims.cover_region_spine, x) ? BLUE
                : within(dims.cover_region_front, x) ? RED
                : within(dims.cover_region_back, x) ? GREEN
                : GRAY)
        const regions = analyze_pixel_regions(data, width, height, dims)
        // An edge column of a neighbouring panel may round in, so allow a few degrees
        expect(hue_gap(regions.front_top_full!.hue, 0)).toBeLessThan(3)
        expect(hue_gap(regions.front_bottom_full!.hue, 0)).toBeLessThan(3)
        expect(hue_gap(regions.back!.hue, 120)).toBeLessThan(3)
        expect(hue_gap(regions.spine!.hue, 240)).toBeLessThan(3)
        // The whole-image interpretation sees every panel at once, so it's no single one
        expect(regions.front_top.hue).not.toBeCloseTo(0, 0)
    })
})
