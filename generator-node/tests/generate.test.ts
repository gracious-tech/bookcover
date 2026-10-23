// generate()'s own plumbing — background discovery, colour sampling, the typst command line,
// custom fonts, failures and the output move — checked against a FAKE typst binary (a shell
// script that logs its arguments and work dir, then writes a stub output). Unlike
// render.test.ts this needs neither the real typst nor a downloaded fonts tree, so it always
// runs; what a real compile produces is render.test.ts's job.

import {describe, it, expect, vi, beforeAll, afterAll, beforeEach} from 'vitest'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

import {generate, analyze_image_regions, get_builtin_bg_regions} from '../src/index.js'
import {build, resolve_dimensions} from 'bookcover-core'
import type {ImageRegions} from 'bookcover-core'
import type {BundledFont, CustomFont} from 'typst-fonts'

// Wrap build() so tests can see what generate() handed it (the image and its sampled colours)
vi.mock('bookcover-core', async importOriginal => {
    const actual = await importOriginal<typeof import('bookcover-core')>()
    return {...actual, build: vi.fn(actual.build)}
})

// Wrap rename() so a test can make it fail the way a cross-device move does
vi.mock('node:fs/promises', async importOriginal => {
    const actual = await importOriginal<typeof import('node:fs/promises')>()
    const rename = vi.fn(actual.rename)
    return {...actual, default: {...actual, rename}, rename}
})

const SCHEMA = {
    title1: 'The',
    title2: 'Art of Code',
    title_position: 'top',
    subtitle_position: 'middle',
    author: 'Alice Chen',
    author_position: 'bottom',
    blurb: 'A deep dive into great software.',
    service_id: 'kdp',
    binding_type: 'paperback',
    ink_type: 'bw',
    paper_type: 'white',
    size_id: 'us_trade',
    page_count: 300,
    isbn: '',
}

// A one-family stand-in for assets/fonts/manifest.json — the fake typst never reads a font
const MANIFEST:BundledFont[] = [
    {family: 'Noto Serif', group: 'Noto', style: 'serif',
        files: ['NotoSerif-Regular.ttf'], preview_file: 'NotoSerif-Regular.ttf'},
]

// Where the fake typst writes what it saw, and the scratch tree each test works in
let root = ''
let fonts_dir = ''
let input_dir = ''
let log_dir = ''
let fake_typst = ''
let failing_typst = ''

/** Write an executable shell script */
async function write_script(file:string, body:string):Promise<void> {
    await fs.writeFile(file, `#!/bin/sh\n${body}\n`)
    await fs.chmod(file, 0o755)
}

/** Run generate() against the fake typst with the stand-in fonts and the shared input dir */
async function run(name:string, options:Record<string, unknown> = {}) {
    return generate({
        schema: SCHEMA,
        input_path: input_dir,
        output_path: path.join(root, name),
        fonts_dir,
        typst_path: fake_typst,
        ...options,
    })
}

/** The arguments the fake typst was last called with */
async function typst_args():Promise<string[]> {
    return (await fs.readFile(path.join(log_dir, 'args'), 'utf8')).trim().split('\n')
}

