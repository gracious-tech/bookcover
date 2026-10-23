
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {nextTick} from 'vue'

import {get_builtin_bg_regions} from 'bookcover-web'
import type {ImageRegions} from 'bookcover-web'

// assets.ts reads window.location in dev, which the node test environment doesn't have
vi.mock('../src/assets', () => ({assets_prefix: 'https://assets.test/'}))

// Pixel sampling is bookcover-web's concern (tested there) — here, only when and on what it runs.
// Each call answers with regions tagged by the file it sampled, after a test-controlled delay
const {analyze, delay} = vi.hoisted(() => {
    const delay = {ms: 0}
    const analyze = vi.fn(async (file:File, _dims:unknown) => {
        if (delay.ms) await new Promise(resolve => setTimeout(resolve, delay.ms))
        if (file.name === 'corrupt.jpg') throw new Error('decode failed')
        return {front_top: {sampled: file.name}} as unknown as ImageRegions
    })
    return {analyze, delay}
})
vi.mock('bookcover-web', async original => ({
    ...await original<typeof import('bookcover-web')>(),
    analyze_image_regions: analyze,
}))

// A built-in's preview copy, as fetched from the assets bucket
const fetch_mock = vi.fn(async (_url:string) => new Response(new Blob([new Uint8Array([1])],
    {type: 'image/jpeg'})))

/** Fresh copies of the cache and form factory (the cache is per page load) */
async function load(){
    vi.resetModules()
    const cache = await import('../src/image_regions_cache')
    const {make_blank_form} = await import('../src/form_state')
    return {...cache, make_blank_form}
}

/** Let Vue's watcher run, then the cache's 500ms debounce, then the (async) analysis */
async function settle(ms = 500):Promise<void> {
    await nextTick()
    await vi.advanceTimersByTimeAsync(ms)
    // The analysis itself resolves over a few more microtasks (the preview fetch included)
    await vi.advanceTimersByTimeAsync(0)
}

/** What a fake analysis of `name` resolves to */
function sampled(name:string):ImageRegions {
    return {front_top: {sampled: name}} as unknown as ImageRegions
}

