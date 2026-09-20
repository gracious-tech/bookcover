
// The barcode is render-affecting output that nothing else pins — build.test.ts only checks
// that barcode.svg exists. These fix its actual content, because generate_isbn_barcode calls
// bwip-js's isbn encoder directly rather than going through toSVG()'s bcid dispatch (see
// barcode.ts): the saving is ~1.5MB of unused symbologies, and the price is that a wrong turn
// there would silently change every cover's barcode instead of failing loudly.

import {describe, it, expect} from 'vitest'
import {createHash} from 'node:crypto'
import {generate_isbn_barcode} from '../src/barcode.js'

const decoder = new TextDecoder()

// Render a barcode to its SVG string
function svg_for(isbn:string, w = 50, h = 30):string {
    return decoder.decode(generate_isbn_barcode(isbn, w, h))
}

describe('generate_isbn_barcode', () => {

    it('renders a known ISBN to complete SVG on a white ground', () => {
        const svg = svg_for('978-0-306-40615-7')
        expect(svg.startsWith('<svg')).toBe(true)
        expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
        // White background — KDP and others reject anything else
        expect(svg).toContain('<rect width="100%" height="100%" fill="#ffffff" />')
        // The human-readable ISBN line is drawn as glyph outlines, not as SVG text, so its
        // presence shows up as extra paths beyond the single path that draws the bars
        expect(svg).not.toContain('<text')
        const paths = svg.match(/<path\b/g) ?? []
        expect(paths.length).toBeGreaterThan(1)
    })

    it('is byte-identical to the output recorded when the encoder call was last changed', () => {
        // Captured from bwip-js 4.10.x via toSVG({bcid: 'isbn'}); calling the isbn encoder
        // directly must reproduce it exactly. A diff here means rendered covers changed —
        // if that is deliberate, re-record these and bump RENDER_VERSION
        const expected:Record<string, string> = {
            '978-0-306-40615-7':
                '4fc83158e78da06eded132d6643b297ab65c05fdad7418a898f26c4d299f964e',
            '978-1-56619-909-4':
                '03eaa8b66c14e11d80c8557befe4014f62a7a1df3ab6423bbc4630fe7ee699b0',
        }
        for (const [isbn, sha] of Object.entries(expected)) {
            const actual = createHash('sha256').update(svg_for(isbn)).digest('hex')
            expect(actual, isbn).toBe(sha)
        }
    })

    it('scales with the requested region, and ignores surrounding whitespace', () => {
        expect(svg_for('978-0-306-40615-7', 50, 30))
            .not.toBe(svg_for('978-0-306-40615-7', 60, 35))
        expect(svg_for('  978-0-306-40615-7  ')).toBe(svg_for('978-0-306-40615-7'))
    })

    it('still validates the ISBN rather than rendering nonsense', () => {
        // The direct encoder call must keep bwipp's own checks — a bad check digit is the
        // most likely thing a user actually types
        expect(() => svg_for('978-0-306-40615-9')).toThrow(/check digit/i)
        expect(() => svg_for('')).toThrow()
    })

    it('handles the 979 prefix as well as 978', () => {
        // 979 is the newer ISBN range, and the one bwipp is most likely to treat differently
        const svg = svg_for('979-8-6024-0198-1')
        expect(svg.startsWith('<svg')).toBe(true)
        expect(svg).not.toBe(svg_for('978-0-306-40615-7'))
    })

})