/** The files the fake typst found in its work dir, relative to it */
async function work_files():Promise<string[]> {
    return (await fs.readFile(path.join(log_dir, 'files'), 'utf8')).trim().split('\n')
        .map(file => file.replace(/^\.\//, '')).sort()
}

/** The image and colour sample generate() last passed to build() */
function last_build_inputs() {
    const call = vi.mocked(build).mock.calls.at(-1)!
    return {image: call[1], image_regions: call[5]}
}

/** A solid-colour PNG */
async function solid_png(width:number, height:number, rgb:[number, number, number]):Promise<Buffer> {
    return sharp({create: {width, height, channels: 3, background: {r: rgb[0], g: rgb[1], b: rgb[2]}}})
        .png().toBuffer()
}

/** Remove the work dir a failed generate() preserved, as named in its error message */
async function remove_preserved(message:string):Promise<void> {
    const preserved = /(\/\S*paper_cover_[0-9a-f-]+)/.exec(message)?.[1]
    if (preserved)
        await fs.rm(preserved, {recursive: true, force: true})
}

/** Await a rejection, returning its message and cleaning up the preserved work dir. The
 *  console.error about the preserved dir is silenced */
async function failure(promise:Promise<unknown>):Promise<string> {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
        const error = await promise.then(() => null, (e:unknown) => e)
        expect(error).toBeInstanceOf(Error)
        const message = (error as Error).message
        await remove_preserved(message)
        for (const [line] of spy.mock.calls)
            await remove_preserved(String(line))
        return message
    } finally {
        spy.mockRestore()
    }
}

beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'bookcover-generate-test-'))
    fonts_dir = path.join(root, 'fonts')
    log_dir = path.join(root, 'log')
    await fs.mkdir(fonts_dir)
    await fs.mkdir(log_dir)
    await fs.writeFile(path.join(fonts_dir, 'manifest.json'), JSON.stringify(MANIFEST))

    // Log the arguments and the work dir's files, then write the output file it was asked for
    fake_typst = path.join(root, 'typst')
    await write_script(fake_typst, [
        `printf '%s\\n' "$@" > '${log_dir}/args'`,
        `find . -type f | sort > '${log_dir}/files'`,
        `for arg; do case "$arg" in _output.*) printf fake > "$arg";; esac; done`,
    ].join('\n'))
    failing_typst = path.join(root, 'typst-failing')
    await write_script(failing_typst, 'echo "error: boom" >&2\nexit 3')
})

beforeEach(async () => {
    // A fresh, empty input dir per test, so no background leaks from one test into the next
    input_dir = await fs.mkdtemp(path.join(root, 'input-'))
    vi.mocked(build).mockClear()
})

afterAll(async () => {
    if (root)
        await fs.rm(root, {recursive: true, force: true})
})


describe('the typst invocation', () => {

    it('compiles cover.typ with one font path per needed family, and moves the output',
        async () => {
            const result = await run('cover.pdf')
            expect(await typst_args()).toEqual(['compile',
                '--font-path', path.join(fonts_dir, 'Noto Serif'), 'cover.typ', '_output.pdf'])
            expect(result).toEqual({output_path: path.join(root, 'cover.pdf')})
            expect(await fs.readFile(result.output_path, 'utf8')).toBe('fake')
        })

    it('writes the whole virtual filesystem into the work dir', async () => {
        await run('files.pdf')
        expect(await work_files()).toEqual(['_data.typ', '_helpers.typ', 'cover.typ'])
    })

    it('adds a Noto fallback directory for text in another script', async () => {
        await run('hebrew.pdf', {schema: {...SCHEMA, title1: 'שלום'}})
        const args = await typst_args()
        const font_paths = args.filter((_arg, i) => args[i - 1] === '--font-path')
        expect(font_paths[0]).toBe(path.join(fonts_dir, 'Noto Serif'))
        expect(font_paths.slice(1).every(dir => dir.startsWith(path.join(fonts_dir, '_noto'))))
            .toBe(true)
        expect(font_paths.length).toBeGreaterThan(1)
    })

    it('passes a PPI for PNG output only, defaulting to 144', async () => {
        await run('cover.png', {format: 'png'})
        expect((await typst_args()).slice(-3)).toEqual(['_output.png', '--ppi', '144'])
        await run('cover300.png', {format: 'png', ppi: 300})
        expect((await typst_args()).slice(-2)).toEqual(['--ppi', '300'])
        await run('cover.svg', {format: 'svg'})
        expect(await typst_args()).not.toContain('--ppi')
    })

    it('writes custom fonts into the work dir, one font path per family', async () => {
        const custom_fonts:CustomFont[] = [
            {family: 'My Font', style: 'serif', files: [new Uint8Array([1]), new Uint8Array([2])]},
            {family: 'Other', style: 'sans', files: [new Uint8Array([3])]},
        ]
        await run('custom.pdf', {custom_fonts})
        expect(await work_files()).toEqual(expect.arrayContaining([
            '_fonts/My Font/file-0.ttf', '_fonts/My Font/file-1.ttf', '_fonts/Other/file-0.ttf']))
        const args = await typst_args()
        const custom_dirs = args.filter(arg => arg.includes(`${path.sep}_fonts${path.sep}`))
        expect(custom_dirs.map(dir => path.basename(dir))).toEqual(['My Font', 'Other'])
        // The work dir is cleaned up after a successful compile
        expect(fsSync.existsSync(path.dirname(path.dirname(custom_dirs[0])))).toBe(false)
    })
})


