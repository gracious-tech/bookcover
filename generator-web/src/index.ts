
// Browser cover generator — compiles typst files via WebAssembly, supports PDF/SVG/PNG output

import {createTypstCompiler, CompileFormatEnum} from '@myriaddreamin/typst.ts/compiler'
import {createTypstRenderer} from '@myriaddreamin/typst.ts/renderer'
import type {TypstCompiler} from '@myriaddreamin/typst.ts/compiler'
import type {TypstRenderer} from '@myriaddreamin/typst.ts/renderer'
import {loadFonts} from '@myriaddreamin/typst.ts'
import {build, cover_schema, split_svg, split_png, split_pdf, frame_image, frame_asset_path,
    asset_path, TYPST_DIR, TEMPLATE_FILES, collect_all_fonts} from 'bookcover-core'
import type {OutputFormat, SplitResult, Templates} from 'bookcover-core'
import {base_font} from 'typst-fonts'
import {load_fonts_prefix, font_urls_for as build_font_urls, fetch_font_bytes,
    fonts_to_blob_urls, revoke_blob_urls} from 'typst-fonts/web'

export type {CoverSchema, TitlePosition, FontConfig,
    OutputFormat, SplitResult, PatternDef} from 'bookcover-core'
export type {BundledFont, CjkVariant, CustomFont} from 'typst-fonts'
export {font_file_url} from 'typst-fonts/web'
export {get_fonts, get_bundled_font} from 'typst-fonts'
export {list_patterns, collect_fonts, collect_all_fonts, default_spine_title} from 'bookcover-core'

// Form state + form->schema conversion, so hosts can derive the renderable schema themselves
export {make_blank_form_values, build_schema, curly_quotes, parse_font_family, find_pattern,
    derive_colors, hex_override_to_hsl, hex_to_hsl, is_dark_color} from 'bookcover-core'
export type {FormState, EmbedFormState, CustomFontStyle, DerivedColors} from 'bookcover-core'

// Embed protocol types for iframing the widget
export type {InitMessage, WidgetMessage, AppLocale} from './embed_types.js'

const decoder = new TextDecoder()

export interface InitOptions {
    // URL or path to typst_ts_web_compiler_bg.wasm — required
    wasm_url:string
    // URL or path to typst_ts_renderer_bg.wasm — required for SVG/PNG output
    renderer_wasm_url?:string
    // URL prefix for generator assets (e.g. '/generator_assets/').
    // Used to load typst templates, frames, backgrounds, etc.
    assets_prefix?:string
    // URL prefix for fonts — curated and Noto fallback alike (e.g.
    // 'http://localhost:5300/generator_assets/fonts' in dev, 'https://assets.paper.bible/fonts' in
    // production). Kept separate from assets_prefix since the fonts tree is managed and
    // published by its own separate repo.
    fonts_prefix?:string
}

export interface GenerateOptions {
    schema:unknown
    // Background image as a Blob (content type included)
    image?:Blob
    // Output format: 'pdf' (default), 'svg', or 'png'
    format?:OutputFormat
    // PPI for PNG output (default 144)
    ppi?:number
    // Whether to split the result into front/back/spine panels
    split?:boolean
    // Raw TTF bytes for user-uploaded custom fonts
    custom_fonts?:Uint8Array[]
}

export interface GenerateResult {
    // The full cover data (PDF/PNG bytes, or SVG string)
    data:Uint8Array | string
    // Split panel data (only present when split is true and format is svg/png)
    split?:SplitResult<Uint8Array> | SplitResult<string>
}


/** Format compilation diagnostics into a readable error */
function throw_compile_error(diagnostics:unknown):never {
    const diag = Array.isArray(diagnostics)
        ? diagnostics.map((d) => (typeof d === 'string' ? d : JSON.stringify(d))).join('\n')
        : 'unknown error'
    throw new Error(`[generator-web] Typst compilation failed:\n${diag}`)
}

