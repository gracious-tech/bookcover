// Built-in backgrounds are identified by filename alone — hosts store that ID, the widget holds it
// in place of any bytes, and renderers fetch a preview-sized copy by it. These hold the baked
// table, its lookups and the published preview copies together.

import {describe, it, expect} from 'vitest'
import {existsSync, readdirSync} from 'node:fs'
import {join, dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {get_builtin_bg, get_builtin_bg_regions, BG_PREVIEW_DIR} from '../src/image_regions.js'
import {BUILTIN_BG_REGIONS} from '../src/generated/builtin_bg_regions.js'

// The committed assets tree these IDs name
const assets_dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets')
const names = Object.keys(BUILTIN_BG_REGIONS)

describe('builtin background lookups', () => {

    it('finds regions by filename alone, whatever copy is being rendered', () => {
        expect(get_builtin_bg_regions('beach.jpg')).toBe(BUILTIN_BG_REGIONS['beach.jpg'].regions)
    })

    it('includes the full-wrap regions a wraparound preview needs', () => {
        const regions = get_builtin_bg_regions('beach.jpg')
        expect(regions?.front_top_full).not.toBeNull()
        expect(regions?.back).not.toBeNull()
        expect(regions?.spine).not.toBeNull()
    })

    it('returns null for names that are not builtins, including prototype keys', () => {
        expect(get_builtin_bg_regions('not_a_background.jpg')).toBeNull()
        expect(get_builtin_bg_regions('constructor')).toBeNull()
        expect(get_builtin_bg('__proto__')).toBeNull()
    })

    it("bakes each original's pixel size for resolution checks", () => {
        for (const name of names) {
            const entry = get_builtin_bg(name)
            expect(entry?.width, name).toBeGreaterThan(0)
            expect(entry?.height, name).toBeGreaterThan(0)
        }
    })
})

describe('published background copies', () => {

    it('has a preview-sized copy of every builtin under BG_PREVIEW_DIR', () => {
        for (const name of names)
            expect(existsSync(join(assets_dir, BG_PREVIEW_DIR, name)), name).toBe(true)
    })

    it('has no preview copy without a builtin behind it', () => {
        const previews = readdirSync(join(assets_dir, BG_PREVIEW_DIR))
        expect(previews.sort()).toEqual([...names].sort())
    })
})
