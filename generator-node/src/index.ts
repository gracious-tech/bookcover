
// Node.js cover generator — writes typst files to disk and compiles to PDF, SVG, or PNG

import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {spawn} from 'node:child_process'
import {build, cover_schema, split_svg, split_png, split_pdf,
    asset_path, DOCS_DIR, TEMPLATE_FILES, collect_all_fonts} from 'bookcover-core'
import type {OutputFormat, Templates} from 'bookcover-core'
import type {CoverSchema} from 'bookcover-core'
import {load_fonts_dir, write_custom_fonts,
    resolve_font_dirs as resolve_font_dirs_generic} from 'typst-fonts/node'
import type {CustomFont} from 'typst-fonts'
import sharp from 'sharp'

export type {CoverSchema, TitlePosition, FontConfig,
    OutputFormat, SplitResult, PatternDef} from 'bookcover-core'
export type {BundledFont, CustomFont} from 'typst-fonts'
export {get_fonts, get_bundled_font} from 'typst-fonts'
export {list_patterns, collect_fonts, collect_all_fonts, default_spine_title} from 'bookcover-core'

// Form state + form->schema conversion, so hosts can derive the renderable schema server-side
export {make_blank_form_values, build_schema, curly_quotes, parse_font_family, find_pattern,
    derive_colors, hex_override_to_hsl} from 'bookcover-core'
export type {FormState, EmbedFormState, CustomFontStyle} from 'bookcover-core'

// Default assets root: the repo's top-level assets/ directory (typst templates in docs/,
// fonts/, etc — the same tree deployed to the public assets bucket), resolved relative to the
// installed bookcover-core package. Only valid in this repo's workspace layout — npm
// consumers must pass assets_dir instead (see README)
const ASSETS_BASE = path.join(
    path.dirname(fileURLToPath(import.meta.resolve('bookcover-core'))),
    '..', '..', 'assets',
)

// Image extensions to try when auto-discovering a background image
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp']

// File extension for each output format
const FORMAT_EXT:Record<OutputFormat, string> = {pdf: 'pdf', svg: 'svg', png: 'png'}

export interface GenerateOptions {
    schema:unknown
    input_path:string
    output_path:string
    // Output format: 'pdf' (default), 'svg', or 'png'
    format?:OutputFormat
    // PPI for PNG output (default 144)
    ppi?:number
    // Whether to split the result into front/back/spine panels
    split?:boolean
    // Root of the static assets tree, containing at least docs/ (the typst templates) and
    // fonts/ (default: the repo-local assets/ dir — see the README for how to obtain a copy)
    assets_dir?:string
    // Root of the fonts tree, if kept outside assets_dir (default: <assets_dir>/fonts)
    fonts_dir?:string
    // Path to the typst CLI binary (default: 'typst' resolved from PATH)
    typst_path?:string
    // User-uploaded font families (bytes + sniffed style), e.g. from the widget's embed
    // protocol — written to the work dir and scanned by typst alongside the fonts tree
    custom_fonts?:CustomFont[]
}

export interface GenerateResult {
    // Path to the main (full cover) output file
    output_path:string
    // Paths to split panel files (only present when split is true and format is svg/png)
    split_paths?:{front:string, back:string, spine?:string}
}

/** Find a background image in input_path, explicit filename or auto-discovered */
async function find_background_image(
    input_path:string,
    explicit_name:string | undefined,
):Promise<{full_path:string, ext:string} | null> {
    if (explicit_name) {
        const full_path = path.join(input_path, explicit_name)
        await fs.access(full_path)
        return {full_path, ext: path.extname(explicit_name).toLowerCase()}
    }

    for (const ext of IMAGE_EXTS) {
        const full_path = path.join(input_path, `background${ext}`)
        try {
            await fs.access(full_path)
            return {full_path, ext}
        }
        catch {
            // not found, try next
        }
    }
    return null
}