/** Create a 2D canvas — a DOM element on the main thread, OffscreenCanvas inside a worker */
function make_canvas(width:number, height:number):HTMLCanvasElement | OffscreenCanvas {
    if (typeof document === 'undefined') {
        return new OffscreenCanvas(width, height)
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
}

/** Encode a canvas' contents as PNG bytes (handles both canvas types) */
async function canvas_png_bytes(canvas:HTMLCanvasElement | OffscreenCanvas):Promise<Uint8Array> {
    const blob = 'convertToBlob' in canvas
        ? await canvas.convertToBlob({type: 'image/png'})
        : await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b!), 'image/png')
        })
    return new Uint8Array(await blob.arrayBuffer())
}

/** Crop a region from a PNG using the Canvas API — used as PngCropFn */
async function canvas_crop(
    data:Uint8Array,
    x:number,
    y:number,
    w:number,
    h:number,
):Promise<Uint8Array> {
    const blob = new Blob([data as BlobPart], {type: 'image/png'})
    const bitmap = await createImageBitmap(blob)

    const canvas = make_canvas(w, h)
    const ctx = (canvas as HTMLCanvasElement).getContext('2d')!
    ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h)
    bitmap.close()

    return canvas_png_bytes(canvas)
}

/** Stateful cover generator — each instance owns its own compiler and renderer */
export class CoverGenerator {
    private opts:InitOptions
    // Created lazily on first generate() — the font set isn't known until a schema arrives,
    // so creating one earlier would just instantiate WASM with fonts that get replaced
    private compiler!:TypstCompiler
    private renderer:TypstRenderer | null

    // Cache key of the font set the current compiler was init'd with ('' = no compiler yet)
    private active_fonts = ''
    // Fetched font bytes keyed by URL, so a compiler reinit (any font-set change) never
    // refetches families already seen this session
    private font_bytes = new Map<string, Uint8Array>()
    // Blob URLs handed to the current compiler (bundled + custom) — revoked on reinit
    private font_blob_urls:string[] = []
    // Identity-based ids for custom font byte arrays (see custom_font_id)
    private custom_font_ids = new WeakMap<Uint8Array, number>()
    private next_custom_font_id = 1

    constructor(opts:InitOptions, renderer:TypstRenderer | null) {
        this.opts = opts
        this.renderer = renderer
    }

    /** Build fetch URLs for the given font families against fonts_prefix — curated families
     *  live at <prefix>/<family>/, Noto fallback families at <prefix>/_noto/<family>/,
     *  mirroring the top-level fonts/ directory's own layout exactly */
    private font_urls_for(families:string[]):string[] {
        return build_font_urls(this.opts.fonts_prefix ?? '/fonts/', families)
    }

    /** Fetch a font file's bytes, memoised in font_bytes (failures aren't cached, so a
     *  later generate retries the fetch) */
    private async fetch_font(url:string):Promise<Uint8Array> {
        const cached = this.font_bytes.get(url)
        if (cached) {
            return cached
        }
        const bytes = await fetch_font_bytes(url)
        this.font_bytes.set(url, bytes)
        return bytes
    }

    /** Pre-fetch the given font families into the in-memory byte cache */
    async prefetch_fonts(families:string[]):Promise<void> {
        await Promise.all(this.font_urls_for(families).map(url => this.fetch_font(url)))
    }

    /** Stable id for a custom font's byte array. The widget passes the same Uint8Array
     *  references across generates, so object identity distinguishes fonts without hashing
     *  their bytes (byteLength alone could collide between two different fonts). */
    private custom_font_id(data:Uint8Array):number {
        let id = this.custom_font_ids.get(data)
        if (id === undefined) {
            id = this.next_custom_font_id
            this.next_custom_font_id += 1
            this.custom_font_ids.set(data, id)
        }
        return id
    }

