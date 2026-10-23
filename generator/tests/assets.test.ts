// Asset path joining (shared by URLs and filesystem paths) and the bundled built-in icons

import {describe, it, expect} from 'vitest'
import {readdirSync} from 'node:fs'

import {asset_path, FRAMES_DIR, BACKGROUNDS_DIR} from '../src/assets.js'
import {find_builtin_icon, list_builtin_icons} from '../src/builtin_icons.js'

// The committed source SVGs the built-in icon set is generated from
const ICON_SOURCES = readdirSync(new URL('../icon_svgs/', import.meta.url))
    .filter(file => file.endsWith('.svg'))
    .map(file => file.slice(0, -'.svg'.length))


describe('asset_path', () => {

    it('joins segments onto a base with single slashes', () => {
        expect(asset_path('https://assets.example', BACKGROUNDS_DIR, 'beach.jpg'))
            .toBe('https://assets.example/backgrounds/beach.jpg')
    })

    it('drops any trailing slashes from the base', () => {
        expect(asset_path('/srv/assets///', FRAMES_DIR, 'torn.png')).toBe('/srv/assets/frames/torn.png')
    })

    it('returns the base alone when given no segments', () => {
        expect(asset_path('/srv/assets/')).toBe('/srv/assets')
    })

    it('names the published asset directories', () => {
        expect(FRAMES_DIR).toBe('frames')
        expect(BACKGROUNDS_DIR).toBe('backgrounds')
    })
})


describe('built-in icons', () => {

    it('lists one id per committed source SVG, sorted', () => {
        expect(list_builtin_icons()).toEqual([...ICON_SOURCES].sort())
    })

    it('returns each icon as recolorable SVG', () => {
        for (const id of list_builtin_icons()) {
            const svg = find_builtin_icon(id)
            expect(svg, id).toContain('<svg')
            expect(svg, id).toContain('currentColor')
        }
    })

    it('finds nothing for an unknown or prefixed id', () => {
        expect(find_builtin_icon('no-such-icon')).toBeUndefined()
        // Lookups take the bare id — the "builtin:" prefix is resolve_icon()'s business
        expect(find_builtin_icon('builtin:cross')).toBeUndefined()
    })
})
