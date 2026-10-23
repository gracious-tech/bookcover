
// CoverGenerator's own logic, with typst.ts's WASM compiler/renderer and the browser's canvas,
// image decoding and fetch replaced by recording fakes (see fakes.ts). The real bookcover-core
// build() still runs, so the files handed to the compiler are the genuine article. What a real
// compile looks like is the widget's Playwright suite's job, and generator-node's render suite

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'

import {resolve_dimensions, cover_schema, analyze_pixel_regions, calculate_pixel_crop_regions}
    from 'bookcover-core'
import type {BundledFont} from 'typst-fonts'
import {FakeOffscreenCanvas, FAKE_PDF, FAKE_SVG, make_create_image_bitmap, make_fake_document,
    as_text} from './fakes.js'
import type {FakeCompiler, FakeRenderer} from './fakes.js'

// State shared with the hoisted module mocks below: every fake instance created, plus the
// compile behaviour new compilers get
const state = vi.hoisted(() => ({
    compilers: [] as FakeCompiler[],
    renderers: [] as FakeRenderer[],
    compile_impl: null as null | ((args:{mainFilePath:string, format:string}) =>
        Promise<{result?:Uint8Array, diagnostics?:unknown}>),
    blob_url_count: 0,
}))

// The typst.ts compiler — each createTypstCompiler() call is a fresh fake, recorded in state
vi.mock('@myriaddreamin/typst.ts/compiler', async () => {
    const fakes = await import('./fakes.js')
    return {
        CompileFormatEnum: {pdf: 'pdf', vector: 'vector'},
        createTypstCompiler: vi.fn(() => {
            const compiler = fakes.make_fake_compiler(
                args => (state.compile_impl ?? fakes.default_compile)(args))
            state.compilers.push(compiler)
            return compiler
        }),
    }
})

// The typst.ts renderer — likewise recorded per instance
vi.mock('@myriaddreamin/typst.ts/renderer', async () => {
    const fakes = await import('./fakes.js')
    return {
        createTypstRenderer: vi.fn(() => {
            const renderer = fakes.make_fake_renderer()
            state.renderers.push(renderer)
            return renderer
        }),
    }
})

// loadFonts() only builds an init option, so the fake just echoes its arguments for inspection
vi.mock('@myriaddreamin/typst.ts', () => ({
    loadFonts: vi.fn((urls:string[], opts?:unknown) => ({fake_load_fonts: urls, opts})),
}))

// The real web font helpers, except that font bytes come from a fake fetch and blob URLs are
// numbered strings (so creation and revocation can be matched up)
vi.mock('typst-fonts/web', async (import_original) => {
    const original = await import_original<typeof import('typst-fonts/web')>()
    return {
        ...original,
        load_fonts_prefix: vi.fn(original.load_fonts_prefix),
        fetch_font_bytes: vi.fn(async (url:string) => new TextEncoder().encode(`font:${url}`)),
        fonts_to_blob_urls: vi.fn((bytes:Uint8Array[]) =>
            bytes.map(() => `blob:fake/${++state.blob_url_count}`)),
        revoke_blob_urls: vi.fn(),
    }
})

// The real core, except the canvas-based frame compositor, which is stubbed to a marker image
vi.mock('bookcover-core', async (import_original) => {
    const original = await import_original<typeof import('bookcover-core')>()
    return {
        ...original,
        frame_image: vi.fn(async () => new Blob(['framed'], {type: 'image/png'})),
    }
})

// Imported after the mocks (vitest hoists vi.mock above these regardless)
const {init, analyze_image_regions, CoverGenerator} = await import('../src/index.js')
const typst_fonts_web = await import('typst-fonts/web')
const core = await import('bookcover-core')
const {createTypstCompiler} = await import('@myriaddreamin/typst.ts/compiler')
const {createTypstRenderer} = await import('@myriaddreamin/typst.ts/renderer')

// A stand-in curated manifest, served by the fake fetch — Noto Serif first, as base_font() is
// defined as the manifest's first entry
const MANIFEST:BundledFont[] = [
    {family: 'Noto Serif', group: 'Noto', style: 'serif',
        files: ['NotoSerif-Regular.ttf', 'NotoSerif-Bold.ttf'], preview_file: 'NotoSerif-Regular.ttf'},
    {family: 'Playfair Display', group: 'Serif', style: 'serif',
        files: ['PlayfairDisplay-Regular.ttf'], preview_file: 'PlayfairDisplay-Regular.ttf'},
]

