
// The package's subpath re-exports — the barrel deliberately leaves the SVG payloads out, so
// these two subpaths are the only way a consumer reaches them

import {describe, it, expect} from 'vitest'

import * as barrel from '../src/index.js'
import {PATTERN_SVGS, find_pattern_svg} from '../src/patterns_svg.js'
import {PRESET_ICON_SVGS, find_preset_icon_svg} from '../src/preset_icons_svg.js'


describe('subpath exports', () => {

    it('serves every listed pattern\'s SVG from patterns-svg', () => {
        for (const pattern of barrel.list_patterns())
            expect(find_pattern_svg(pattern.id), pattern.id).toMatch(/^<svg/)
        expect(Object.keys(PATTERN_SVGS).length).toBe(barrel.list_patterns().length)
    })

    it('serves a curated icon\'s SVG from preset-icons-svg', () => {
        const id = barrel.icon_categories[0]?.icons[0]
        expect(id).toBeDefined()
        expect(find_preset_icon_svg(id ?? '')).toMatch(/<svg/)
        expect(Object.keys(PRESET_ICON_SVGS).length).toBeGreaterThan(0)
    })

    it('keeps the SVG payloads off the barrel', () => {
        expect('PATTERN_SVGS' in barrel).toBe(false)
        expect('PRESET_ICON_SVGS' in barrel).toBe(false)
    })
})
