
// The source SVGs name colors by placeholder hex, and recolor_svg() swaps them by plain text
// substitution — so a placeholder that drifts from what slot_tones() derives, or a stray color
// a design author left in, silently survives into the cover. These pin both down.

import {createHash} from 'node:crypto'
import {describe, it, expect} from 'vitest'
import {list_vector_backgrounds, find_vector_background, load_vector_background_svg, recolor_vector_svg,
    PLACEHOLDER_COLORS, RENAMED_VECTOR_BACKGROUNDS, RETIRED_VECTOR_BACKGROUNDS, slot_tones}
    from '../src/vector_backgrounds.js'
import {VECTOR_BG_IDS} from '../src/generated/vector_bg_images_data.js'

// Every design's source SVG, keyed by id — each is lazy-loaded on its own, so load them all here
const VECTOR_BG_IMAGE_SVGS:Record<string, string> = Object.fromEntries(await Promise.all(
    VECTOR_BG_IDS.map(async id => [id, await load_vector_background_svg(id) ?? ''])))

const BASES = [PLACEHOLDER_COLORS[0], PLACEHOLDER_COLORS[3], PLACEHOLDER_COLORS[6]]
const HEX_RE = /#[0-9a-f]{6}(?![0-9a-f])/gi

// Colors a design may use on purpose that stay fixed on every palette (e.g. a pure white star
// or white light beams), since recolor_svg() only touches placeholders
const FIXED_COLORS = ['#ffffff']

// Any opacity below 1, as an attribute or a style property
const TRANSLUCENT_RE = /(?:^|[\s;"'])(?:fill-|stroke-)?opacity\s*[:=]\s*["']?(?!1(?:\.0*)?(?![\d.]))[\d.]+/gi

/** Hex colors that actually paint something. Inkscape leaves a `stop-color:#000000` in some
 *  path styles, where it does nothing (no design here uses gradients), and saves its editor
 *  settings (page border, desk color) in a `<sodipodi:namedview>`, so those are skipped */
function painted_hexes(svg:string):string[] {
    return svg.replace(/stop-color:#[0-9a-f]{6}/gi, '')
        .replace(/<sodipodi:namedview\b[\s\S]*?(?:\/>|<\/sodipodi:namedview>)/g, '')
        .match(HEX_RE) ?? []
}

describe('vector background loading', () => {

    it('loads a source SVG for every design id', () => {
        for (const id of VECTOR_BG_IDS) {
            expect(VECTOR_BG_IMAGE_SVGS[id], id).toMatch(/^(?:<\?xml[^>]*>\s*)?<svg\b/)
        }
    })

    it('resolves an unknown id to undefined rather than throwing', async () => {
        await expect(load_vector_background_svg('no-such-design')).resolves.toBeUndefined()
    })
})

describe('vector background placeholders', () => {

    it('writes out each variant placeholder as slot_tones() of its base', () => {
        expect(BASES.flatMap(slot_tones)).toEqual(PLACEHOLDER_COLORS)
    })

    it('uses only placeholder (or deliberately fixed) colors in every source SVG', () => {
        const allowed = [...PLACEHOLDER_COLORS, ...FIXED_COLORS]
        for (const [id, svg] of Object.entries(VECTOR_BG_IMAGE_SVGS)) {
            const stray = painted_hexes(svg).filter(h => !allowed.includes(h.toLowerCase()))
            expect(stray, id).toEqual([])
        }
    })

    // Professional print RIPs handle transparency badly, so every shape must be a solid color
    it('uses no transparency in any source SVG', () => {
        for (const [id, svg] of Object.entries(VECTOR_BG_IMAGE_SVGS)) {
            expect(svg.match(TRANSLUCENT_RE) ?? [], id).toEqual([])
            expect(svg, id).not.toMatch(/#[0-9a-f]{8}(?![0-9a-f])|rgba\(|hsla\(|transparent|<mask|mix-blend/i)
        }
    })

    it('replaces every placeholder, variants included, with a tone of the given palette', () => {
        const palette = ['#112233', '#445566', '#778899']
        const tones = [...palette.flatMap(slot_tones), ...FIXED_COLORS]
        for (const design of list_vector_backgrounds()) {
            for (const hex of painted_hexes(recolor_vector_svg(VECTOR_BG_IMAGE_SVGS[design.id], palette))) {
                expect(tones, design.id).toContain(hex.toLowerCase())
            }
        }
    })

    it('passes each base color through unchanged', () => {
        const palette = ['#AbCdEf', '#123456', '#654321']
        expect(slot_tones(palette[0])[0]).toBe('#AbCdEf')
    })
})

// Stored covers name superseded design versions by id, so those must keep rendering exactly as
// they shipped, while pickers offer only each design's newest version
describe('superseded vector backgrounds', () => {
    const listed = list_vector_backgrounds().map(d => d.id)
    const unlisted = Object.keys(VECTOR_BG_IMAGE_SVGS).filter(id => !listed.includes(id))
    const superseded = unlisted.filter(id => !RETIRED_VECTOR_BACKGROUNDS.includes(id))
    const base_name = (id:string) => id.replace(/-v\d+$/, '')

    it('keeps every retired design\'s file, so covers naming it still render', () => {
        for (const id of RETIRED_VECTOR_BACKGROUNDS) {
            expect(VECTOR_BG_IMAGE_SVGS, id).toHaveProperty(id)
            expect(listed, id).not.toContain(id)
        }
    })

    it('renames each retired design to one the picker offers', () => {
        for (const [old_id, new_id] of Object.entries(RENAMED_VECTOR_BACKGROUNDS)) {
            expect(listed, old_id).toContain(new_id)
        }
    })

    it('lists exactly one version of each design, its newest', () => {
        const version = (id:string) => Number(/-v(\d+)$/.exec(id)?.[1] ?? 1)
        expect(new Set(listed.map(base_name)).size).toBe(listed.length)
        for (const id of superseded) {
            const current = listed.find(c => base_name(c) === base_name(id))
            expect(current, id).toBeDefined()
            expect(version(current ?? id), id).toBeGreaterThan(version(id))
        }
    })

    it('still resolve by id, under the same display name as their newest version', () => {
        for (const id of superseded) {
            const design = find_vector_background(id)
            expect(recolor_vector_svg(VECTOR_BG_IMAGE_SVGS[id], ['#112233', '#445566', '#778899']), id)
                .toContain('#112233')
            expect(design?.name, id).toBe(list_vector_backgrounds().find(c => base_name(c.id) === base_name(id))?.name)
        }
    })

    it('are never edited, retired ones included (a deliberate change is a new version)', () => {
        const hashes = Object.fromEntries(unlisted
            .map(id => [id, createHash('sha256').update(VECTOR_BG_IMAGE_SVGS[id]).digest('hex').slice(0, 16)]))
        expect(hashes).toMatchSnapshot()
    })
})