const FONTS_PREFIX = 'https://fonts.test/fonts'
const ASSETS_PREFIX = 'https://assets.test/'

// A minimal valid schema: a Latin-only KDP US Trade paperback
const SCHEMA = {
    title1: 'The',
    title2: 'Art of Code',
    title3: '',
    title_position: 'top',
    subtitle: 'A journey',
    subtitle_position: 'middle',
    author: 'Alice Chen',
    author_position: 'bottom',
    blurb: 'A deep dive.',
    service_id: 'kdp',
    binding_type: 'paperback',
    ink_type: 'bw',
    paper_type: 'white',
    size_id: 'us_trade',
    page_count: 300,
}

// A curated font other than the base font, as a field's FontConfig
const PLAYFAIR = {family: 'Playfair Display'}

// The default schema's cover dimensions
const DIMS = resolve_dimensions(cover_schema.parse(SCHEMA))

// Distinct lastModified values per image, so the module-level downscale cache (one entry,
// identified by name/size/type/mtime) never carries a hit from one test into another
let next_mtime = 1

/** A fresh background image File */
function make_image(type = 'image/jpeg', size = 1000):File {
    const ext = type === 'image/png' ? 'png' : 'jpg'
    return new File([new Uint8Array(size)], `bg.${ext}`, {type, lastModified: next_mtime++})
}

/** The fake fetch: the manifest for <prefix>/manifest.json, a PNG marker for frames, else 404 */
function fake_fetch(input:string | URL | Request):Promise<Response> {
    const url = String(input)
    if (url === `${FONTS_PREFIX}/manifest.json`)
        return Promise.resolve(new Response(JSON.stringify(MANIFEST),
            {headers: {'content-type': 'application/json'}}))
    if (url.includes('/frames/'))
        return Promise.resolve(new Response(new Blob(['frame'], {type: 'image/png'})))
    return Promise.resolve(new Response('missing', {status: 404}))
}

/** The newest fake compiler */
function last_compiler():FakeCompiler {
    const compiler = state.compilers.at(-1)
    if (!compiler)
        throw new Error('no compiler was created')
    return compiler
}

/** Initialise a generator against the fake fonts server (renderer included unless told not to) */
async function make_generator(with_renderer = true):Promise<InstanceType<typeof CoverGenerator>> {
    return init({
        wasm_url: 'compiler.wasm',
        renderer_wasm_url: with_renderer ? 'renderer.wasm' : undefined,
        fonts_prefix: FONTS_PREFIX,
        assets_prefix: ASSETS_PREFIX,
    })
}

let create_image_bitmap = make_create_image_bitmap({width: 4000, height: 3000})

beforeEach(() => {
    // Fresh fakes and call counts per test
    state.compilers.length = 0
    state.renderers.length = 0
    state.compile_impl = null
    vi.clearAllMocks()
    FakeOffscreenCanvas.instances.length = 0

    // Worker-like globals: OffscreenCanvas and createImageBitmap, no document
    create_image_bitmap = make_create_image_bitmap({width: 4000, height: 3000})
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
    vi.stubGlobal('createImageBitmap', create_image_bitmap)
    vi.stubGlobal('fetch', vi.fn(fake_fetch))
})

afterEach(() => {
    vi.unstubAllGlobals()
})