// Resolve the on-disk font directories a schema needs, via typst-fonts/node — one per family,
// curated fonts under fonts_root/<family>/, Noto fallback families under
// fonts_root/_noto/<family>/. Passed to typst as one --font-path per directory so it only
// scans the fonts actually referenced, instead of the whole fonts/ tree (which can hold
// 150+ MB of Noto CJK fallback fonts).
function resolve_font_dirs(schema:CoverSchema, fonts_root:string):string[] {
    return resolve_font_dirs_generic(fonts_root, collect_all_fonts(schema))
}

// Load the curated font manifest once per fonts root — every function that resolves fonts
// (collect_all_fonts, resolve_font_dirs, ...) requires this to have run first
const fonts_loaded = new Map<string, Promise<void>>()
function ensure_fonts_loaded(fonts_root:string):Promise<void> {
    let loaded = fonts_loaded.get(fonts_root)
    if (!loaded) {
        loaded = load_fonts_dir(fonts_root)
        fonts_loaded.set(fonts_root, loaded)
    }
    return loaded
}

// Load typst template files from the assets tree's docs/ dir
async function load_templates(assets_base:string):Promise<Templates> {
    const cover = await fs.readFile(
        asset_path(assets_base, DOCS_DIR, TEMPLATE_FILES.cover), 'utf8')
    const helpers = await fs.readFile(
        asset_path(assets_base, DOCS_DIR, TEMPLATE_FILES.helpers), 'utf8')
    return {cover, helpers}
}

/** Spawn typst compile in the given directory with the specified format */
async function run_typst(
    work_dir:string,
    format:OutputFormat,
    ppi:number,
    font_dirs:string[] = [],
    typst_path = 'typst',
):Promise<void> {
    const ext = FORMAT_EXT[format]
    const args = ['compile']

    // One font path per needed family's directory (typst accepts --font-path repeated)
    for (const font_dir of font_dirs) {
        args.push('--font-path', font_dir)
    }

    args.push('cover.typ', `_output.${ext}`)

    // PNG format accepts a --ppi flag for resolution
    if (format === 'png') {
        args.push('--ppi', String(ppi))
    }

    return new Promise((resolve, reject) => {
        const proc = spawn(typst_path, args, {
            cwd: work_dir,
            stdio: ['ignore', 'ignore', 'pipe'],
        })

        const stderr_lines:string[] = []
        proc.stderr.on('data', (chunk:Buffer) => {
            stderr_lines.push(chunk.toString())
        })

        proc.on('close', (code) => {
            if (code === 0) {
                resolve()
            }
            else {
                reject(new Error(
                    `typst exited with code ${code}.\n` +
                    `Work dir preserved at: ${work_dir}\n\n` +
                    stderr_lines.join('')
                ))
            }
        })

        proc.on('error', (err) => {
            reject(new Error(
                `Failed to spawn ${typst_path}: ${err.message}\nIs typst on your PATH?`))
        })
    })
}

/** Move a file, falling back to copy + delete for cross-device renames */
async function move_file(src:string, dest:string):Promise<void> {
    try {
        await fs.rename(src, dest)
    }
    catch (err:unknown) {
        if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
            await fs.copyFile(src, dest)
            await fs.unlink(src)
        }
        else {
            throw err
        }
    }
}

/** Build a split output path: e.g. cover.svg → cover_front.svg */
function split_path(output_path:string, label:string):string {
    const ext = path.extname(output_path)
    const base = output_path.slice(0, -ext.length)
    return `${base}_${label}${ext}`
}

/** Crop a PNG using sharp — used as the PngCropFn callback */
async function sharp_crop(
    data:Uint8Array,
    x:number,
    y:number,
    w:number,
    h:number,
):Promise<Uint8Array> {
    const buf = await sharp(data)
        .extract({left: x, top: y, width: w, height: h})
        .toBuffer()
    return new Uint8Array(buf)
}

/**
 * Generate a book cover from a schema.
 *
 * @param options - Generation options (schema, paths, format, split)
 * @returns Paths to the generated output file(s)
 */