describe('background image discovery', () => {

    it('compiles with no image when the input dir has none', async () => {
        await run('none.pdf')
        expect(last_build_inputs().image).toBeUndefined()
    })

    it('picks up background.<ext> from the input dir', async () => {
        const png = await solid_png(8, 8, [255, 0, 0])
        await fs.writeFile(path.join(input_dir, 'background.png'), png)
        await run('found.pdf')
        const {image} = last_build_inputs()
        expect(image?.ext).toBe('.png')
        expect(Buffer.from(image!.data)).toEqual(png)
        expect(await work_files()).toContain('background.png')
    })

    it('prefers .jpg over the other extensions', async () => {
        await fs.writeFile(path.join(input_dir, 'background.png'), await solid_png(4, 4, [0, 0, 0]))
        await fs.writeFile(path.join(input_dir, 'background.jpg'), 'jpeg')
        await run('prefer.pdf', {image_regions: null})
        expect(last_build_inputs().image?.ext).toBe('.jpg')
    })

    it('uses the schema\'s explicitly named image, lowercasing its extension', async () => {
        await fs.writeFile(path.join(input_dir, 'Cover-Art.PNG'), await solid_png(4, 4, [0, 0, 0]))
        await run('explicit.pdf', {schema: {...SCHEMA, images: {background: 'Cover-Art.PNG'}}})
        expect(last_build_inputs().image?.ext).toBe('.png')
    })

    it('renders with no image when the named image does not exist', async () => {
        await run('missing.pdf', {schema: {...SCHEMA, images: {background: 'nope.jpg'}}})
        expect(last_build_inputs().image).toBeUndefined()
    })
})


describe('background colour sampling', () => {

    it('samples nothing when there is no image', async () => {
        await run('no-image.pdf', {image_builtin: 'beach.jpg'})
        expect(last_build_inputs().image_regions).toBeNull()
    })

    it('decodes the image itself, including the full-wrap regions', async () => {
        await fs.writeFile(path.join(input_dir, 'background.png'), await solid_png(60, 40, [0, 0, 255]))
        await run('sampled.pdf')
        const regions = last_build_inputs().image_regions!
        expect(regions.front_top.hue).toBeCloseTo(240, 3)
        expect(regions.front_top_full).not.toBeNull()
        expect(regions.spine).not.toBeNull()
    })

    it('takes a named builtin\'s baked regions instead of decoding', async () => {
        await fs.writeFile(path.join(input_dir, 'background.png'), await solid_png(8, 8, [0, 0, 255]))
        await run('builtin.pdf', {image_builtin: 'beach.jpg'})
        expect(last_build_inputs().image_regions).toBe(get_builtin_bg_regions('beach.jpg'))
    })

    it('decodes when the named builtin is unknown', async () => {
        await fs.writeFile(path.join(input_dir, 'background.png'), await solid_png(8, 8, [0, 0, 255]))
        await run('unknown-builtin.pdf', {image_builtin: 'not-a-builtin.jpg'})
        expect(last_build_inputs().image_regions?.front_top.hue).toBeCloseTo(240, 3)
    })

    it('uses caller-supplied regions as-is, null included', async () => {
        await fs.writeFile(path.join(input_dir, 'background.png'), await solid_png(8, 8, [0, 0, 255]))
        const supplied = get_builtin_bg_regions('beach.jpg') as ImageRegions
        await run('supplied.pdf', {image_regions: supplied, image_builtin: 'awe.jpg'})
        expect(last_build_inputs().image_regions).toBe(supplied)
        await run('skipped.pdf', {image_regions: null})
        expect(last_build_inputs().image_regions).toBeNull()
    })

    it('carries on without colours when the image cannot be decoded', async () => {
        await fs.writeFile(path.join(input_dir, 'background.jpg'), 'not really a jpeg')
        const result = await run('corrupt.pdf')
        expect(last_build_inputs().image_regions).toBeNull()
        expect(fsSync.existsSync(result.output_path)).toBe(true)
    })
})