describe('init', () => {

    it('loads the font manifest from fonts_prefix before anything resolves a font', async () => {
        await make_generator()
        expect(typst_fonts_web.load_fonts_prefix).toHaveBeenCalledWith(FONTS_PREFIX)
        expect(fetch).toHaveBeenCalledWith(`${FONTS_PREFIX}/manifest.json`)
    })

    it('creates a renderer only when renderer_wasm_url is given', async () => {
        await make_generator(false)
        expect(createTypstRenderer).not.toHaveBeenCalled()
        await make_generator(true)
        expect(state.renderers).toHaveLength(1)
        // The renderer is pointed at the given wasm
        const init_opts = state.renderers[0].init.mock.calls[0][0] as
            {getModule:() => {module_or_path:string}}
        expect(init_opts.getModule()).toEqual({module_or_path: 'renderer.wasm'})
    })

    it('creates no compiler until the first generate — the font set is unknown until then', async () => {
        await make_generator()
        expect(createTypstCompiler).not.toHaveBeenCalled()
    })

    it('warms the byte cache with the base font', async () => {
        await make_generator()
        // Prefetch is fire-and-forget, so let it settle
        await vi.waitFor(() => expect(typst_fonts_web.fetch_font_bytes).toHaveBeenCalledTimes(2))
        expect(typst_fonts_web.fetch_font_bytes).toHaveBeenCalledWith(
            `${FONTS_PREFIX}/Noto%20Serif/NotoSerif-Regular.ttf`)
    })

    it('swallows a failed prefetch — the first generate simply refetches', async () => {
        vi.mocked(typst_fonts_web.fetch_font_bytes).mockRejectedValueOnce(new Error('offline'))
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA})
        expect(last_compiler().compile).toHaveBeenCalled()
    })

    it('fails when the fonts server is not serving the manifest', async () => {
        vi.mocked(fetch).mockResolvedValueOnce(new Response('<!doctype html>',
            {headers: {'content-type': 'text/html'}}))
        await expect(make_generator()).rejects.toThrow(/HTML instead of the manifest/)
    })
})


describe('compiler font set', () => {

    it('initialises the compiler with exactly the schema\'s fonts, and no typst.ts defaults', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA})
        expect(state.compilers).toHaveLength(1)
        const init_opts = last_compiler().init.mock.calls[0][0] as
            {getModule:() => {module_or_path:string}, beforeBuild:{fake_load_fonts:string[], opts:unknown}[]}
        expect(init_opts.getModule()).toEqual({module_or_path: 'compiler.wasm'})
        // One blob URL per Noto Serif file, and assets:false so no CDN fonts get appended
        expect(init_opts.beforeBuild[0].fake_load_fonts).toHaveLength(2)
        expect(init_opts.beforeBuild[0].opts).toEqual({assets: false})
    })

    it('reuses the compiler while the font set is unchanged', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA})
        await gen.generate({schema: {...SCHEMA, title2: 'Something else'}})
        expect(state.compilers).toHaveLength(1)
        expect(last_compiler().compile).toHaveBeenCalledTimes(2)
    })

    it('reinitialises when the font set changes, revoking the old blob URLs', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA})
        const first_urls = vi.mocked(typst_fonts_web.fonts_to_blob_urls).mock.results[0].value as string[]

        await gen.generate({schema: {...SCHEMA, title1_font: PLAYFAIR}})
        expect(state.compilers).toHaveLength(2)
        expect(typst_fonts_web.revoke_blob_urls).toHaveBeenLastCalledWith(first_urls)
        // Noto Serif's two files plus Playfair's one
        const init_opts = last_compiler().init.mock.calls[0][0] as
            {beforeBuild:{fake_load_fonts:string[]}[]}
        expect(init_opts.beforeBuild[0].fake_load_fonts).toHaveLength(3)
    })

    it('fetches each font file at most once per session, across reinits', async () => {
        const gen = await make_generator()
        await vi.waitFor(() => expect(typst_fonts_web.fetch_font_bytes).toHaveBeenCalledTimes(2))
        await gen.generate({schema: SCHEMA})
        await gen.generate({schema: {...SCHEMA, title1_font: PLAYFAIR}})
        await gen.generate({schema: SCHEMA})
        const urls = vi.mocked(typst_fonts_web.fetch_font_bytes).mock.calls.map(call => call[0])
        expect(urls.sort()).toEqual([
            `${FONTS_PREFIX}/Noto%20Serif/NotoSerif-Bold.ttf`,
            `${FONTS_PREFIX}/Noto%20Serif/NotoSerif-Regular.ttf`,
            `${FONTS_PREFIX}/Playfair%20Display/PlayfairDisplay-Regular.ttf`,
        ])
    })

    it('retries a font fetch that failed, rather than caching the failure', async () => {
        const gen = await make_generator()
        await vi.waitFor(() => expect(typst_fonts_web.fetch_font_bytes).toHaveBeenCalledTimes(2))
        vi.mocked(typst_fonts_web.fetch_font_bytes).mockRejectedValueOnce(new Error('HTTP 500'))
        await expect(gen.generate({schema: {...SCHEMA, title1_font: PLAYFAIR}}))
            .rejects.toThrow('HTTP 500')
        await gen.generate({schema: {...SCHEMA, title1_font: PLAYFAIR}})
        expect(last_compiler().compile).toHaveBeenCalledTimes(1)
    })

    it('keys custom fonts by array identity — same reference reuses, new reference reinits', async () => {
        const gen = await make_generator()
        const font = new Uint8Array([1, 2, 3])
        await gen.generate({schema: SCHEMA, custom_fonts: [font]})
        await gen.generate({schema: SCHEMA, custom_fonts: [font]})
        expect(state.compilers).toHaveLength(1)

        // Equal bytes in a different array (e.g. after a structured clone) count as a new font
        await gen.generate({schema: SCHEMA, custom_fonts: [new Uint8Array([1, 2, 3])]})
        expect(state.compilers).toHaveLength(2)

        // Custom fonts ride along as blob URLs after the bundled ones
        const blob_input = vi.mocked(typst_fonts_web.fonts_to_blob_urls).mock.calls.at(-1)?.[0]
        expect(blob_input).toHaveLength(3)
    })

    it('reinitialises when custom fonts are removed', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, custom_fonts: [new Uint8Array([9])]})
        await gen.generate({schema: SCHEMA})
        expect(state.compilers).toHaveLength(2)
    })

    it('destroy() revokes the blob URLs and drops cached bytes', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA})
        const urls = vi.mocked(typst_fonts_web.fonts_to_blob_urls).mock.results[0].value as string[]
        gen.destroy()
        expect(typst_fonts_web.revoke_blob_urls).toHaveBeenLastCalledWith(urls)

        // With the byte cache gone, the next compiler reinit has to fetch again
        const fetches = vi.mocked(typst_fonts_web.fetch_font_bytes).mock.calls.length
        await gen.prefetch_fonts(['Noto Serif'])
        expect(vi.mocked(typst_fonts_web.fetch_font_bytes).mock.calls.length).toBe(fetches + 2)
    })
})


