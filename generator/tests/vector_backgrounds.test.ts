
// The source SVGs name colors by placeholder hex, and recolor_svg() swaps them by plain text
// substitution — so a placeholder that drifts from what slot_tones() derives, or a stray color
// a design author left in, silently survives into the cover. These pin both down.

import {describe, it, expect} from 'vitest'
import {list_vector_backgrounds, PLACEHOLDER_COLORS, slot_tones} from '../src/vector_backgrounds.js'
import {VECTOR_BG_IMAGE_SVGS} from '../src/generated/vector_bg_images_data.js'

const BASES = [PLACEHOLDER_COLORS[0], PLACEHOLDER_COLORS[3], PLACEHOLDER_COLORS[6]]
const HEX_RE = /#[0-9a-f]{6}(?![0-9a-f])/gi

/** Hex colors that actually paint something. Inkscape leaves a `stop-color:#000000` in some
 *  path styles, where it does nothing (no design here uses gradients), so those are skipped */
function painted_hexes(svg:string):string[] {
    return svg.replace(/stop-color:#[0-9a-f]{6}/gi, '').match(HEX_RE) ?? []
}

describe('vector background placeholders', () => {

    it('writes out each variant placeholder as slot_tones() of its base', () => {
        expect(BASES.flatMap(slot_tones)).toEqual(PLACEHOLDER_COLORS)
    })

    it('uses only placeholder colors in every source SVG', () => {
        for (const [id, svg] of Object.entries(VECTOR_BG_IMAGE_SVGS)) {
            const stray = painted_hexes(svg).filter(h => !PLACEHOLDER_COLORS.includes(h.toLowerCase()))
            expect(stray, id).toEqual([])
        }
    })

    it('replaces every placeholder, variants included, with a tone of the given palette', () => {
        const palette = ['#112233', '#445566', '#778899']
        const tones = palette.flatMap(slot_tones)
        for (const design of list_vector_backgrounds()) {
            for (const hex of painted_hexes(design.render(palette))) {
                expect(tones, design.id).toContain(hex.toLowerCase())
            }
        }
    })

    it('passes each base color through unchanged', () => {
        const palette = ['#AbCdEf', '#123456', '#654321']
        expect(slot_tones(palette[0])[0]).toBe('#AbCdEf')
    })
})
