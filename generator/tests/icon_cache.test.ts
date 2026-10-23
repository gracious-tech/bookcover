// resolve_icon() turns an icon id (or raw SVG) into a recolored SVG. Curated and builtin: ids
// must never reach the network; anything else is a live Iconify fetch, stubbed here. The SVG
// cache is module-level, so each test that fetches uses an id no other test touches.

import {describe, it, expect, vi, afterEach} from 'vitest'

import {resolve_icon, IconCacheError} from '../src/icon_cache.js'
import {find_builtin_icon} from '../src/builtin_icons.js'
import {suggested_icons} from '../src/preset_icons.js'
import {find_preset_icon_svg} from '../src/preset_icons_svg.js'

// An Iconify-style response, sized in em like the real API's
const ICONIFY_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">'
    + '<rect width="10" height="10" fill="currentColor"/></svg>'

/** Stub fetch with one canned response, returning the mock so tests can inspect its calls */
function stub_fetch(body:string, status = 200, status_text = 'OK') {
    const mock = vi.fn(async () => new Response(body, {status, statusText: status_text}))
    vi.stubGlobal('fetch', mock)
    return mock
}

/** Await a promise expected to reject with an IconCacheError and return that error */
async function icon_error(promise:Promise<unknown>):Promise<IconCacheError> {
    const error = await promise.then(() => null, (e:unknown) => e)
    expect(error).toBeInstanceOf(IconCacheError)
    return error as IconCacheError
}

afterEach(() => {
    vi.unstubAllGlobals()
})


describe('resolve_icon with raw SVG', () => {

    it('passes the SVG through, recoloring every currentColor', async () => {
        const svg = '  <svg><path fill="currentColor"/><path stroke="currentColor"/></svg>'
        const out = await resolve_icon(svg, '#ff0000')
        expect(out).toBe('  <svg><path fill="#ff0000"/><path stroke="#ff0000"/></svg>')
    })

    it('drops the "deg" unit from an hsl hue, which resvg cannot parse', async () => {
        const out = await resolve_icon('<svg fill="currentColor"/>', 'hsl(120deg, 50%, 50%)')
        expect(out).toBe('<svg fill="hsl(120, 50%, 50%)"/>')
    })
})


describe('resolve_icon with bundled ids', () => {

    it('resolves a builtin: id from the bundled set without fetching', async () => {
        const fetch_mock = stub_fetch('')
        const out = await resolve_icon('builtin:cross', '#123456')
        expect(fetch_mock).not.toHaveBeenCalled()
        expect(out).toBe(find_builtin_icon('cross')!.replace(/currentColor/g, '#123456'))
    })

    it('rejects an unknown builtin: id as not found', async () => {
        const error = await icon_error(resolve_icon('builtin:no-such-icon', '#000'))
        expect(error.code).toBe('icon_not_found')
        expect(error.params).toEqual({id: 'builtin:no-such-icon'})
    })

    it('resolves every curated preset id without touching the network', async () => {
        const fetch_mock = stub_fetch('')
        const preset_ids = suggested_icons.filter(id => !id.startsWith('builtin:'))
        for (const id of preset_ids) {
            const out = await resolve_icon(id, '#abcdef')
            expect(out, id).toBe(find_preset_icon_svg(id)!.replace(/currentColor/g, '#abcdef'))
        }
        expect(fetch_mock).not.toHaveBeenCalled()
    })
})


describe('resolve_icon with custom Iconify ids', () => {

    it('fetches from the Iconify API and strips the root tag\'s size only', async () => {
        const fetch_mock = stub_fetch(ICONIFY_SVG)
        const out = await resolve_icon('mdi:test-strip', '#00ff00')
        expect(fetch_mock).toHaveBeenCalledWith('https://api.iconify.design/mdi/test-strip.svg')
        // Root <svg> loses width/height; the inner <rect>'s own size is untouched
        expect(out).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">'
            + '<rect width="10" height="10" fill="#00ff00"/></svg>')
    })

    it('caches a fetched icon, recoloring the cached copy per call', async () => {
        const fetch_mock = stub_fetch(ICONIFY_SVG)
        const first = await resolve_icon('mdi:test-cache', '#111111')
        const second = await resolve_icon('mdi:test-cache', '#222222')
        expect(fetch_mock).toHaveBeenCalledTimes(1)
        expect(first).toContain('#111111')
        expect(second).toContain('#222222')
        expect(second).not.toContain('#111111')
    })

    it('reports a 404 as a missing icon', async () => {
        stub_fetch('Not found', 404, 'Not Found')
        const error = await icon_error(resolve_icon('mdi:test-missing', '#000'))
        expect(error.code).toBe('icon_not_found')
        expect(error.params).toEqual({id: 'mdi:test-missing'})
    })

    it('reports any other HTTP failure with its status', async () => {
        stub_fetch('Oops', 503, 'Service Unavailable')
        const error = await icon_error(resolve_icon('mdi:test-down', '#000'))
        expect(error.code).toBe('icon_fetch_failed')
        expect(error.params).toEqual(
            {id: 'mdi:test-down', status: 503, status_text: 'Service Unavailable'})
        expect(error.message).toContain('503')
    })

    it('does not cache a failed fetch', async () => {
        stub_fetch('Oops', 500, 'Server Error')
        await icon_error(resolve_icon('mdi:test-retry', '#000'))
        const fetch_mock = stub_fetch(ICONIFY_SVG)
        await expect(resolve_icon('mdi:test-retry', '#000')).resolves.toContain('<svg')
        expect(fetch_mock).toHaveBeenCalledTimes(1)
    })
})


describe('resolve_icon with malformed ids', () => {

    it('rejects an id with no collection prefix', async () => {
        for (const id of ['plainname', ':leading-colon']) {
            const error = await icon_error(resolve_icon(id, '#000'))
            expect(error.code, id).toBe('icon_invalid_format')
            expect(error.params, id).toEqual({id})
            expect(error.name).toBe('IconCacheError')
        }
    })
})