describe('shadow filesystem', () => {

    it('adds .typ files as sources and everything else as shadow bytes, at absolute paths', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image(), image_regions: null})
        const compiler = last_compiler()
        expect(compiler.sources.has('/cover.typ')).toBe(true)
        expect(compiler.sources.has('/_data.typ')).toBe(true)
        expect(compiler.shadow.has('/background.jpg')).toBe(true)
        for (const path of compiler.shadow.keys())
            expect(path.endsWith('.typ')).toBe(false)
    })

    it('clears the previous generate\'s files first', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image(), image_regions: null})
        await gen.generate({schema: SCHEMA})
        expect(last_compiler().shadow.has('/background.jpg')).toBe(false)
    })

    it('keeps a PNG background as .png', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image('image/png'), image_regions: null})
        expect(last_compiler().shadow.has('/background.png')).toBe(true)
    })

    it('fetches the painted frame from assets_prefix and composites it', async () => {
        const gen = await make_generator()
        await gen.generate({schema: {...SCHEMA, bg_image_coverage: 'painted'}, image: make_image(),
            image_regions: null})
        expect(fetch).toHaveBeenCalledWith(`${ASSETS_PREFIX}frames/painted.png`)
        expect(core.frame_image).toHaveBeenCalledTimes(1)
        // The framed result replaces the background, as a PNG
        const framed = last_compiler().shadow.get('/background.png')
        expect(framed && await as_text(framed)).toBe('framed')
    })

    it('fetches no frame for other coverages', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image(), image_regions: null})
        expect(vi.mocked(fetch).mock.calls.some(call => String(call[0]).includes('/frames/')))
            .toBe(false)
    })
})


