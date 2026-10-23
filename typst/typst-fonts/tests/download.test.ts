// The per-app font download flow (download/), run against a fake network: fetch is stubbed to
// answer the Google Fonts download-list API and every font URL with synthetic fonts built by
// helpers.ts, written into a real temp directory. Nothing here touches the real network.

import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest'
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync}
    from 'node:fs'
import {tmpdir} from 'node:os'
import {basename, join} from 'node:path'

import {download_font, pick_preview} from '../src/download/google_fonts.js'
import {download_curated} from '../src/download/curated.js'
import {download_noto} from '../src/download/noto.js'
import {run_download, run_check} from '../src/download/run.js'
import {remove_overlaps} from '../src/download/overlaps.js'
import {typst_family} from '../src/sfnt.js'
import {build_test_font} from './helpers.js'
import noto_sources from '../src/generated/noto_sources.json' with {type: 'json'}

import type {BundledFont} from '../src/manifest.js'


// Overlap merging shells out to Python; here only its wiring into run_download() is under test
vi.mock('../src/download/overlaps.js', () => ({
    remove_overlaps: vi.fn(async (paths:string[],
        on_result?:(result:{path:string, merged:number}) => void) => {
        for (const path of paths) on_result?.({path, merged: 0})
    }),
}))

const API = 'https://fonts.google.com/download/list'

// Each Noto fallback URL mapped back to the family it's published under
const NOTO_URL_FAMILY = new Map(Object.entries(noto_sources as Record<string, string[]>)
    .flatMap(([family, urls]) => urls.map(url => [url, family] as const)))

/** A family the fake Google Fonts API knows: its file refs, and the family name in the bytes */
interface FakeFamily {
    filenames:string[]
    // Family name ID 1 as written in the files (defaults to the requested family)
    internal_name?:string
}

/** The fake network's state: the Google Fonts families it serves and every URL requested */
interface FakeNetwork {
    families:Map<string, FakeFamily>
    requested:string[]
    // URLs that should answer with an error status
    failing:Set<string>
}

// The four core static weights of a family, as Google Fonts' zips lay them out
function core_files(family:string):string[] {
    const base = family.replace(/\s+/g, '')
    return ['Regular', 'Bold', 'Italic', 'BoldItalic'].map(w => `static/${base}-${w}.ttf`)
}

// A response carrying a synthetic font for the family (copied into a plain ArrayBuffer-backed
// array, as Response's body type requires)
function font_response(family:string):Response {
    return new Response(new Uint8Array(build_test_font({family})))
}

// Stub fetch with a fake network serving the given Google Fonts families plus all Noto URLs
function stub_network(families:Record<string, FakeFamily>):FakeNetwork {
    const net:FakeNetwork = {families: new Map(Object.entries(families)), requested: [],
        failing: new Set()}

    vi.stubGlobal('fetch', vi.fn(async (input:string) => {
        net.requested.push(input)
        if (net.failing.has(input))
            return new Response(null, {status: 500})

        // Download-list API: a )]}'-prefixed JSON manifest of the family's file refs
        if (input.startsWith(API)) {
            const family = new URL(input).searchParams.get('family') ?? ''
            const fake = net.families.get(family)
            if (!fake)
                return new Response(null, {status: 400})
            const fileRefs = fake.filenames.map(filename => ({filename,
                url: `https://gfonts.test/${encodeURIComponent(family)}/${filename}`}))
            return new Response(`)]}'\n${JSON.stringify({manifest: {fileRefs}})}`)
        }

        // A Google Fonts file: a synthetic font named as its family's files say
        const gfonts = /^https:\/\/gfonts\.test\/([^/]+)\//.exec(input)
        if (gfonts) {
            const family = decodeURIComponent(gfonts[1]!)
            const internal = net.families.get(family)?.internal_name ?? family
            return font_response(internal)
        }

        // A Noto fallback file: a synthetic font named for the family it's listed under
        const noto_family = NOTO_URL_FAMILY.get(input)
        if (noto_family)
            return font_response(noto_family)

        return new Response(null, {status: 404})
    }))
    return net
}

