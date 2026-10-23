
// SVG size parsing and rasterisation. Rasterising goes through an <img>, faked here (see
// fake_gl.ts), so these check what gets loaded and that the blob URL is always released

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest'
import type {MockInstance} from 'vitest'

import {parse_svg_size, svg_to_bitmap} from '../src/svg.js'
import {FakeImage, make_create_image_bitmap} from './fake_gl.js'
import type {FakeBitmap} from './fake_gl.js'

// A cover face as typst.ts renders it: unitless width/height
const FACE_SVG = '<svg class="typst-doc" width="432.5" height="648" viewBox="0 0 432.5 648">'
    + '<rect width="10" height="10"/></svg>'

let create_object_url:MockInstance<typeof URL.createObjectURL>
let revoke_object_url:MockInstance<typeof URL.revokeObjectURL>

beforeEach(() => {
    FakeImage.instances.length = 0
    FakeImage.fail_next = false
    vi.stubGlobal('Image', FakeImage)
    vi.stubGlobal('createImageBitmap', make_create_image_bitmap())
    create_object_url = vi.spyOn(URL, 'createObjectURL')
    revoke_object_url = vi.spyOn(URL, 'revokeObjectURL')
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** The SVG text handed to the <img>, read back from the Blob the object URL was made for */
async function loaded_svg():Promise<string> {
    const blob = create_object_url.mock.calls[0]?.[0]
    if (!(blob instanceof Blob))
        throw new Error('no blob URL was created')
    expect(blob.type).toBe('image/svg+xml')
    return blob.text()
}


describe('parse_svg_size', () => {

    it('reads unitless dimensions (the web backend)', () => {
        expect(parse_svg_size(FACE_SVG)).toEqual({width: 432.5, height: 648})
    })

    it('reads pt dimensions (the node backend)', () => {
        expect(parse_svg_size('<svg width="12.25pt" height="648pt">')).toEqual(
            {width: 12.25, height: 648})
    })

    it('throws when either dimension is missing', () => {
        expect(() => parse_svg_size('<svg width="10">')).toThrow(/Could not parse SVG dimensions/)
        expect(() => parse_svg_size('<svg viewBox="0 0 1 1">')).toThrow(/Could not parse/)
    })

    it('rejects dimensions in other units rather than misreading them', () => {
        expect(() => parse_svg_size('<svg width="100%" height="100%">')).toThrow()
    })
})


describe('svg_to_bitmap', () => {

    it('rewrites the root element to the requested pixel size, rounded', async () => {
        await svg_to_bitmap(FACE_SVG, 1730.4, 2592.6)
        const svg = await loaded_svg()
        expect(svg).toMatch(/^<svg class="typst-doc" width="1730" height="2593" viewBox="0 0 432.5 648">/)
        // Only the root's attributes change — the inner rect keeps its own
        expect(svg).toContain('<rect width="10" height="10"/>')
    })

    it('never asks for less than 1px, so a zero-width spine still loads', async () => {
        await svg_to_bitmap(FACE_SVG, 0, 0.2)
        expect(await loaded_svg()).toContain('width="1" height="1"')
    })

    it('strips foreignObject elements, which image decoding never renders', async () => {
        const svg = FACE_SVG.replace('</svg>',
            '<foreignObject x="0"><div xmlns="http://www.w3.org/1999/xhtml">hi</div></foreignObject>'
            + '<foreignObject></foreignObject></svg>')
        await svg_to_bitmap(svg, 10, 10)
        const loaded = await loaded_svg()
        expect(loaded).not.toContain('foreignObject')
        expect(loaded).not.toContain('hi</div>')
    })

    it('waits for decode() before snapshotting, and snapshots the image', async () => {
        const bitmap = await svg_to_bitmap(FACE_SVG, 10, 10) as unknown as FakeBitmap
        const img = FakeImage.instances[0]
        expect(img.decode).toHaveBeenCalled()
        expect(bitmap.source).toBe(img)
    })

    it('revokes its blob URL once done', async () => {
        await svg_to_bitmap(FACE_SVG, 10, 10)
        const url = create_object_url.mock.results[0].value as string
        expect(FakeImage.instances[0].src).toBe(url)
        expect(revoke_object_url).toHaveBeenCalledWith(url)
    })

    it('rejects when the SVG fails to load, still revoking its URL', async () => {
        FakeImage.fail_next = true
        await expect(svg_to_bitmap(FACE_SVG, 10, 10)).rejects.toThrow(/SVG failed to load as image/)
        expect(revoke_object_url).toHaveBeenCalledWith(create_object_url.mock.results[0].value)
    })

    it('skips the WebKit settle delay outside WebKit, even with embedded images', async () => {
        // Node's navigator is not WebKit, so this resolves without timers running
        vi.useFakeTimers()
        try {
            const svg = FACE_SVG.replace('</svg>', '<image href="data:image/png;base64,AA"/></svg>')
            await expect(svg_to_bitmap(svg, 10, 10)).resolves.toBeDefined()
        }
        finally {
            vi.useRealTimers()
        }
    })
})


describe('svg_to_bitmap on WebKit', () => {

    /** Import a fresh copy of svg.ts with the given user agent, since it sniffs at load time */
    async function import_with_ua(user_agent:string, platform = 'iPhone', touch = 5):
        Promise<typeof import('../src/svg.js')> {
        vi.stubGlobal('navigator', {userAgent: user_agent, platform, maxTouchPoints: touch})
        vi.resetModules()
        return import('../src/svg.js')
    }

    // An SVG that embeds another document, which is what WebKit rasterises late
    const NESTED = FACE_SVG.replace('</svg>', '<image href="data:image/jpeg;base64,AA"/></svg>')

    /** Whether rasterising `svg` waits on a timer before snapshotting */
    async function waits_for_settle(module:typeof import('../src/svg.js'), svg:string):Promise<boolean> {
        vi.useFakeTimers()
        try {
            let done = false
            const pending = module.svg_to_bitmap(svg, 10, 10).then(() => { done = true })
            // Let the load/decode microtasks run without advancing time
            await vi.advanceTimersByTimeAsync(0)
            const waited = !done
            await vi.advanceTimersByTimeAsync(250)
            await pending
            return waited
        }
        finally {
            vi.useRealTimers()
        }
    }

    it('waits before snapshotting an SVG with embedded images on iOS', async () => {
        const module = await import_with_ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
        expect(await waits_for_settle(module, NESTED)).toBe(true)
    })

    it('treats a touch-capable "Macintosh" as iPadOS', async () => {
        const module = await import_with_ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
            + 'AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120', 'MacIntel', 5)
        expect(await waits_for_settle(module, NESTED)).toBe(true)
    })

    it('waits on desktop Safari too', async () => {
        const module = await import_with_ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
            + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 'MacIntel', 0)
        expect(await waits_for_settle(module, NESTED)).toBe(true)
    })

    it('does not wait for a plain SVG with nothing embedded', async () => {
        const module = await import_with_ua('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')
        expect(await waits_for_settle(module, FACE_SVG)).toBe(false)
    })

    it('does not wait on desktop Chrome, whose UA also says Safari', async () => {
        const module = await import_with_ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
            + 'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36', 'MacIntel', 0)
        expect(await waits_for_settle(module, NESTED)).toBe(false)
    })
})