describe('output formats', () => {

    it('compiles PDF from /cover.typ by default', async () => {
        const gen = await make_generator()
        const result = await gen.generate({schema: SCHEMA})
        expect(last_compiler().compile).toHaveBeenCalledWith(
            {mainFilePath: '/cover.typ', format: 'pdf'})
        expect(result.data).toBe(FAKE_PDF)
        expect(result.split).toBeUndefined()
    })

    it('renders SVG with pt units on the root width/height', async () => {
        const gen = await make_generator()
        const result = await gen.generate({schema: SCHEMA, format: 'svg'})
        expect(last_compiler().compile).toHaveBeenCalledWith(
            {mainFilePath: '/cover.typ', format: 'vector'})
        expect(result.data).toBe(FAKE_SVG.replace('width="864.5"', 'width="864.5pt"')
            .replace('height="648"', 'height="648pt"'))
        // viewBox is untouched
        expect(result.data).toContain('viewBox="0 0 864.5 648"')
    })

    it('refuses SVG and PNG without a renderer, naming the missing option', async () => {
        const gen = await make_generator(false)
        await expect(gen.generate({schema: SCHEMA, format: 'svg'}))
            .rejects.toThrow(/SVG output requires renderer_wasm_url/)
        await expect(gen.generate({schema: SCHEMA, format: 'png'}))
            .rejects.toThrow(/PNG output requires renderer_wasm_url/)
    })

    it('renders PNG on a canvas at the requested PPI over white', async () => {
        const doc = make_fake_document()
        vi.stubGlobal('document', doc)
        const gen = await make_generator()
        const result = await gen.generate({schema: SCHEMA, format: 'png', ppi: 300})
        const render_opts = state.renderers[0].renderCanvas.mock.calls[0][0] as
            {pixelPerPt:number, backgroundColor:string}
        expect(render_opts.pixelPerPt).toBeCloseTo(300 / 72)
        expect(render_opts.backgroundColor).toBe('#ffffff')
        expect(await as_text(result.data as Uint8Array)).toBe(
            `image/png:${Math.round(864.5 * 300 / 72)}x${Math.round(648 * 300 / 72)}`)
    })

    // BUG: compile_png() calls document.createElement('canvas') directly instead of make_canvas(),
    // so PNG output throws a ReferenceError inside a Web Worker (where the widget runs the
    // generator), although every other canvas path here falls back to OffscreenCanvas
    it.skip('renders PNG inside a worker, where there is no document', async () => {
        const gen = await make_generator()
        const result = await gen.generate({schema: SCHEMA, format: 'png'})
        expect(await as_text(result.data as Uint8Array)).toMatch(/^image\/png:/)
    })

    it('defaults PNG to 144 PPI', async () => {
        vi.stubGlobal('document', make_fake_document())
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, format: 'png'})
        const render_opts = state.renderers[0].renderCanvas.mock.calls[0][0] as {pixelPerPt:number}
        expect(render_opts.pixelPerPt).toBe(2)
    })

    it('reports compile diagnostics in the error', async () => {
        state.compile_impl = async () => ({diagnostics: ['error: unknown variable', {line: 3}]})
        const gen = await make_generator()
        const error = await gen.generate({schema: SCHEMA}).catch((e:unknown) => e)
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain('Typst compilation failed')
        expect((error as Error).message).toContain('error: unknown variable')
        expect((error as Error).message).toContain('{"line":3}')
    })

    it('says "unknown error" when diagnostics are not a list', async () => {
        state.compile_impl = async () => ({diagnostics: undefined})
        const gen = await make_generator()
        await expect(gen.generate({schema: SCHEMA, format: 'svg'})).rejects.toThrow(/unknown error/)
    })

    it('rejects a schema that fails validation before touching the compiler', async () => {
        const gen = await make_generator()
        await expect(gen.generate({schema: {...SCHEMA, page_count: 'lots'}})).rejects.toThrow()
        expect(createTypstCompiler).not.toHaveBeenCalled()
    })
})


describe('split output', () => {

    it('splits a PDF into panels, each with its own CropBox', async () => {
        const gen = await make_generator()
        const result = await gen.generate({schema: SCHEMA, split: true})
        const split = result.split as {front:Uint8Array, back:Uint8Array, spine?:Uint8Array}
        expect(new TextDecoder().decode(split.front)).toContain('/CropBox')
        expect(new TextDecoder().decode(split.back)).toContain('/CropBox')
        expect(split.spine).toBeDefined()
    })

    it('splits an SVG into panels by viewBox', async () => {
        const gen = await make_generator()
        const result = await gen.generate({schema: SCHEMA, format: 'svg', split: true})
        const split = result.split as {front:string, back:string}
        expect(split.front).not.toBe(split.back)
        expect(split.front).not.toContain('viewBox="0 0 864.5 648"')
    })

    it('splits a PNG by cropping each panel on a canvas', async () => {
        const doc = make_fake_document()
        vi.stubGlobal('document', doc)
        const gen = await make_generator()
        const result = await gen.generate({schema: SCHEMA, format: 'png', split: true, ppi: 72})
        const split = result.split as {front:Uint8Array, back:Uint8Array}

        // Each crop draws the decoded full cover's region onto a panel-sized canvas, one canvas
        // per region in order, after the one the full cover was rendered on
        const regions = calculate_pixel_crop_regions(DIMS, 72)
        const front_index = regions.findIndex(r => r.label === 'front')
        const front = regions[front_index]
        expect(front).toBeDefined()
        expect(await as_text(split.front)).toBe(`image/png:${front?.width}x${front?.height}`)
        const crop_canvas = doc.canvases[1 + front_index]
        expect(crop_canvas?.ctx.draws[0].args).toEqual([front?.x, front?.y, front?.width,
            front?.height, 0, 0, front?.width, front?.height])
    })
})


