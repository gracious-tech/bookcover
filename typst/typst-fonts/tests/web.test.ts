// Browser loaders, run under Node with fetch/FontFace/document.fonts stubbed. Note: manifest.ts
// holds module-level state, so the failing load_fonts_prefix() cases run first and the
// successful load then applies for the rest of the file (vitest isolates modules per file)

import {describe, it, expect, vi, afterEach} from 'vitest'

import {
    load_fonts_prefix, FontsServerError, font_file_url, font_urls_for, register_preview_fonts,
    register_custom_font_preview, fetch_font_bytes, fonts_to_blob_urls, revoke_blob_urls,
} from '../src/web.js'
import {get_fonts} from '../src/manifest.js'

import type {BundledFont} from '../src/manifest.js'


const PREFIX = 'https://assets.example/fonts/'

const TEST_MANIFEST:BundledFont[] = [
    {family: 'Noto Serif', group: 'Noto', style: 'serif',
        files: ['NotoSerif-Regular.ttf'], preview_file: 'NotoSerif-Regular.ttf'},
    {family: 'Test Sans', group: 'Test', style: 'sans',
        files: ['TestSans-Regular.ttf', 'TestSans-Bold.ttf'], preview_file: 'TestSans-Regular.ttf'},
]

// Stub fetch to answer every request with one canned response, returning the mock
function stub_fetch(body:BodyInit | null, init?:ResponseInit) {
    const fetch_mock = vi.fn(async (_url:string) => new Response(body, init))
    vi.stubGlobal('fetch', fetch_mock)
    return fetch_mock
}

/** A stand-in FontFace recording what it was constructed with */
class FakeFontFace {
    family:string
    source:string | BufferSource
    load = vi.fn(async () => this)
    // Record the constructor arguments for assertions
    constructor(family:string, source:string | BufferSource) {
        this.family = family
        this.source = source
    }
}

// Stub FontFace and document.fonts, returning the faces added to the document
function stub_font_faces():FakeFontFace[] {
    const added:FakeFontFace[] = []
    vi.stubGlobal('FontFace', FakeFontFace)
    vi.stubGlobal('document', {fonts: {add: (face:FakeFontFace) => added.push(face)}})
    return added
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})


describe('load_fonts_prefix', () => {

    it('reports a network failure as a FontsServerError', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            throw new TypeError('fetch failed')
        }))
        const result = load_fonts_prefix(PREFIX)
        await expect(result).rejects.toBeInstanceOf(FontsServerError)
        await expect(result).rejects.toThrow(/No response.*manifest\.json.*fetch failed/)
    })

    it('reports a non-OK status', async () => {
        stub_fetch('nope', {status: 404})
        await expect(load_fonts_prefix(PREFIX)).rejects.toThrow(/responded 404/)
    })

    it('rejects an HTML answer by content type', async () => {
        stub_fetch('[]', {headers: {'content-type': 'text/html; charset=utf-8'}})
        await expect(load_fonts_prefix(PREFIX)).rejects.toThrow(/HTML instead of the manifest/)
    })

    it('rejects an HTML answer by its body, e.g. an SPA fallback served as text/plain', async () => {
        stub_fetch('  <!doctype html><html></html>', {headers: {'content-type': 'text/plain'}})
        await expect(load_fonts_prefix(PREFIX)).rejects.toThrow(/HTML instead of the manifest/)
    })

    it('rejects a body that isn\'t JSON', async () => {
        stub_fetch('{not json', {headers: {'content-type': 'application/json'}})
        await expect(load_fonts_prefix(PREFIX)).rejects.toThrow(/invalid JSON/)
    })

    it('leaves the manifest uninitialised after every failure above', () => {
        expect(() => get_fonts()).toThrow(/init_fonts/)
    })

    it('fetches <prefix>/manifest.json (one slash) and initialises the manifest', async () => {
        const fetch_mock = stub_fetch(JSON.stringify(TEST_MANIFEST),
            {headers: {'content-type': 'application/json'}})
        await load_fonts_prefix(PREFIX)
        expect(fetch_mock).toHaveBeenCalledWith('https://assets.example/fonts/manifest.json')
        expect(get_fonts().map(f => f.family)).toEqual(['Noto Serif', 'Test Sans'])
    })
})