beforeEach(() => {
    vi.useFakeTimers()
    delay.ms = 0
    analyze.mockClear()
    fetch_mock.mockClear()
    vi.stubGlobal('fetch', fetch_mock)
    // Standalone, so error reports go nowhere
    const self:Record<string, unknown> = {}
    self['parent'] = self
    vi.stubGlobal('window', self)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


describe('init_image_regions_cache', () => {

    it('is null with no background image', async () => {
        const {init_image_regions_cache, image_regions, make_blank_form} = await load()
        init_image_regions_cache(make_blank_form())
        await settle()
        expect(image_regions.value).toBeNull()
        expect(analyze).not.toHaveBeenCalled()
    })

    it('takes a baked built-in\'s regions straight away, without sampling', async () => {
        const {init_image_regions_cache, image_regions, make_blank_form} = await load()
        const form = make_blank_form()
        form.bg_image_builtin = 'beach.jpg'
        init_image_regions_cache(form)
        expect(image_regions.value).toEqual(get_builtin_bg_regions('beach.jpg'))
        await settle()
        expect(analyze).not.toHaveBeenCalled()
        expect(fetch_mock).not.toHaveBeenCalled()
    })

    it('samples an upload\'s own pixels, debounced, against the cover dimensions', async () => {
        const {init_image_regions_cache, image_regions, make_blank_form} = await load()
        const form = make_blank_form()
        init_image_regions_cache(form)
        const file = new File([new Uint8Array([1])], 'upload.jpg')
        form.bg_image = file
        await nextTick()
        await vi.advanceTimersByTimeAsync(499)
        expect(analyze).not.toHaveBeenCalled()
        await settle(1)
        expect(analyze).toHaveBeenCalledTimes(1)
        const [given, dims] = analyze.mock.calls[0] ?? []
        expect(given).toBe(file)
        expect(dims).toHaveProperty('cover_total_width')
        expect(image_regions.value).toEqual(sampled('upload.jpg'))
    })

    it('resamples when a dimension-affecting field changes, but not for coverage', async () => {
        const {init_image_regions_cache, make_blank_form} = await load()
        const form = make_blank_form()
        form.bg_image = new File([], 'upload.jpg')
        init_image_regions_cache(form)
        await settle()
        expect(analyze).toHaveBeenCalledTimes(1)
        form.bg_image_coverage = 'front'
        await settle()
        expect(analyze).toHaveBeenCalledTimes(1)
        form.page_count = form.page_count + 100
        await settle()
        expect(analyze).toHaveBeenCalledTimes(2)
    })

    it('still samples when the print dimensions can\'t be resolved yet', async () => {
        const {init_image_regions_cache, image_regions, make_blank_form} = await load()
        const form = make_blank_form()
        form.service_id = 'no_such_service'
        form.bg_image = new File([], 'upload.jpg')
        init_image_regions_cache(form)
        await settle()
        expect(analyze.mock.calls[0]?.[1]).toBeNull()
        expect(image_regions.value).toEqual(sampled('upload.jpg'))
    })

    it('lets a baked built-in supersede an upload still being analyzed', async () => {
        delay.ms = 1000
        const {init_image_regions_cache, image_regions, make_blank_form} = await load()
        const form = make_blank_form()
        form.bg_image = new File([], 'slow.jpg')
        init_image_regions_cache(form)
        await settle()
        expect(analyze).toHaveBeenCalledTimes(1)
        // Picked mid-analysis: the late upload result must not land on top
        form.bg_image = null
        form.bg_image_builtin = 'sea.jpg'
        await nextTick()
        expect(image_regions.value).toEqual(get_builtin_bg_regions('sea.jpg'))
        await vi.advanceTimersByTimeAsync(2000)
        expect(image_regions.value).toEqual(get_builtin_bg_regions('sea.jpg'))
    })

    it('keeps only the latest of overlapping analyses', async () => {
        delay.ms = 1000
        const {init_image_regions_cache, image_regions, make_blank_form} = await load()
        const form = make_blank_form()
        form.bg_image = new File([], 'first.jpg')
        init_image_regions_cache(form)
        await settle()
        form.bg_image = new File([], 'second.jpg')
        await settle()
        // First finishes while the second is still running, then the second
        await vi.advanceTimersByTimeAsync(500)
        expect(image_regions.value).toBeNull()
        await vi.advanceTimersByTimeAsync(1000)
        expect(image_regions.value).toEqual(sampled('second.jpg'))
    })

    it('clears the regions when the image is removed', async () => {
        const {init_image_regions_cache, image_regions, make_blank_form} = await load()
        const form = make_blank_form()
        form.bg_image = new File([], 'upload.jpg')
        init_image_regions_cache(form)
        await settle()
        expect(image_regions.value).not.toBeNull()
        form.bg_image = null
        await settle()
        expect(image_regions.value).toBeNull()
    })

    it('renders without auto colors when sampling fails, rather than stale ones', async () => {
        const {init_image_regions_cache, image_regions, make_blank_form} = await load()
        const form = make_blank_form()
        form.bg_image = new File([], 'upload.jpg')
        init_image_regions_cache(form)
        await settle()
        form.bg_image = new File([], 'corrupt.jpg')
        await settle()
        expect(image_regions.value).toBeNull()
        expect(console.error).toHaveBeenCalled()
    })

    it('samples the preview copy of a built-in missing from the baked table, with a warning',
        async () => {
            const {init_image_regions_cache, image_regions, make_blank_form} = await load()
            const form = make_blank_form()
            form.bg_image_builtin = 'not_baked.jpg'
            init_image_regions_cache(form)
            await settle()
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not_baked.jpg'))
            expect(fetch_mock.mock.calls[0]?.[0])
                .toMatch(/^https:\/\/assets\.test\/.*not_baked\.jpg$/)
            expect(image_regions.value).toEqual(sampled('not_baked.jpg'))
        })
})
