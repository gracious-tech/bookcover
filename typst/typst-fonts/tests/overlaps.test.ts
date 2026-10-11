
// remove_overlaps() runs fontTools under python3, so this suite skips itself when python3 or its
// dependencies (fonttools, skia-pathops) aren't installed

import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import {spawnSync} from 'node:child_process'
import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {remove_overlaps} from '../src/download/overlaps.js'

const has_python = spawnSync('python3', ['-c', 'import fontTools, pathops']).status === 0

// Builds a TTF with 'A' as two overlapping squares (a "+" shape in the middle overlaps) and 'B'
// as one clean square, both with a 600-unit advance
const BUILD_FONT = `
import sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen


def squares(boxes):
    pen = TTGlyphPen(None)
    for x0, y0, x1, y1 in boxes:
        pen.moveTo((x0, y0))
        pen.lineTo((x0, y1))
        pen.lineTo((x1, y1))
        pen.lineTo((x1, y0))
        pen.closePath()
    return pen.glyph()


fb = FontBuilder(1000, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'A', 'B'])
fb.setupCharacterMap({0x41: 'A', 0x42: 'B'})
fb.setupGlyf({
    '.notdef': squares([]),
    'A': squares([(100, 0, 300, 700), (0, 300, 500, 500)]),
    'B': squares([(100, 0, 500, 700)]),
})
fb.setupHorizontalMetrics({'.notdef': (600, 0), 'A': (600, 0), 'B': (600, 100)})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'Overlap Test', 'styleName': 'Regular'})
fb.setupOS2()
fb.setupPost()
fb.save(sys.argv[1])
`

// Advance widths of A and B, read back through fontTools
function advances(path:string):number[] {
    const script = 'import sys; from fontTools.ttLib import TTFont; '
        + 'h = TTFont(sys.argv[1])["hmtx"]; print(h["A"][0], h["B"][0])'
    const out = spawnSync('python3', ['-c', script, path], {encoding: 'utf8'})
    return out.stdout.trim().split(' ').map(Number)
}


describe.skipIf(!has_python)('remove_overlaps', () => {

    let dir:string
    let font:string

    beforeAll(() => {
        dir = mkdtempSync(join(tmpdir(), 'typst-fonts-overlaps-'))
        font = join(dir, 'OverlapTest-Regular.ttf')
        const built = spawnSync('python3', ['-c', BUILD_FONT, font], {encoding: 'utf8'})
        expect(built.status, built.stderr).toBe(0)
    })

    afterAll(() => {
        rmSync(dir, {recursive: true, force: true})
    })

    it('merges overlapping contours and keeps advances', async () => {
        const [result] = await remove_overlaps([font])
        expect(result!.merged).toBe(1)
        expect(result!.remaining).toEqual([])
        expect(advances(font)).toEqual([600, 600])
    })

    it('leaves an already-clean file byte-for-byte untouched', async () => {
        const before = readFileSync(font)
        const [result] = await remove_overlaps([font])
        expect(result!.merged).toBe(0)
        expect(readFileSync(font).equals(before)).toBe(true)
    })

    it('reports each file through the callback as it finishes', async () => {
        const seen:string[] = []
        await remove_overlaps([font], r => seen.push(r.path))
        expect(seen).toEqual([font])
    })
})