describe('font_file_url', () => {

    it('puts curated fonts under <prefix>/<family>/ and Noto under <prefix>/_noto/<family>/', () => {
        expect(font_file_url(PREFIX, 'Test Sans', 'A.ttf', false))
            .toBe('https://assets.example/fonts/Test%20Sans/A.ttf')
        expect(font_file_url('/fonts', 'Noto Sans Arabic', 'B.otf', true))
            .toBe('/fonts/_noto/Noto%20Sans%20Arabic/B.otf')
    })

    it('percent-encodes characters in the family that would break a path', () => {
        expect(font_file_url('/f', 'A/B #1', 'x.ttf', false)).toBe('/f/A%2FB%20%231/x.ttf')
    })
})


describe('font_urls_for', () => {

    it('lists every file of each curated and Noto family, skipping unknown ones', () => {
        const urls = font_urls_for('/fonts', ['Test Sans', 'Unknown Family', 'Noto Sans Adlam'])
        expect(urls).toEqual([
            '/fonts/Test%20Sans/TestSans-Regular.ttf',
            '/fonts/Test%20Sans/TestSans-Bold.ttf',
            '/fonts/_noto/Noto%20Sans%20Adlam/NotoSansAdlam-Regular.otf',
            '/fonts/_noto/Noto%20Sans%20Adlam/NotoSansAdlam-Bold.otf',
        ])
    })

    it('serves a family that is both curated and a Noto fallback from its curated directory', () => {
        expect(font_urls_for('/fonts', ['Noto Serif']))
            .toEqual(['/fonts/Noto%20Serif/NotoSerif-Regular.ttf'])
    })
})


describe('register_preview_fonts', () => {

    it('adds one lazily-loaded FontFace per font, pointing at its preview file', () => {
        const added = stub_font_faces()
        register_preview_fonts('/fonts', TEST_MANIFEST)
        expect(added.map(face => [face.family, face.source])).toEqual([
            ['Noto Serif', 'url("/fonts/Noto%20Serif/NotoSerif-Regular.ttf")'],
            ['Test Sans', 'url("/fonts/Test%20Sans/TestSans-Regular.ttf")'],
        ])
        // Lazy: nothing is fetched until the browser needs the face
        expect(added.every(face => face.load.mock.calls.length === 0)).toBe(true)
    })
})


describe('register_custom_font_preview', () => {

    it('loads the first file\'s bytes as a FontFace and adds it to the document', async () => {
        const added = stub_font_faces()
        // A view into a larger buffer, so the face must get exactly the view's bytes
        const backing = new Uint8Array([9, 1, 2, 3, 9])
        const first = backing.subarray(1, 4)
        await register_custom_font_preview(
            {family: 'Upload', style: 'sans', files: [first, new Uint8Array([7])]})
        expect(added).toHaveLength(1)
        const face = added[0]!
        expect(face.family).toBe('Upload')
        expect(face.load).toHaveBeenCalledOnce()
        expect([...face.source as Uint8Array]).toEqual([1, 2, 3])
    })

    it('does nothing for a font with no files', async () => {
        const added = stub_font_faces()
        await register_custom_font_preview({family: 'Empty', style: 'serif', files: []})
        expect(added).toEqual([])
    })
})


describe('fetch_font_bytes', () => {

    it('returns the response body as bytes', async () => {
        stub_fetch(new Uint8Array([0, 1, 0, 0]))
        expect([...await fetch_font_bytes('/fonts/x.ttf')]).toEqual([0, 1, 0, 0])
    })

    it('throws naming the URL and status on failure', async () => {
        stub_fetch(null, {status: 503})
        await expect(fetch_font_bytes('/fonts/x.ttf')).rejects.toThrow(/\/fonts\/x\.ttf: HTTP 503/)
    })
})


describe('blob URLs', () => {

    it('wraps each byte array in a typed Blob URL, then revokes them all', async () => {
        const blobs:Blob[] = []
        vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
            blobs.push(blob as Blob)
            return `blob:test/${blobs.length}`
        })
        const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

        // Default MIME is TTF; an explicit one is passed through
        const urls = fonts_to_blob_urls([new Uint8Array([1]), new Uint8Array([2, 3])])
        fonts_to_blob_urls([new Uint8Array([4])], 'font/otf')
        expect(urls).toEqual(['blob:test/1', 'blob:test/2'])
        expect(blobs.map(blob => blob.type)).toEqual(['font/ttf', 'font/ttf', 'font/otf'])
        expect([...new Uint8Array(await blobs[1]!.arrayBuffer())]).toEqual([2, 3])

        revoke_blob_urls(urls)
        expect(revoke.mock.calls).toEqual([['blob:test/1'], ['blob:test/2']])
    })
})