    /** (Re)initialise the compiler with a different font set. Bundled font bytes come from
     *  the in-memory cache (fetched at most once per session) and everything is handed to
     *  loadFonts() as blob URLs, keeping the network out of the reinit path. The renderer
     *  never needs reinitialisation because it reads glyph outlines from compiled vector
     *  data. */
    private async reinit_compiler(font_urls:string[], custom_fonts?:Uint8Array[]):Promise<void> {
        // Fetch any fonts not yet cached, in parallel
        const bundled_bytes = await Promise.all(font_urls.map(url => this.fetch_font(url)))

        // Revoke the previous compiler's blob URLs to avoid memory leaks
        revoke_blob_urls(this.font_blob_urls)

        // One blob URL per font file (bundled + custom) for loadFonts() to read —
        // mapShadow only adds to the virtual filesystem, not the font book
        this.font_blob_urls = fonts_to_blob_urls([...bundled_bytes, ...(custom_fonts ?? [])])

        // assets:false stops typst.ts silently appending its default text fonts (NewCM,
        // Libertinus, DejaVu... fetched from jsdelivr) — all fonts we need are passed explicitly
        const compiler_font_opts = loadFonts(this.font_blob_urls, {assets: false})

        const c = createTypstCompiler()
        await c.init({
            getModule: () => ({module_or_path: this.opts.wasm_url}),
            beforeBuild: [compiler_font_opts],
        })

        this.compiler = c
    }

    /** Load the typst file map into the compiler's shadow filesystem */
    private load_files(files:Map<string, Uint8Array>):void {
        this.compiler.resetShadow()
        for (const [filename, bytes] of files) {
            const vpath = `/${filename}`
            if (filename.endsWith('.typ')) {
                this.compiler.addSource(vpath, decoder.decode(bytes))
            }
            else {
                this.compiler.mapShadow(vpath, bytes)
            }
        }
    }

    /** Compile to PDF and return raw bytes */
    private async compile_pdf():Promise<Uint8Array> {
        const result = await this.compiler.compile({
            mainFilePath: '/cover.typ',
            format: CompileFormatEnum.pdf,
        })
        if (!result.result) {
            throw_compile_error(result.diagnostics)
        }
        return result.result!
    }

    /** Compile to vector format, then render as SVG string covering the full canvas */
    private async compile_svg():Promise<string> {
        this.assert_renderer('SVG')
        const result = await this.compiler.compile({
            mainFilePath: '/cover.typ',
            format: CompileFormatEnum.vector,
        })
        if (!result.result) {
            throw_compile_error(result.diagnostics)
        }

        const svg = await this.renderer!.renderSvg({
            artifactContent: result.result!,
            format: 'vector',
            data_selection: {js: false, css: true, body: true, defs: true},
        })

        // Patch unitless width/height to add `pt` suffix (Typst SVG output uses pt) so
        // browsers render at 96 CSS px per inch, matching the split SVGs from split_svg()
        return svg.replace(/<svg([^>]*)>/, (_match, attrs:string) => {
            const patched = attrs
                .replace(/width="([\d.]+)"/, 'width="$1pt"')
                .replace(/height="([\d.]+)"/, 'height="$1pt"')
            return `<svg${patched}>`
        })
    }

