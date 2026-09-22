
// Preset icon metadata (preset_icons.ts) and the SVG payload (preset_icons_svg.ts) are separate
// modules so importing the metadata doesn't drag the SVG payload in with it, and the payload
// itself is generated from generator/preset_icon_svgs/ by .bin/gen_preset_icons. That split
// means all three can drift — this holds them together.

import {describe, it, expect} from 'vitest'
import {icon_categories, suggested_icons} from '../src/preset_icons.js'
import {PRESET_ICON_SVGS, find_preset_icon_svg} from '../src/preset_icons_svg.js'

describe('preset icon metadata and SVG payload stay in sync', () => {

    it('ships at least one icon, and the same set on both sides of the split (excluding builtin:)', () => {
        const preset_ids = suggested_icons.filter(id => !id.startsWith('builtin:'))
        expect(preset_ids.length).toBeGreaterThan(0)
        expect(Object.keys(PRESET_ICON_SVGS).sort()).toEqual([...new Set(preset_ids)].sort())
    })

    it('resolves every non-builtin preset icon id to a usable, recolorable SVG', () => {
        for (const id of suggested_icons) {
            if (id.startsWith('builtin:')) continue
            const svg = find_preset_icon_svg(id)
            expect(svg, id).toBeTypeOf('string')
            expect(svg, id).toContain('<svg')
            expect(svg, id).toContain('currentColor')
        }
    })

    it('derives suggested_icons from icon_categories with no duplicates lost', () => {
        expect(suggested_icons).toEqual(icon_categories.flatMap(c => c.icons))
    })

    it('reports an id outside the curated set as undefined', () => {
        expect(find_preset_icon_svg('not-a-real:icon')).toBeUndefined()
    })

})
