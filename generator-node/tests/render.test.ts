
// End-to-end render tests: these actually spawn the typst binary and write real files.
//
// They need two things a bare checkout does not have — the typst CLI (.bin/setup_typst) and a
// populated fonts tree (.bin/download_fonts) — so the whole suite skips itself when either is
// missing rather than failing. Everything else in the repo's suites is pure and always runs.

import {describe, it, expect, beforeAll, afterAll} from 'vitest'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {generate} from '../src/index.js'
import {resolve_dimensions, calculate_pixel_crop_regions} from 'bookcover-core'

const REPO = path.resolve(import.meta.dirname, '../..')
const ASSETS_DIR = path.join(REPO, 'assets')
const TYPST_PATH = path.join(REPO, '.bin', 'typst')

// Rendering a cover takes a few seconds per format on a cold font cache
const RENDER_TIMEOUT = 120_000

const SCHEMA = {
    title1: 'The',
    title2: 'Art of Code',
    title_position: 'top',
    subtitle: 'A journey through software craft',
    subtitle_position: 'middle',
    author: 'Alice Chen',
    author_position: 'bottom',
    blurb: 'A deep dive into the principles behind great software.',
    bg_color: 'hsl(237deg, 28%, 14%)',
    spine_color: 'hsl(234deg, 88%, 73%)',
    service_id: 'kdp',
    binding_type: 'paperback',
    ink_type: 'bw',
    paper_type: 'white',
    size_id: 'us_trade',
    page_count: 300,
    isbn: '978-3-16-148410-0',
}

const dims = resolve_dimensions(SCHEMA)
const have_typst = fsSync.existsSync(TYPST_PATH)
const have_fonts = fsSync.existsSync(path.join(ASSETS_DIR, 'fonts', 'manifest.json'))

// An empty input dir keeps generate() from auto-discovering a background image
let work_dir = ''

/** Render the sample cover into the work dir and return the result */
async function render(name:string, options:Record<string, unknown> = {}) {
    return generate({
        schema: SCHEMA,
        input_path: path.join(work_dir, 'input'),
        output_path: path.join(work_dir, name),
        assets_dir: ASSETS_DIR,
        typst_path: TYPST_PATH,
        ...options,
    })
}

/** The first bytes of a file, for format sniffing */
async function head(file:string, length:number):Promise<Uint8Array> {
    return new Uint8Array((await fs.readFile(file)).subarray(0, length))
}

/** Width and height in pixels from a PNG's IHDR chunk */
async function png_size(file:string):Promise<{width:number, height:number}> {
    const buf = await fs.readFile(file)
    return {width: buf.readUInt32BE(16), height: buf.readUInt32BE(20)}
}

/** A numeric attribute from an SVG root element */
function svg_attr(svg:string, name:string):number {
    return parseFloat(new RegExp(`${name}="([\\d.]+)`).exec(svg)![1])
}

beforeAll(async () => {
    work_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bookcover-test-'))
    await fs.mkdir(path.join(work_dir, 'input'))
})

afterAll(async () => {
    if (work_dir)
        await fs.rm(work_dir, {recursive: true, force: true})
})


