
import {describe, it, expect} from 'vitest'

import {hex_to_hsl, is_dark_color, derive_colors, hex_override_to_hsl} from '../src/colors.js'


describe('hex_to_hsl', () => {

    it('converts the primaries', () => {
        expect(hex_to_hsl('#ff0000').map(Math.round)).toEqual([0, 100, 50])
        expect(hex_to_hsl('#00ff00').map(Math.round)).toEqual([120, 100, 50])
        expect(hex_to_hsl('#0000ff').map(Math.round)).toEqual([240, 100, 50])
    })

    it('reports achromatic colors with hue and saturation zero', () => {
        expect(hex_to_hsl('#000000')).toEqual([0, 0, 0])
        expect(hex_to_hsl('#ffffff')).toEqual([0, 0, 100])
        expect(hex_to_hsl('#808080').map(Math.round)).toEqual([0, 0, 50])
    })

    it('keeps lightness above 50% for tints and below it for shades', () => {
        expect(hex_to_hsl('#ffcccc')[2]).toBeGreaterThan(50)
        expect(hex_to_hsl('#330000')[2]).toBeLessThan(50)
    })
})


describe('is_dark_color', () => {

    it('picks white text for dark backgrounds and black for light ones', () => {
        expect(is_dark_color('#000000')).toBe(true)
        expect(is_dark_color('#1a1a2e')).toBe(true)
        expect(is_dark_color('#ffffff')).toBe(false)
        expect(is_dark_color('#f5f5dc')).toBe(false)
    })

    it('compares against the near-black it pairs with, not pure black', () => {
        // On a mid-gray, near-black manages 3.94:1 where white gives 4.42:1 — comparing
        // against pure black instead reported this background as light and picked the worse of
        // the two (mirrors the same fix in design.ts's resolve_colors)
        expect(is_dark_color('#787878')).toBe(true)
        expect(derive_colors('#787878', null).front_title).toBe('hsl(0deg, 0%, 100%)')
    })

    it('weights green far above blue, as WCAG luminance does', () => {
        // Pure blue is dark enough to need white text; pure green is not
        expect(is_dark_color('#0000ff')).toBe(true)
        expect(is_dark_color('#00ff00')).toBe(false)
    })
})


describe('derive_colors', () => {

    it('derives white text on a dark background', () => {
        const colors = derive_colors('#1a1a2e', null)
        expect(colors.front_title).toBe('hsl(0deg, 0%, 100%)')
        expect(colors.front_author).toBe('hsl(0deg, 0%, 100%)')
    })

    it('derives near-black text on a light background', () => {
        // 10% rather than 0% — a pure-gray K90 that prints predictably
        expect(derive_colors('#fefefe', null).front_title).toBe('hsl(0deg, 0%, 10%)')
    })

    it('leaves the spine unpainted unless a spine color was chosen', () => {
        expect(derive_colors('#1a1a2e', null).spine_background).toBeNull()
        expect(derive_colors('#1a1a2e', '#ff0000').spine_background).toBe('hsl(0deg, 100%, 50%)')
    })

    it('contrasts spine text against the spine color, not the cover background', () => {
        // Light spine on a dark cover — the spine text must go dark even though the cover is dark
        expect(derive_colors('#000000', '#ffffff').spine_title).toBe('hsl(0deg, 0%, 10%)')
    })

    it('bands the blurb background away from mid-tones, keeping the background hue', () => {
        const dark = derive_colors('#2e4a8f', null)
        expect(dark.blurb_background).toMatch(/^hsl\(\d+deg, \d+%, (\d|1\d|2[0-5])%\)$/)
        const light = derive_colors('#c8d8f0', null)
        expect(light.blurb_background).toMatch(/^hsl\(\d+deg, \d+%, (7[5-9]|8\d|9\d|100)%\)$/)
    })

    it('contrasts blurb text against the blurb container, not the cover background', () => {
        expect(derive_colors('#2e4a8f', null).blurb).toBe('hsl(0deg, 0%, 100%)')
        expect(derive_colors('#c8d8f0', null).blurb).toBe('hsl(0deg, 0%, 10%)')
    })

    it('uses the sampled image color behind the back panel for the blurb', () => {
        // A light cover color, but the image actually behind the blurb is dark
        const colors = derive_colors('#ffffff', null, {back: '#101010'})
        expect(colors.blurb).toBe('hsl(0deg, 0%, 100%)')
    })

    it('uses the sampled image color behind the spine for spine text', () => {
        expect(derive_colors('#ffffff', null, {spine: '#101010'}).spine_title)
            .toBe('hsl(0deg, 0%, 100%)')
    })

    it('never paints a spine background from a sampled image color', () => {
        // cover.typ paints the spine fill after the image layer, so a fill here would hide it
        expect(derive_colors('#ffffff', null, {spine: '#101010'}).spine_background).toBeNull()
    })

    it('lets an explicit spine color override the sampled image color', () => {
        const colors = derive_colors('#ffffff', '#ffffff', {spine: '#101010'})
        expect(colors.spine_title).toBe('hsl(0deg, 0%, 10%)')
    })
})


describe('hex_override_to_hsl', () => {

    it('converts a hex override to the schema HSL string form', () => {
        expect(hex_override_to_hsl('#ff0000')).toBe('hsl(0deg, 100%, 50%)')
    })

    it('passes an absent override through as null', () => {
        expect(hex_override_to_hsl(null)).toBeNull()
        expect(hex_override_to_hsl('')).toBeNull()
    })
})