// A fresh temp fonts directory per test, and the download's progress output silenced
let fonts_dir:string
beforeEach(() => {
    fonts_dir = mkdtempSync(join(tmpdir(), 'typst-fonts-download-'))
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})
afterEach(() => {
    rmSync(fonts_dir, {recursive: true, force: true})
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.mocked(remove_overlaps).mockClear()
})


describe('download_font', () => {

    it('downloads the four core static weights under their canonical names', async () => {
        // A variable font and an unrelated static file sit beside them, and are ignored
        stub_network({'Test Face': {filenames: [
            'TestFace[wght].ttf', ...core_files('Test Face'), 'static/TestFace-Light.ttf']}})
        const files = await download_font(fonts_dir, 'Test Face')
        expect(files).toEqual(['TestFace-Regular.ttf', 'TestFace-Bold.ttf',
            'TestFace-Italic.ttf', 'TestFace-BoldItalic.ttf'])
        expect(readdirSync(join(fonts_dir, 'Test Face')).sort()).toEqual([...files].sort())
        const data = readFileSync(join(fonts_dir, 'Test Face', 'TestFace-Bold.ttf'))
        expect(typst_family(data)).toBe('Test Face')
    })

    it('returns only the weights a family actually has', async () => {
        stub_network({'Solo': {filenames: ['static/Solo-Regular.ttf', 'static/Solo-Bold.ttf']}})
        expect(await download_font(fonts_dir, 'Solo')).toEqual(['Solo-Regular.ttf', 'Solo-Bold.ttf'])
    })

    it('falls back to the smallest optical size, comparing sizes numerically', async () => {
        // Lexically "18pt" sorts before "9pt"; the body-text 9pt cut is the one wanted
        const net = stub_network({'Optic': {filenames: [
            'static/Optic_18pt-Regular.ttf', 'static/Optic_9pt-Regular.ttf',
            'static/Optic_SemiCondensed_9pt-Regular.ttf']}})
        expect(await download_font(fonts_dir, 'Optic')).toEqual(['Optic-Regular.ttf'])
        expect(net.requested).toContain('https://gfonts.test/Optic/static/Optic_9pt-Regular.ttf')
        expect(net.requested.some(url => url.includes('18pt') || url.includes('Condensed')))
            .toBe(false)
    })

    it('skips a family whose Regular file is already on disk, without any request', async () => {
        const net = stub_network({})
        mkdirSync(join(fonts_dir, 'Kept'))
        writeFileSync(join(fonts_dir, 'Kept', 'Kept-Regular.ttf'), '')
        writeFileSync(join(fonts_dir, 'Kept', 'Kept-Bold.ttf'), '')
        writeFileSync(join(fonts_dir, 'Kept', 'notes.txt'), '')
        expect((await download_font(fonts_dir, 'Kept')).sort())
            .toEqual(['Kept-Bold.ttf', 'Kept-Regular.ttf'])
        expect(net.requested).toEqual([])
    })

    it('re-fetches only the weights missing from a partial download', async () => {
        const net = stub_network({'Part': {filenames: core_files('Part')}})
        mkdirSync(join(fonts_dir, 'Part'))
        writeFileSync(join(fonts_dir, 'Part', 'Part-Bold.ttf'), 'existing')
        await download_font(fonts_dir, 'Part')
        expect(net.requested.filter(url => url.startsWith('https://gfonts.test/')).map(u => basename(u)))
            .toEqual(['Part-Regular.ttf', 'Part-Italic.ttf', 'Part-BoldItalic.ttf'])
        expect(readFileSync(join(fonts_dir, 'Part', 'Part-Bold.ttf'), 'utf8')).toBe('existing')
    })

    it('throws when the API rejects the family', async () => {
        stub_network({})
        await expect(download_font(fonts_dir, 'Unknown')).rejects.toThrow(/API returned 400 for "Unknown"/)
    })

    it('throws when a family has no static files at all', async () => {
        stub_network({'Variable Only': {filenames: ['VariableOnly[wght].ttf']}})
        await expect(download_font(fonts_dir, 'Variable Only'))
            .rejects.toThrow(/No static font files found for "Variable Only"/)
    })
})


