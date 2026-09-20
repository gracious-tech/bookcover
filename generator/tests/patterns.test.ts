
// Pattern metadata (patterns.ts) and the SVG payload (patterns_svg.ts) are separate modules so
// that importing the metadata doesn't drag ~220KB of SVG in with it. That split means the two
// can drift, so these hold them together — the PatternId union catches a missing entry at
// compile time, and these catch the values going stale.

import {describe, it, expect} from 'vitest'
import {list_patterns, find_pattern} from '../src/patterns.js'
import {PATTERN_SVGS, find_pattern_svg} from '../src/patterns_svg.js'

const patterns = list_patterns()

// Natural width/height as declared on the SVG root, which is what build() measures at render
// time to work out the tile's aspect ratio
function svg_aspect(svg:string):number {
    const w = parseFloat(svg.match(/\bwidth="([0-9.]+)"/)?.[1] ?? '1')
    const h = parseFloat(svg.match(/\bheight="([0-9.]+)"/)?.[1] ?? '1')
    return (w > 0 && h > 0) ? w / h : 1
}

describe('pattern metadata and SVG payload stay in sync', () => {

    it('ships at least one pattern, and the same set on both sides of the split', () => {
        expect(patterns.length).toBeGreaterThan(0)
        expect(Object.keys(PATTERN_SVGS).sort()).toEqual(patterns.map(p => p.id).sort())
    })

    it('resolves every pattern id to a usable SVG tile', () => {
        for (const pattern of patterns) {
            const svg = find_pattern_svg(pattern.id)
            expect(svg, pattern.id).toBeTypeOf('string')
            expect(svg, pattern.id).toContain('<svg')
            // Recolouring at render time is a currentColor substitution, so every tile needs it
            expect(svg, pattern.id).toContain('currentColor')
        }
    })

    it('records each tile\'s aspect ratio to match its own SVG', () => {
        // aspect_ratio is baked into the metadata so the picker can size preview swatches
        // without loading the payload — it has to agree with the SVG it was derived from
        for (const pattern of patterns) {
            const expected = svg_aspect(find_pattern_svg(pattern.id)!)
            expect(pattern.aspect_ratio, pattern.id).toBeCloseTo(expected, 3)
        }
    })

    it('gives every pattern a positive physical tile size', () => {
        for (const pattern of patterns)
            expect(pattern.tile_mm, pattern.id).toBeGreaterThan(0)
    })

    it('looks patterns up by id, and reports unknown ids as undefined', () => {
        expect(find_pattern('bamboo')?.name).toBe('Bamboo')
        expect(find_pattern('not-a-pattern')).toBeUndefined()
        expect(find_pattern_svg('not-a-pattern')).toBeUndefined()
    })

})

