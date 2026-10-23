
import {describe, it, expect, vi, afterEach} from 'vitest'

import {list_vector_backgrounds, list_patterns, icon_categories, suggested_icons}
    from 'bookcover-web'

// Every module here reports load failures; standalone, so reports go nowhere
const self:Record<string, unknown> = {}
self['parent'] = self
vi.stubGlobal('window', self)

afterEach(() => {
    vi.doUnmock('bookcover-web')
    vi.doUnmock('bookcover-web/preset-icons-svg')
    vi.doUnmock('bookcover-web/patterns-svg')
    vi.restoreAllMocks()
})

/** Silence and record console.error, for the load-failure paths */
function quiet_errors(){
    return vi.spyOn(console, 'error').mockImplementation(() => {})
}


describe('icons', () => {

    it('knows every curated icon id without the SVG payload', async () => {
        vi.resetModules()
        const {is_preset_icon} = await import('../src/services/icons')
        for (const id of [...icon_categories.flatMap(c => c.icons), ...suggested_icons])
            expect(is_preset_icon(id)).toBe(true)
        expect(is_preset_icon('mdi:typed-by-a-user')).toBe(false)
    })

    it('loads the payload once, sharing concurrent loads', async () => {
        vi.resetModules()
        const {load_preset_icon_svgs, preset_icon_svgs} = await import('../src/services/icons')
        expect(preset_icon_svgs.value).toEqual({})
        const first = load_preset_icon_svgs()
        expect(load_preset_icon_svgs()).toBe(first)
        await first
        const id = suggested_icons[0] ?? ''
        expect(preset_icon_svgs.value[id]).toMatch(/^<svg/)
    })

    it('leaves swatches blank on a failed load, and retries next time', async () => {
        const error = quiet_errors()
        vi.resetModules()
        vi.doMock('bookcover-web/preset-icons-svg', () => { throw new Error('offline') })
        const {load_preset_icon_svgs, preset_icon_svgs} = await import('../src/services/icons')
        const failed = load_preset_icon_svgs()
        await failed
        expect(preset_icon_svgs.value).toEqual({})
        expect(error).toHaveBeenCalled()
        expect(load_preset_icon_svgs()).not.toBe(failed)
    })
})