    /** Compile to vector format, then render as PNG via offscreen canvas */
    private async compile_png(ppi:number):Promise<Uint8Array> {
        this.assert_renderer('PNG')
        const result = await this.compiler.compile({
            mainFilePath: '/cover.typ',
            format: CompileFormatEnum.vector,
        })
        if (!result.result) {
            throw_compile_error(result.diagnostics)
        }

        // Render to a canvas at the desired PPI (typst uses 72pt/inch)
        const scale = ppi / 72
        const canvas = document.createElement('canvas')

        await this.renderer!.renderCanvas({
            artifactContent: result.result!,
            format: 'vector',
            canvas,
            pageOffset: 0,
            pixelPerPt: scale,
            backgroundColor: '#ffffff',
        })

        // Extract PNG from canvas
        const blob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b!), 'image/png')
        })
        return new Uint8Array(await blob.arrayBuffer())
    }

    /** Throw if the renderer was not initialised */
    private assert_renderer(format:string):void {
        if (!this.renderer) {
            throw new Error(
                `[generator-web] ${format} output requires renderer_wasm_url in init() options`
            )
        }
    }

    /** Generate a book cover using this instance's compiler and renderer */
    async generate(options:GenerateOptions):Promise<GenerateResult> {
        const format = options.format ?? 'pdf'
        // Default to 144 PPI (2x typographic resolution, 2 × 72pt/in)
        const ppi = options.ppi ?? 144
        const split = options.split ?? false

        // Parse schema and get dimensions from printing-services
        const parsed = cover_schema.parse(options.schema)
        const assets = this.opts.assets_prefix ?? '/assets/'

        // (Re)initialise the compiler when the set of required fonts changes — including on
        // the very first generate, since the compiler is created lazily ('' never matches).
        // Noto Serif (base font) is always included — it's not bundled in the WASM assets.
        // collect_all_fonts also includes every Noto fallback family needed to cover non-Latin
        // scripts detected in the schema's text, so only those specific families get fetched.
        const needed_fonts = collect_all_fonts(parsed)
        const custom_fonts_id = options.custom_fonts
            ? options.custom_fonts.map(b => String(this.custom_font_id(b))).join(':')
            : ''
        const cache_key = needed_fonts.join(',') + '|' + custom_fonts_id
        if (cache_key !== this.active_fonts) {
            await this.reinit_compiler(this.font_urls_for(needed_fonts), options.custom_fonts)
            this.active_fonts = cache_key
        }

        // Convert Blob to ImageInput (Uint8Array + extension) for the core builder
        let image_input:{data:Uint8Array, ext:string} | undefined
        if (options.image) {
            const blob = options.image
            const ext = '.' + (blob.type.split('/')[1] ?? 'jpg').replace('jpeg', 'jpg')
            image_input = {data: new Uint8Array(await blob.arrayBuffer()), ext}
        }

        // Load typst templates from assets
        const [cover_typ, helpers_typ] = await Promise.all([
            fetch(asset_path(assets, TYPST_DIR, TEMPLATE_FILES.cover)).then(r => r.text()),
            fetch(asset_path(assets, TYPST_DIR, TEMPLATE_FILES.helpers)).then(r => r.text()),
        ])
        const templates:Templates = {cover: cover_typ, helpers: helpers_typ}

        // Load the frame PNG from assets when the schema uses painted coverage
        let frame_blob:Blob | undefined
        if (parsed.bg_image_coverage === 'painted') {
            const url = frame_asset_path(assets, 'painted')
            const resp = await fetch(url)
            frame_blob = await resp.blob()
        }

        const {files, dims} = await build(templates, parsed, image_input, frame_image, frame_blob)
        this.load_files(files)

        // Compile to the requested format
        let data:Uint8Array | string

        if (format === 'pdf') {
            data = await this.compile_pdf()
        }
        else if (format === 'svg') {
            data = await this.compile_svg()
        }
        else {
            data = await this.compile_png(ppi)
        }

        const result:GenerateResult = {data}

        // Split into front/back/spine panels
        if (split) {
            if (format === 'pdf') {
                result.split = split_pdf(data as Uint8Array, dims)
            }
            else if (format === 'svg') {
                result.split = split_svg(data as string, dims)
            }
            else {
                result.split = await split_png(data as Uint8Array, dims, ppi, canvas_crop)
            }
        }

        return result
    }

    /** Revoke blob URLs and drop cached font bytes to free memory */
    destroy():void {
        revoke_blob_urls(this.font_blob_urls)
        this.font_blob_urls = []
        this.font_bytes.clear()
    }
}

/**
 * Create a CoverGenerator instance with an optional initialised WASM renderer.
 * The compiler itself is created lazily by the first generate() call, once the schema's
 * font set is known. Each instance is independent — multiple generators can run concurrently.
 */
export async function init(options:InitOptions):Promise<CoverGenerator> {
    // Load the curated font manifest before anything else below resolves a font family
    await load_fonts_prefix(options.fonts_prefix ?? '/fonts/')

    // Renderer only needs base fonts (glyph shapes are embedded in compiled vector data)
    let renderer:TypstRenderer | null = null
    if (options.renderer_wasm_url) {
        const renderer_font_opts = loadFonts([])
        const r = createTypstRenderer()
        await r.init({
            getModule: () => ({module_or_path: options.renderer_wasm_url!}),
            beforeBuild: [renderer_font_opts],
        })
        renderer = r
    }

    const gen = new CoverGenerator(options, renderer)

    // Warm the font byte cache with the always-needed base font while the rest of the app
    // finishes loading — a failure here is fine, the first generate simply refetches
    gen.prefetch_fonts([base_font()]).catch(() => {})

    return gen
}
