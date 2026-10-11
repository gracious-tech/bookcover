
// Merges overlapping glyph contours in downloaded font files. Google Fonts' static TTFs are
// instanced from variable fonts and keep their overlapping contours; screens and home printers
// fill those with the nonzero rule, but some commercial print RIPs fill even-odd, so every
// overlap prints as a white gap (the crossbar of a "4", the bar of a "G"). Merging them is
// lossless in practice: coverage, advances, kerning and vertical metrics are untouched, and
// outlines move by at most about one font unit where intersections snap to the integer grid.
//
// There's no JS equivalent of fontTools' removeOverlaps (skia-pathops), so this shells out to
// Python and needs `pip install fonttools skia-pathops` — which is why it's opt-in.

import {spawn} from 'node:child_process'
import {createInterface} from 'node:readline'

// Run as `python3 -c SCRIPT <font paths...>`; prints one JSON line per file. A font with no
// overlaps above the sliver threshold is left untouched (not even re-saved), so re-runs are
// idempotent and don't churn bytes. Exits 3 when the Python dependencies are missing.
const SCRIPT = `
import json
import sys

try:
    from fontTools.ttLib import TTFont
    from fontTools.ttLib.removeOverlaps import removeOverlaps
    from fontTools.pens.recordingPen import DecomposingRecordingPen
    import pathops
except ImportError as err:
    print(err, file=sys.stderr)
    sys.exit(3)


# Names of glyphs whose filled area shrinks when overlaps are merged. Differences below
# 1/50000 em^2 (20 units^2 at 1000 upm) are slivers from intersections snapping to the integer
# grid, invisible in print even when filled even-odd.
def overlapping(font):
    glyph_set = font.getGlyphSet()
    upm = font['head'].unitsPerEm
    min_area = upm * upm / 50000
    found = []
    for name in font.getGlyphOrder():
        rec = DecomposingRecordingPen(glyph_set)
        glyph_set[name].draw(rec)
        if not rec.value:
            continue
        path = pathops.Path()
        rec.replay(path.getPen())
        if abs(pathops.simplify(path).area - path.area) > min_area:
            found.append(name)
    return found


# Merge each file in place, keeping hinting on the glyphs that didn't change
for path in sys.argv[1:]:
    font = TTFont(path, recalcTimestamp=False)
    before = overlapping(font)
    after = []
    if before:
        removeOverlaps(font, removeHinting=False)
        font.save(path)
        after = overlapping(TTFont(path))
    print(json.dumps({'path': path, 'merged': len(before), 'remaining': after}), flush=True)
`

// Outcome for one font file
export interface OverlapResult {
    path:string
    // Glyphs that had overlapping contours (0 means the file was left untouched)
    merged:number
    // Glyph names still overlapping after the merge — always empty unless something went wrong
    remaining:string[]
}

// Merge overlapping contours in place in each font file (TTF or CFF OTF), calling on_result as
// each file finishes. Throws if Python or its dependencies are missing, or if any glyph still
// overlaps afterwards.
export async function remove_overlaps(
    paths:string[],
    on_result?:(result:OverlapResult) => void,
):Promise<OverlapResult[]> {
    const child = spawn('python3', ['-c', SCRIPT, ...paths], {stdio: ['ignore', 'pipe', 'pipe']})

    // Collect stderr for error reporting, and parse results as they stream in
    let stderr = ''
    child.stderr.on('data', (chunk:Buffer) => {
        stderr += chunk.toString()
    })
    const results:OverlapResult[] = []
    const lines = createInterface({input: child.stdout})
    lines.on('line', line => {
        const result = JSON.parse(line) as OverlapResult
        results.push(result)
        on_result?.(result)
    })

    // Wait for both the process and the last stdout line
    const [code] = await Promise.all([
        new Promise<number | null>((resolve, reject) => {
            child.on('error', err => reject(new Error(
                `Removing overlaps needs python3 on PATH (${err.message})`)))
            child.on('close', resolve)
        }),
        new Promise(resolve => lines.on('close', resolve)),
    ])

    if (code === 3) {
        throw new Error('Removing overlaps needs fontTools and skia-pathops: '
            + `pip install fonttools skia-pathops (${stderr.trim()})`)
    }
    if (code !== 0) {
        throw new Error(`Removing overlaps failed (exit ${code}):\n${stderr.trim()}`)
    }

    // A merge that leaves overlaps behind would ship fonts that still print with gaps
    const failed = results.filter(r => r.remaining.length > 0)
    if (failed.length > 0) {
        const detail = failed.map(r => `${r.path}: ${r.remaining.slice(0, 10).join(', ')}`)
        throw new Error(`Overlaps remain after merging:\n${detail.join('\n')}`)
    }
    return results
}