describe('analyze_image_regions', () => {

    it('reads a solid image\'s colour, with or without dimensions', async () => {
        const png = await solid_png(30, 20, [0, 255, 0])
        const front_only = await analyze_image_regions(new Uint8Array(png), null)
        expect(front_only.front_top.hue).toBeCloseTo(120, 3)
        expect(front_only.back).toBeNull()
        const wrap = await analyze_image_regions(new Uint8Array(png), resolve_dimensions(SCHEMA))
        expect(wrap.back?.hue).toBeCloseTo(120, 3)
    })

    it('downscales a large image before sampling, with the same result', async () => {
        const large = await solid_png(2000, 1000, [255, 0, 0])
        const regions = await analyze_image_regions(new Uint8Array(large), null)
        expect(regions.front_top.hue).toBeCloseTo(0, 3)
        expect(regions.front_top.saturation).toBeCloseTo(1, 3)
    })

    it('rejects bytes that are not an image', async () => {
        await expect(analyze_image_regions(new Uint8Array([1, 2, 3]), null)).rejects.toThrow()
    })
})


describe('failures', () => {

    it('reports a typst error with its exit code and stderr, preserving the work dir',
        async () => {
            const message = await failure(run('fail.pdf', {typst_path: failing_typst}))
            expect(message).toContain('typst exited with code 3')
            expect(message).toContain('error: boom')
            expect(message).toMatch(/Work dir preserved at: \S*paper_cover_/)
            expect(fsSync.existsSync(path.join(root, 'fail.pdf'))).toBe(false)
        })

    it('explains a typst binary that cannot be spawned', async () => {
        const message = await failure(run('nobinary.pdf', {typst_path: path.join(root, 'nope')}))
        expect(message).toContain(`Failed to spawn ${path.join(root, 'nope')}`)
        expect(message).toContain('Is typst on your PATH?')
    })

    it('rejects an invalid schema before running typst', async () => {
        await fs.rm(path.join(log_dir, 'args'), {force: true})
        await expect(run('invalid.pdf', {schema: {...SCHEMA, service_id: 42}})).rejects.toThrow()
        expect(fsSync.existsSync(path.join(log_dir, 'args'))).toBe(false)
    })
})


describe('moving the output', () => {

    it('falls back to copy + delete when the output is on another filesystem', async () => {
        const exdev = Object.assign(new Error('cross-device link'), {code: 'EXDEV'})
        vi.mocked(fs.rename).mockRejectedValueOnce(exdev)
        const result = await run('moved.pdf')
        expect(await fs.readFile(result.output_path, 'utf8')).toBe('fake')
    })

    it('rethrows any other rename failure', async () => {
        const eacces = Object.assign(new Error('permission denied'), {code: 'EACCES'})
        vi.mocked(fs.rename).mockRejectedValueOnce(eacces)
        expect(await failure(run('denied.pdf'))).toBe('permission denied')
    })
})