describe('patterns', () => {

    it('lists the generator\'s patterns, with four preview ones for the trigger strip', async () => {
        vi.resetModules()
        const {PATTERNS, PREVIEW_PATTERNS, find_pattern} = await import('../src/services/patterns')
        expect(PATTERNS.map(p => p.id)).toEqual(list_patterns().map(p => p.id))
        expect(PREVIEW_PATTERNS.map(p => p.id))
            .toEqual(['boxes', 'brick-wall', 'bubbles', 'circuit-board'])
        expect(find_pattern('boxes')?.id).toBe('boxes')
        expect(find_pattern('no-such-pattern')).toBeUndefined()
    })

    it('renders swatches blank until the payload loads, then in the given fill', async () => {
        vi.resetModules()
        const {load_pattern_svgs, find_pattern, get_preview_url} =
            await import('../src/services/patterns')
        const boxes = find_pattern('boxes')
        expect(get_preview_url(boxes)).toBe('')
        expect(get_preview_url(undefined)).toBe('')
        await load_pattern_svgs()
        const url = get_preview_url(boxes, '#123456')
        expect(url).toMatch(/^url\('data:image\/svg\+xml,/)
        expect(decodeURIComponent(url)).toContain('#123456')
        expect(decodeURIComponent(url)).not.toContain('currentColor')
        // White when no fill is given
        expect(decodeURIComponent(get_preview_url(boxes))).toContain('#ffffff')
    })

    it('loads the payload once, and retries after a failure', async () => {
        const error = quiet_errors()
        vi.resetModules()
        vi.doMock('bookcover-web/patterns-svg', () => { throw new Error('offline') })
        const {load_pattern_svgs} = await import('../src/services/patterns')
        const failed = load_pattern_svgs()
        await failed
        expect(error).toHaveBeenCalled()
        expect(load_pattern_svgs()).not.toBe(failed)
    })

    it('sizes swatches from tile_mm, keeping the tile\'s aspect ratio', async () => {
        vi.resetModules()
        const {get_preview_size} = await import('../src/services/patterns')
        expect(get_preview_size(undefined)).toBe('80px 80px')
        expect(get_preview_size({id: 'x', name: 'X', tile_mm: 10, aspect_ratio: 2} as
            Parameters<typeof get_preview_size>[0])).toBe('20px 10px')
    })
})


describe('vector backgrounds', () => {

    it('offers every current design exactly once, hand-ordered ones first', async () => {
        vi.resetModules()
        const {VECTOR_BACKGROUNDS} = await import('../src/services/vector_backgrounds')
        const ids = VECTOR_BACKGROUNDS.map(v => v.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect([...ids].sort()).toEqual(list_vector_backgrounds().map(v => v.id).sort())
        expect(ids[0]).toBe('mountain-ridge-v2')
    })

    it('appends a design missing from the hand-written order', async () => {
        vi.resetModules()
        vi.doMock('bookcover-web', async original => {
            const real = await original<typeof import('bookcover-web')>()
            const extra = {...real.list_vector_backgrounds()[0], id: 'zz-brand-new'} as
                ReturnType<typeof real.list_vector_backgrounds>[0]
            return {...real, list_vector_backgrounds: () => [extra, ...real.list_vector_backgrounds()]}
        })
        const {VECTOR_BACKGROUNDS} = await import('../src/services/vector_backgrounds')
        expect(VECTOR_BACKGROUNDS.at(-1)?.id).toBe('zz-brand-new')
    })

    it('still finds a superseded design a stored cover names', async () => {
        vi.resetModules()
        const {VECTOR_BACKGROUNDS, find_vector_background} =
            await import('../src/services/vector_backgrounds')
        expect(VECTOR_BACKGROUNDS.some(v => v.id === 'mountain-ridge')).toBe(false)
        expect(find_vector_background('mountain-ridge')?.id).toBe('mountain-ridge')
        expect(find_vector_background('no-such-design')).toBeUndefined()
    })

    it('requests a thumbnail\'s SVG on first ask, then renders it recolored', async () => {
        vi.resetModules()
        const {find_vector_background, get_preview_url, load_design_svg} =
            await import('../src/services/vector_backgrounds')
        const design = find_vector_background('boat')
        expect(get_preview_url(undefined, '#336699')).toBe('')
        expect(get_preview_url(design, '#336699')).toBe('')
        // get_preview_url started the load; asking again shares it
        await load_design_svg('boat')
        const url = get_preview_url(design, '#336699')
        expect(url).toMatch(/^url\('data:image\/svg\+xml,/)
        // The placeholder slot colors are swapped for a real palette
        expect(decodeURIComponent(url).toLowerCase()).not.toContain('#6e79ac')
    })

    it('leaves a thumbnail blank on a failed load, and retries next time', async () => {
        const error = quiet_errors()
        vi.resetModules()
        const loader = vi.fn(async (_id:string):Promise<string | undefined> => {
            throw new Error('chunk failed')
        })
        vi.doMock('bookcover-web', async original => ({
            ...await original<typeof import('bookcover-web')>(),
            load_vector_background_svg: loader,
        }))
        const {load_design_svg, get_preview_url, find_vector_background} =
            await import('../src/services/vector_backgrounds')
        await load_design_svg('boat')
        expect(error).toHaveBeenCalled()
        expect(get_preview_url(find_vector_background('boat'), '#336699')).toBe('')
        await load_design_svg('boat')
        // The failed load wasn't cached, so the later asks fetched again
        expect(loader.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('shares one load per design', async () => {
        vi.resetModules()
        const loader = vi.fn(async (_id:string) => '<svg/>')
        vi.doMock('bookcover-web', async original => ({
            ...await original<typeof import('bookcover-web')>(),
            load_vector_background_svg: loader,
        }))
        const {load_design_svg} = await import('../src/services/vector_backgrounds')
        const first = load_design_svg('boat')
        expect(load_design_svg('boat')).toBe(first)
        await first
        await load_design_svg('boat')
        expect(loader).toHaveBeenCalledTimes(1)
    })
})