export async function generate(options:GenerateOptions):Promise<GenerateResult> {
    const format = options.format ?? 'pdf'
    // Default to 144 PPI (2x typographic resolution, 2 × 72pt/in)
    const ppi = options.ppi ?? 144
    const split = options.split ?? false
    const assets_base = options.assets_dir ?? ASSETS_BASE
    const fonts_root = options.fonts_dir ?? path.join(assets_base, 'fonts')

    // Fonts must be loaded before anything below resolves a font family (build(), then
    // resolve_font_dirs() further down)
    await ensure_fonts_loaded(fonts_root)

    // Parse schema and get dimensions from printing-services
    const parsed = cover_schema.parse(options.schema)

    // Resolve background image from disk before calling build()
    const explicit_bg = (options.schema as {images?: {background?: string}})?.images?.background
    const found_image = await find_background_image(options.input_path, explicit_bg).catch(() => null)

    // Read image bytes if found
    let image:{data:Uint8Array, ext:string} | undefined
    if (found_image) {
        const buf = await fs.readFile(found_image.full_path)
        image = {data: new Uint8Array(buf), ext: found_image.ext}
    }

    // Load templates and build all typst files in memory
    const templates = await load_templates(assets_base)
    const {files, dims} = await build(templates, parsed, image)

    // Write to a temp directory and compile
    const tmp_dir = path.join(os.tmpdir(), `paper_cover_${crypto.randomUUID()}`)
    await fs.mkdir(tmp_dir, {recursive: true})

    const ext = FORMAT_EXT[format]
    const tmp_output = path.join(tmp_dir, `_output.${ext}`)

    try {
        // Write every file from the virtual FS to disk
        for (const [filename, bytes] of files) {
            await fs.writeFile(path.join(tmp_dir, filename), bytes)
        }

        // Point typst at only the font directories this schema actually needs
        const font_dirs = resolve_font_dirs(parsed, fonts_root)

        // Write uploaded font families into the work dir so typst can scan them — one subdir
        // per family under _fonts/ (a name the flat virtual-FS filenames never use)
        if (options.custom_fonts?.length) {
            font_dirs.push(
                ...await write_custom_fonts(path.join(tmp_dir, '_fonts'), options.custom_fonts))
        }

        await run_typst(tmp_dir, format, ppi, font_dirs, options.typst_path)
        await move_file(tmp_output, options.output_path)
        await fs.rm(tmp_dir, {recursive: true, force: true})
    }
    catch (err) {
        console.error(`[generator-node] Work dir preserved for debugging: ${tmp_dir}`)
        throw err
    }

    const result:GenerateResult = {output_path: options.output_path}

    // Split the output into front/back/spine panels
    if (split) {
        const split_paths:{front:string, back:string, spine?:string} = {
            front: split_path(options.output_path, 'front'),
            back: split_path(options.output_path, 'back'),
        }
        if (dims.cover_has_spine && dims.cover_spine.gt(0)) {
            split_paths.spine = split_path(options.output_path, 'spine')
        }

        if (format === 'pdf') {
            // PDF: inject CropBox per panel
            const pdf = new Uint8Array(await fs.readFile(options.output_path))
            const parts = split_pdf(pdf, dims)
            await fs.writeFile(split_paths.front, parts.front)
            await fs.writeFile(split_paths.back, parts.back)
            if (parts.spine && split_paths.spine) {
                await fs.writeFile(split_paths.spine, parts.spine)
            }
        }
        else if (format === 'svg') {
            // SVG: split by adjusting viewBox
            const svg = await fs.readFile(options.output_path, 'utf-8')
            const parts = split_svg(svg, dims)
            await fs.writeFile(split_paths.front, parts.front, 'utf-8')
            await fs.writeFile(split_paths.back, parts.back, 'utf-8')
            if (parts.spine && split_paths.spine) {
                await fs.writeFile(split_paths.spine, parts.spine, 'utf-8')
            }
        }
        else {
            // PNG: crop each region with sharp
            const png = new Uint8Array(await fs.readFile(options.output_path))
            const parts = await split_png(png, dims, ppi, sharp_crop)
            await fs.writeFile(split_paths.front, parts.front)
            await fs.writeFile(split_paths.back, parts.back)
            if (parts.spine && split_paths.spine) {
                await fs.writeFile(split_paths.spine, parts.spine)
            }
        }

        result.split_paths = split_paths
    }

    return result
}