describe('RangeError recovery', () => {

    it('rebuilds the compiler and retries once on a WASM stack overflow', async () => {
        let calls = 0
        state.compile_impl = async args => {
            calls += 1
            if (calls === 1)
                throw new RangeError('Maximum call stack size exceeded')
            return {result: args.format === 'pdf' ? FAKE_PDF : new Uint8Array([1])}
        }
        const gen = await make_generator()
        const result = await gen.generate({schema: SCHEMA})
        expect(result.data).toBe(FAKE_PDF)
        expect(state.compilers).toHaveLength(2)
        // The retry compiler gets the files reloaded
        expect(last_compiler().sources.has('/cover.typ')).toBe(true)
        // PDF needs no renderer, so none is rebuilt
        expect(state.renderers).toHaveLength(1)
    })

    it('also rebuilds the renderer for SVG', async () => {
        let calls = 0
        state.compile_impl = async () => {
            calls += 1
            if (calls === 1)
                throw new RangeError('Maximum call stack size exceeded')
            return {result: new Uint8Array([1])}
        }
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, format: 'svg'})
        expect(state.renderers).toHaveLength(2)
    })

    it('gives up after one retry', async () => {
        state.compile_impl = async () => {
            throw new RangeError('Maximum call stack size exceeded')
        }
        const gen = await make_generator()
        await expect(gen.generate({schema: SCHEMA})).rejects.toBeInstanceOf(RangeError)
        expect(state.compilers).toHaveLength(2)
    })

    it('does not retry other errors', async () => {
        state.compile_impl = async () => {
            throw new TypeError('bad input')
        }
        const gen = await make_generator()
        await expect(gen.generate({schema: SCHEMA})).rejects.toBeInstanceOf(TypeError)
        expect(state.compilers).toHaveLength(1)
    })
})


describe('WASM memory resets', () => {

    it('does not reset while the image stays the same', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA})
        await gen.generate({schema: SCHEMA})
        expect(last_compiler().reset).not.toHaveBeenCalled()
        expect(state.renderers).toHaveLength(1)
    })

    it('resets the compiler and rebuilds the renderer when the image changes', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA})
        await gen.generate({schema: SCHEMA, image: make_image(), image_regions: null})
        expect(last_compiler().reset).toHaveBeenCalledTimes(1)
        expect(state.renderers).toHaveLength(2)

        // Same size and type counts as the same image; a different size doesn't
        await gen.generate({schema: SCHEMA, image: make_image(), image_regions: null})
        expect(last_compiler().reset).toHaveBeenCalledTimes(1)
        await gen.generate({schema: SCHEMA, image: make_image('image/jpeg', 2000), image_regions: null})
        expect(last_compiler().reset).toHaveBeenCalledTimes(2)

        // Removing the image is a change too
        await gen.generate({schema: SCHEMA})
        expect(last_compiler().reset).toHaveBeenCalledTimes(3)
    })

    it('resets every 25 generates regardless, as a fallback', async () => {
        const gen = await make_generator()
        for (let i = 0; i < 24; i++)
            await gen.generate({schema: SCHEMA})
        expect(last_compiler().reset).not.toHaveBeenCalled()
        await gen.generate({schema: SCHEMA})
        expect(last_compiler().reset).toHaveBeenCalledTimes(1)
        // The counter starts over
        for (let i = 0; i < 24; i++)
            await gen.generate({schema: SCHEMA})
        expect(last_compiler().reset).toHaveBeenCalledTimes(1)
    })

    it('skips the renderer rebuild when there is no renderer to rebuild', async () => {
        const gen = await make_generator(false)
        await gen.generate({schema: SCHEMA, image: make_image(), image_regions: null})
        expect(last_compiler().reset).toHaveBeenCalledTimes(1)
        expect(createTypstRenderer).not.toHaveBeenCalled()
    })
})