describe('pick_preview', () => {

    it('prefers the Regular file', () => {
        expect(pick_preview(['A-Bold.ttf', 'A-Regular.ttf'])).toBe('A-Regular.ttf')
    })

    it('falls back to the first file', () => {
        expect(pick_preview(['A-Bold.ttf', 'A-Italic.ttf'])).toBe('A-Bold.ttf')
    })
})


describe('download_curated', () => {

    it('builds a manifest entry per family, skipping (and reporting) any that fail', async () => {
        stub_network({'Good Serif': {filenames: core_files('Good Serif')}})
        const entries = await download_curated(fonts_dir, [
            {family: 'Good Serif', group: 'Serif', style: 'serif'},
            {family: 'Broken', group: 'Sans', style: 'sans'},
        ])
        expect(entries).toEqual([{
            family: 'Good Serif', group: 'Serif', style: 'serif',
            files: ['GoodSerif-Regular.ttf', 'GoodSerif-Bold.ttf', 'GoodSerif-Italic.ttf',
                'GoodSerif-BoldItalic.ttf'],
            preview_file: 'GoodSerif-Regular.ttf',
        }])
        expect(vi.mocked(console.log).mock.calls.flat().join('\n')).toMatch(/FAILED: API returned 400/)
    })
})


describe('download_noto', () => {

    // Both Noto base families on the fake Google Fonts API
    const NOTO_BASE = {
        'Noto Serif': {filenames: core_files('Noto Serif')},
        'Noto Sans': {filenames: core_files('Noto Sans')},
    }

    it('returns the Serif/Sans base entries and downloads every fallback file', async () => {
        stub_network(NOTO_BASE)
        const base = await download_noto(fonts_dir, 'Base')
        expect(base.map(f => [f.family, f.group, f.style, f.preview_file])).toEqual([
            ['Noto Serif', 'Base', 'serif', 'NotoSerif-Regular.ttf'],
            ['Noto Sans', 'Base', 'sans', 'NotoSans-Regular.ttf'],
        ])
        // Every bundled fallback URL lands at _noto/<family>/<basename>
        for (const [url, family] of NOTO_URL_FAMILY) {
            expect(existsSync(join(fonts_dir, '_noto', family, basename(url))), url).toBe(true)
        }
    })

    it('fetches nothing again for a tree that is already complete', async () => {
        stub_network(NOTO_BASE)
        await download_noto(fonts_dir, 'Noto')
        const net = stub_network(NOTO_BASE)
        await download_noto(fonts_dir, 'Noto')
        expect(net.requested).toEqual([])
    })

    it('throws on a failed fallback download', async () => {
        const net = stub_network(NOTO_BASE)
        const [failing] = NOTO_URL_FAMILY.keys()
        net.failing.add(failing!)
        await expect(download_noto(fonts_dir, 'Noto')).rejects.toThrow(/HTTP 500 for https:/)
    })
})