describe.skipIf(!have_typst || !have_fonts)('rendering a cover', () => {

    it('writes a PDF', {timeout: RENDER_TIMEOUT}, async () => {
        const result = await render('cover.pdf')
        expect(result.output_path).toBe(path.join(work_dir, 'cover.pdf'))
        const magic = await head(result.output_path, 5)
        expect(new TextDecoder().decode(magic)).toBe('%PDF-')
        expect((await fs.stat(result.output_path)).size).toBeGreaterThan(1000)
    })

    it('writes an SVG sized to the full cover', {timeout: RENDER_TIMEOUT}, async () => {
        const result = await render('cover.svg', {format: 'svg'})
        const svg = await fs.readFile(result.output_path, 'utf8')
        expect(svg).toContain('<svg')
        // Typst emits pt; 1mm = 72/25.4pt
        const to_pt = (mm:number) => mm / 25.4 * 72
        expect(svg_attr(svg, 'width')).toBeCloseTo(to_pt(dims.cover_total_width.toNumber()), 0)
        expect(svg_attr(svg, 'height')).toBeCloseTo(to_pt(dims.cover_total_height.toNumber()), 0)
    })

    it('writes a PNG at the requested PPI', {timeout: RENDER_TIMEOUT}, async () => {
        const result = await render('cover.png', {format: 'png', ppi: 150})
        const signature = await head(result.output_path, 8)
        expect([...signature]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        const {width, height} = await png_size(result.output_path)
        const expected_w = dims.cover_total_width.toNumber() / 25.4 * 150
        const expected_h = dims.cover_total_height.toNumber() / 25.4 * 150
        expect(width).toBeCloseTo(expected_w, -0.5)
        expect(height).toBeCloseTo(expected_h, -0.5)
    })

    it('renders a cover whose text needs a Noto fallback', {timeout: RENDER_TIMEOUT}, async () => {
        // Exercises collect_all_fonts → resolve_font_dirs → typst actually finding the files
        const result = await render('multilingual.pdf', {
            schema: {...SCHEMA, title1: 'שלום', title2: '日本語', author: '홍길동'}})
        expect((await fs.stat(result.output_path)).size).toBeGreaterThan(1000)
    })
})


describe.skipIf(!have_typst || !have_fonts)('splitting a rendered cover', () => {

    it('writes three SVG panels, each cropped to its own region',
        {timeout: RENDER_TIMEOUT}, async () => {
            const result = await render('split.svg', {format: 'svg', split: true})
            expect(result.split_paths).toBeDefined()
            const {front, back, spine} = result.split_paths!
            for (const file of [front, back, spine!])
                expect(fsSync.existsSync(file), file).toBe(true)

            const to_pt = (mm:number) => mm / 25.4 * 72
            const front_svg = await fs.readFile(front, 'utf8')
            expect(svg_attr(front_svg, 'width'))
                .toBeCloseTo(to_pt(dims.cover_region_front.w.toNumber()), 1)
            // The spine panel is much narrower than a face
            const spine_svg = await fs.readFile(spine!, 'utf8')
            expect(svg_attr(spine_svg, 'width')).toBeLessThan(svg_attr(front_svg, 'width'))
        })

    it('writes PNG panels cropped to the pixel regions',
        {timeout: RENDER_TIMEOUT}, async () => {
            const ppi = 150
            const result = await render('split.png', {format: 'png', ppi, split: true})
            const regions = calculate_pixel_crop_regions(dims, ppi)
            const by_label = (label:string) => regions.find(r => r.label === label)!
            for (const label of ['front', 'back', 'spine'] as const) {
                const file = result.split_paths![label]!
                const {width, height} = await png_size(file)
                expect(width, label).toBe(by_label(label).width)
                expect(height, label).toBe(by_label(label).height)
            }
        })

    it('leaves a PDF unsplit into separate panel files', {timeout: RENDER_TIMEOUT}, async () => {
        // PDF panels are one file per panel with a CropBox, written alongside the full cover
        const result = await render('split.pdf', {split: true})
        expect(fsSync.existsSync(result.output_path)).toBe(true)
    })
})


describe.skipIf(!have_typst || !have_fonts)('failure handling', () => {

    it('rejects an invalid schema before spawning typst', async () => {
        await expect(render('bad.pdf', {schema: {...SCHEMA, bg_color: 'red'}})).rejects.toThrow()
    })

    it('reports a missing typst binary rather than writing a broken file', async () => {
        // A failed render deliberately preserves its work dir for debugging, so the path is
        // captured off the log and cleaned up here rather than left behind in the temp dir
        const logged:string[] = []
        const original = console.error
        console.error = (...args:unknown[]) => logged.push(args.join(' '))
        try {
            await expect(render('missing.pdf', {typst_path: '/nonexistent/typst'})).rejects.toThrow()
        } finally {
            console.error = original
        }
        for (const line of logged) {
            const preserved = /(\/\S*paper_cover_\S+)/.exec(line)?.[1]
            if (preserved)
                await fs.rm(preserved, {recursive: true, force: true})
        }
    })
})