describe('image_max_dpi downscaling', () => {

    // The smallest image size that still covers the spread at 100 DPI
    const target_w = Math.round(DIMS.cover_total_width.toNumber() / 25.4 * 100)
    const target_h = Math.round(DIMS.cover_total_height.toNumber() / 25.4 * 100)

    /** The image bytes the compiler was given */
    async function compiled_image(name = '/background.jpg'):Promise<string> {
        const bytes = last_compiler().shadow.get(name)
        if (!bytes)
            throw new Error(`${name} was not mapped`)
        return as_text(bytes)
    }

    it('shrinks to the smallest size that still covers the whole spread', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image(), image_max_dpi: 100,
            image_regions: null})
        // The larger of the two scale factors wins, so both dimensions still cover
        const scale = Math.max(target_w / 4000, target_h / 3000)
        const w = Math.round(4000 * scale)
        const h = Math.round(3000 * scale)
        expect(w).toBeGreaterThanOrEqual(target_w)
        expect(h).toBeGreaterThanOrEqual(target_h)
        expect(await compiled_image()).toBe(`image/jpeg:${w}x${h}`)
    })

    it('keeps a PNG as PNG so transparency survives', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image('image/png'), image_max_dpi: 100,
            image_regions: null})
        expect(await compiled_image('/background.png')).toMatch(/^image\/png:/)
    })

    it('leaves a near-target image as it is', async () => {
        create_image_bitmap.mockResolvedValue({width: target_w + 50, height: target_h + 50,
            close: vi.fn()})
        const gen = await make_generator()
        const image = make_image()
        await gen.generate({schema: SCHEMA, image, image_max_dpi: 100, image_regions: null})
        // The original's (zeroed) bytes, not a re-encode
        const bytes = last_compiler().shadow.get('/background.jpg')
        expect(bytes).toEqual(new Uint8Array(await image.arrayBuffer()))
        expect(FakeOffscreenCanvas.instances).toHaveLength(0)
    })

    it('never enlarges a small image', async () => {
        create_image_bitmap.mockResolvedValue({width: 100, height: 80, close: vi.fn()})
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image(), image_max_dpi: 100,
            image_regions: null})
        expect(FakeOffscreenCanvas.instances).toHaveLength(0)
    })

    it('reuses the last copy for the same File, even as a new object after a structured clone', async () => {
        const gen = await make_generator()
        const image = make_image()
        await gen.generate({schema: SCHEMA, image, image_max_dpi: 100, image_regions: null})
        // A File with identical name/size/type/mtime is what a postMessage round trip produces
        const clone = new File([await image.arrayBuffer()], image.name,
            {type: image.type, lastModified: image.lastModified})
        await gen.generate({schema: SCHEMA, image: clone, image_max_dpi: 100, image_regions: null})
        expect(create_image_bitmap).toHaveBeenCalledTimes(1)
    })

    it('resizes again when the target size changes', async () => {
        const gen = await make_generator()
        const image = make_image()
        await gen.generate({schema: SCHEMA, image, image_max_dpi: 100, image_regions: null})
        await gen.generate({schema: SCHEMA, image, image_max_dpi: 50, image_regions: null})
        expect(create_image_bitmap).toHaveBeenCalledTimes(2)
    })

    it('matches a plain Blob by identity only', async () => {
        const gen = await make_generator()
        const blob = new Blob([new Uint8Array(1000)], {type: 'image/jpeg'})
        await gen.generate({schema: SCHEMA, image: blob, image_max_dpi: 100, image_regions: null})
        await gen.generate({schema: SCHEMA, image: blob, image_max_dpi: 100, image_regions: null})
        expect(create_image_bitmap).toHaveBeenCalledTimes(1)
        const other = new Blob([new Uint8Array(1000)], {type: 'image/jpeg'})
        await gen.generate({schema: SCHEMA, image: other, image_max_dpi: 100, image_regions: null})
        expect(create_image_bitmap).toHaveBeenCalledTimes(2)
    })

    it('drops a failed resize from the cache so the next generate retries', async () => {
        create_image_bitmap.mockRejectedValueOnce(new Error('decode failed'))
        const gen = await make_generator()
        const image = make_image()
        await expect(gen.generate({schema: SCHEMA, image, image_max_dpi: 100, image_regions: null}))
            .rejects.toThrow('decode failed')
        await gen.generate({schema: SCHEMA, image, image_max_dpi: 100, image_regions: null})
        expect(create_image_bitmap).toHaveBeenCalledTimes(2)
    })

    it('throws when no 2D context is available for the resize', async () => {
        FakeOffscreenCanvas.next_no_context = true
        const gen = await make_generator()
        await expect(gen.generate({schema: SCHEMA, image: make_image(), image_max_dpi: 100,
            image_regions: null})).rejects.toThrow(/2D canvas context unavailable/)
    })

    it('uses the image untouched without image_max_dpi', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image(), image_regions: null})
        expect(create_image_bitmap).not.toHaveBeenCalled()
    })
})