describe('run_download', () => {

    // A network with the Noto base, one curated family, and one whose files are a respelling
    function full_network():FakeNetwork {
        return stub_network({
            'Noto Serif': {filenames: core_files('Noto Serif')},
            'Noto Sans': {filenames: core_files('Noto Sans')},
            'Curated': {filenames: core_files('Curated')},
            'Merri': {filenames: ['static/Merri_24pt-Regular.ttf'], internal_name: 'Merri 24pt'},
        })
    }

    // Read the manifest.json a download wrote
    function read_manifest():BundledFont[] {
        return JSON.parse(readFileSync(join(fonts_dir, 'manifest.json'), 'utf8')) as BundledFont[]
    }

    it('writes a manifest of the Noto base (default group) and curated fonts, Noto Serif first',
        async () => {
            full_network()
            await run_download({fonts_dir, config: {curated: [
                {family: 'Curated', group: 'Display', style: 'sans'},
                {family: 'Merri', group: 'Serif', style: 'serif'},
            ]}})
            const manifest = read_manifest()
            expect(manifest.map(f => [f.family, f.group])).toEqual([
                ['Noto Serif', 'Noto'], ['Noto Sans', 'Noto'], ['Curated', 'Display'], ['Merri', 'Serif'],
            ])
            expect(readFileSync(join(fonts_dir, 'manifest.json'), 'utf8')).toMatch(/\n$/)
            // No overlap merging unless asked
            expect(remove_overlaps).not.toHaveBeenCalled()
        })

    it('renames a respelt family so Typst can reach it under its listed name', async () => {
        full_network()
        await run_download({fonts_dir, config: {curated: [
            {family: 'Merri', group: 'Serif', style: 'serif'},
        ]}})
        expect(typst_family(readFileSync(join(fonts_dir, 'Merri', 'Merri-Regular.ttf')))).toBe('Merri')
        expect(vi.mocked(console.log).mock.calls.flat().join('\n'))
            .toMatch(/renamed "Merri 24pt" -> "Merri"/)
    })

    it('merges overlaps in the Google Fonts files only, never the _noto/ fallbacks', async () => {
        full_network()
        await run_download({fonts_dir, remove_overlaps: true, config: {noto_group: 'Base',
            curated: [{family: 'Curated', group: 'Display', style: 'sans'}]}})
        const paths = vi.mocked(remove_overlaps).mock.calls[0]![0]
        expect(paths).toContain(join(fonts_dir, 'Curated', 'Curated-Regular.ttf'))
        expect(paths).toContain(join(fonts_dir, 'Noto Serif', 'NotoSerif-Bold.ttf'))
        expect(paths).toHaveLength(12)
        expect(paths.some(path => path.includes('_noto'))).toBe(false)
        expect(read_manifest()[0]!.group).toBe('Base')
    })

    it('refuses to write a manifest when a file can\'t be reached by its listed family', async () => {
        const net = full_network()
        // Not a mere respelling, so it isn't renamed and the check must catch it
        net.families.set('Wrong', {filenames: core_files('Wrong'), internal_name: 'Something Else'})
        await expect(run_download({fonts_dir, config: {curated: [
            {family: 'Wrong', group: 'Serif', style: 'serif'},
        ]}})).rejects.toThrow(/Typst reads "Something Else", listed as "Wrong"/)
        expect(existsSync(join(fonts_dir, 'manifest.json'))).toBe(false)
    })
})


describe('run_check', () => {

    // Download a complete tree to check against
    async function download_tree():Promise<void> {
        stub_network({
            'Noto Serif': {filenames: core_files('Noto Serif')},
            'Noto Sans': {filenames: core_files('Noto Sans')},
        })
        await run_download({fonts_dir})
    }

    it('passes for a complete, correctly named tree', async () => {
        await download_tree()
        await expect(run_check(fonts_dir)).resolves.toBeUndefined()
    })

    it('fails, naming the file, when a listed file is missing', async () => {
        await download_tree()
        const [url, family] = [...NOTO_URL_FAMILY][0]!
        rmSync(join(fonts_dir, '_noto', family, basename(url)))
        await expect(run_check(fonts_dir)).rejects.toThrow(new RegExp(`${basename(url)}: missing`))
    })

    it('fails when the tree has no manifest', async () => {
        await expect(run_check(fonts_dir)).rejects.toThrow(/ENOENT/)
    })
})
