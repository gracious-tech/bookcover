
// Browser cover generator — compiles typst files via WebAssembly, supports PDF/SVG/PNG output

import {createTypstCompiler, CompileFormatEnum} from '@myriaddreamin/typst.ts/compiler'
import {createTypstRenderer} from '@myriaddreamin/typst.ts/renderer'
import type {TypstCompiler} from '@myriaddreamin/typst.ts/compiler'
import type {TypstRenderer} from '@myriaddreamin/typst.ts/renderer'
import {loadFonts} from '@myriaddreamin/typst.ts'
import {build, cover_schema, split_svg, split_png, split_pdf, frame_image, frame_asset_path,
    asset_path, FONTS_DIR, TYPST_DIR, TEMPLATE_FILES,
    collect_fonts, get_bundled_font} from 'bookcover'
import type {OutputFormat, SplitResult, Templates} from 'bookcover'

export type {CoverSchema, TitlePosition, FontConfig,
    OutputFormat, SplitResult, PatternDef, BundledFont} from 'bookcover'
export {list_patterns, get_fonts, get_bundled_font, collect_fonts, default_spine_title} from 'bookcover'

const decoder = new TextDecoder()

export interface InitOptions {
    // URL or path to typst_ts_web_compiler_bg.wasm — required
    wasm_url:string
    // URL or path to typst_ts_renderer_bg.wasm — required for SVG/PNG output
    renderer_wasm_url?:string
    // URL prefix for generator assets (e.g. '/generator_assets/').
    // Used to load fonts, typst templates, frames, backgrounds, etc.
    assets_prefix?:string
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

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, x, y, w, h, 0, 0, w, h)
    bitmap.close()

    const out_blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png')
    })
    return new Uint8Array(await out_blob.arrayBuffer())
}

/** Stateful cover generator — each instance owns its own compiler and renderer */
export class CoverGenerator {
    private opts:InitOptions
    private compiler:TypstCompiler
    private renderer:TypstRenderer | null

    // Sorted, comma-joined font families last used to init the compiler ('' = base fonts only)
    private active_fonts = ''
    // Blob URLs created for custom fonts — revoked on reinit to avoid leaks
    private custom_font_blob_urls:string[] = []

    constructor(opts:InitOptions, compiler:TypstCompiler, renderer:TypstRenderer | null) {
        this.opts = opts
        this.compiler = compiler
        this.renderer = renderer
    }

    /** (Re)initialise compiler with different fonts. The renderer does not need
     *  reinitialisation because it reads glyph outlines from the compiled vector data. */
    private async reinit_compiler(font_urls:string[], custom_fonts?:Uint8Array[]):Promise<void> {
        // Revoke previous custom font blob URLs to avoid memory leaks
        for (const url of this.custom_font_blob_urls) {
            URL.revokeObjectURL(url)
        }
        this.custom_font_blob_urls = []

        // Create blob URLs for custom font bytes so loadFonts() can fetch them —
        // mapShadow only adds to the virtual filesystem, not the font book
        if (custom_fonts) {
            for (const data of custom_fonts) {
                const blob = new Blob([data as BlobPart], {type: 'font/ttf'})
                this.custom_font_blob_urls.push(URL.createObjectURL(blob))
            }
        }

        // Compiler gets bundled + custom font URLs so Typst can shape text with them
        const compiler_font_opts = loadFonts([...font_urls, ...this.custom_font_blob_urls])

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

        // Reinitialise the compiler when the set of required fonts changes.
        // Noto Serif (base font) is always included — it's not bundled in the WASM assets.
        const needed_fonts = collect_fonts(parsed)
        const custom_fonts_id = options.custom_fonts
            ? options.custom_fonts.map(b => b.byteLength).join(':')
            : ''
        const cache_key = needed_fonts.join(',') + '|' + custom_fonts_id
        if (cache_key !== this.active_fonts) {
            // Build URLs for bundled fonts via asset_path
            const font_urls:string[] = []
            for (const family of needed_fonts) {
                const bundled = get_bundled_font(family)
                if (bundled) {
                    for (const file of bundled.files) {
                        font_urls.push(
                            asset_path(assets, FONTS_DIR, encodeURIComponent(family), file))
                    }
                }
            }
            await this.reinit_compiler(font_urls, options.custom_fonts)
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

    /** Revoke blob URLs to free memory */
    destroy():void {
        for (const url of this.custom_font_blob_urls) {
            URL.revokeObjectURL(url)
        }
        this.custom_font_blob_urls = []
    }
}

/**
 * Create a CoverGenerator instance with an initialised WASM compiler and optional renderer.
 * Each instance is independent — multiple generators can run concurrently.
 */
export async function init(options:InitOptions):Promise<CoverGenerator> {
    // Compiler with base fonts only (reinitialised per-generate when custom fonts are needed)
    const compiler_font_opts = loadFonts([])
    const c = createTypstCompiler()
    await c.init({
        getModule: () => ({module_or_path: options.wasm_url}),
        beforeBuild: [compiler_font_opts],
    })

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

    return new CoverGenerator(options, c, renderer)
}