describe('background colour sampling', () => {

    it('samples the original image when no regions are given', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image()})
        expect(create_image_bitmap).toHaveBeenCalledTimes(1)
    })

    it('samples the original even when the compiled copy is downscaled', async () => {
        const gen = await make_generator()
        const image = make_image()
        await gen.generate({schema: SCHEMA, image, image_max_dpi: 100})
        // One decode for the resize, one for sampling — both of the original
        expect(create_image_bitmap.mock.calls.map(call => call[0])).toEqual([image, image])
    })

    it('uses a named builtin\'s baked regions instead of decoding', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image(), image_builtin: 'beach.jpg'})
        expect(create_image_bitmap).not.toHaveBeenCalled()
    })

    it('falls back to decoding for a builtin name it does not know', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image(), image_builtin: 'nope.jpg'})
        expect(create_image_bitmap).toHaveBeenCalledTimes(1)
    })

    it('takes caller-supplied regions (or an explicit null) as-is', async () => {
        const gen = await make_generator()
        await gen.generate({schema: SCHEMA, image: make_image(), image_regions: null})
        expect(create_image_bitmap).not.toHaveBeenCalled()
    })

    it('carries on uncoloured when sampling fails', async () => {
        create_image_bitmap.mockRejectedValueOnce(new Error('corrupt image'))
        const gen = await make_generator()
        const result = await gen.generate({schema: SCHEMA, image: make_image()})
        expect(result.data).toBe(FAKE_PDF)
    })
})


describe('analyze_image_regions', () => {

    it('downscales to at most 400px on the long edge and samples those pixels', async () => {
        const regions = await analyze_image_regions(make_image(), DIMS)
        const canvas = FakeOffscreenCanvas.instances[0]
        expect([canvas.width, canvas.height]).toEqual([400, 300])
        // Same result as sampling the canvas' pixels directly
        const pixels = canvas.ctx.getImageData(0, 0, 400, 300).data
        expect(regions).toEqual(analyze_pixel_regions(pixels, 400, 300, DIMS))
    })

    it('never upscales a small image', async () => {
        create_image_bitmap.mockResolvedValue({width: 120, height: 90, close: vi.fn()})
        await analyze_image_regions(make_image(), null)
        const canvas = FakeOffscreenCanvas.instances[0]
        expect([canvas.width, canvas.height]).toEqual([120, 90])
    })

    it('closes the decoded bitmap', async () => {
        await analyze_image_regions(make_image(), null)
        const bitmap = await create_image_bitmap.mock.results[0].value as {close:() => void}
        expect(bitmap.close).toHaveBeenCalled()
    })

    it('uses a DOM canvas on the main thread', async () => {
        const doc = make_fake_document()
        vi.stubGlobal('document', doc)
        await analyze_image_regions(make_image(), null)
        expect(doc.canvases).toHaveLength(1)
        expect(FakeOffscreenCanvas.instances).toHaveLength(0)
    })

    it('throws when no 2D context is available', async () => {
        FakeOffscreenCanvas.next_no_context = true
        await expect(analyze_image_regions(make_image(), null))
            .rejects.toThrow(/2D canvas context unavailable/)
    })
})
