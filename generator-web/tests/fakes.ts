
// Hand-written stand-ins for the browser and WASM APIs generator-web drives, so CoverGenerator's
// own logic (font-set caching, memory resets, retries, image downscaling, splitting) runs under
// Node with no typst.ts WASM, no canvas and no network. Each fake records what was asked of it

import {vi} from 'vitest'
import type {Mock} from 'vitest'

// A minimal PDF body with a MediaBox, which is all split_pdf() looks for when injecting CropBoxes
export const FAKE_PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /MediaBox [0 0 100 100] >>\n')

// Vector artifact bytes handed from the fake compiler to the fake renderer
export const FAKE_VECTOR = new Uint8Array([1, 2, 3])

// The typst.ts renderer emits unitless width/height on the root element
export const FAKE_SVG = '<svg class="typst-doc" width="864.5" height="648" viewBox="0 0 864.5 648"><g/></svg>'

/** The parts of typst.ts's compile() argument the fake looks at */
interface CompileArgs {
    mainFilePath:string
    format:string
}

/** A fake TypstCompiler: a shadow filesystem plus recorded calls */
export interface FakeCompiler {
    init:Mock
    reset:Mock
    resetShadow:Mock
    addSource:Mock
    mapShadow:Mock
    compile:Mock
    sources:Map<string, string>
    shadow:Map<string, Uint8Array>
}

/** A fake TypstRenderer */
export interface FakeRenderer {
    init:Mock
    renderSvg:Mock
    renderCanvas:Mock
}

/** Create a fake compiler whose compile() defers to `compile_impl`, so a test can swap in
 *  failures. By default PDF compiles return FAKE_PDF and vector compiles FAKE_VECTOR */
export function make_fake_compiler(
    compile_impl:(args:CompileArgs) => Promise<{result?:Uint8Array, diagnostics?:unknown}>,
):FakeCompiler {
    const sources = new Map<string, string>()
    const shadow = new Map<string, Uint8Array>()
    return {
        sources,
        shadow,
        init: vi.fn(async () => {}),
        reset: vi.fn(async () => {}),
        // Clearing the shadow drops everything previously added
        resetShadow: vi.fn(() => {
            sources.clear()
            shadow.clear()
        }),
        addSource: vi.fn((path:string, text:string) => {
            sources.set(path, text)
        }),
        mapShadow: vi.fn((path:string, bytes:Uint8Array) => {
            shadow.set(path, bytes)
        }),
        compile: vi.fn(compile_impl),
    }
}

/** Default compile behaviour — succeed with format-appropriate bytes */
export async function default_compile(args:CompileArgs):Promise<{result:Uint8Array}> {
    return {result: args.format === 'pdf' ? FAKE_PDF : FAKE_VECTOR}
}

/** Create a fake renderer: renderSvg returns FAKE_SVG, renderCanvas sizes the canvas it's given */
export function make_fake_renderer():FakeRenderer {
    return {
        init: vi.fn(async () => {}),
        renderSvg: vi.fn(async () => FAKE_SVG),
        renderCanvas: vi.fn(async (opts:{canvas:FakeCanvas, pixelPerPt:number}) => {
            opts.canvas.width = Math.round(864.5 * opts.pixelPerPt)
            opts.canvas.height = Math.round(648 * opts.pixelPerPt)
        }),
    }
}

/** A recorded drawImage() call: the source and the numeric arguments */
interface DrawCall {
    source:unknown
    args:number[]
}

/** A fake 2D context — records drawImage calls and returns a solid colour from getImageData */
export class FakeContext2D {
    draws:DrawCall[] = []
    // RGBA every getImageData() pixel reports
    fill:[number, number, number, number] = [200, 40, 40, 255]

    /** Record a draw */
    drawImage(source:unknown, ...args:number[]):void {
        this.draws.push({source, args})
    }

    /** A solid block of `fill`-coloured pixels */
    getImageData(_x:number, _y:number, w:number, h:number):{data:Uint8ClampedArray} {
        const data = new Uint8ClampedArray(w * h * 4)
        for (let i = 0; i < data.length; i += 4)
            data.set(this.fill, i)
        return {data}
    }
}

/** Shared base for both canvas fakes: a size and a lazily created 2D context */
class FakeCanvasBase {
    width:number
    height:number
    ctx = new FakeContext2D()
    // Whether getContext() should fail, as a context-less environment would
    no_context = false

    /** Size the canvas */
    constructor(width = 300, height = 150) {
        this.width = width
        this.height = height
    }

    /** The 2D context, or null when no_context is set */
    getContext(_kind:string):FakeContext2D | null {
        return this.no_context ? null : this.ctx
    }

    /** What an encoded image of this canvas contains — its type and size, as text */
    protected encoded(type:string):Blob {
        return new Blob([`${type}:${this.width}x${this.height}`], {type})
    }
}

/** A fake OffscreenCanvas (the worker path) — encodes via convertToBlob() */
export class FakeOffscreenCanvas extends FakeCanvasBase {
    // Every instance created, newest last
    static instances:FakeOffscreenCanvas[] = []
    // When set, the next instance created gets no 2D context
    static next_no_context = false

    /** Record the instance */
    constructor(width:number, height:number) {
        super(width, height)
        this.no_context = FakeOffscreenCanvas.next_no_context
        FakeOffscreenCanvas.next_no_context = false
        FakeOffscreenCanvas.instances.push(this)
    }

    /** Encode the canvas as an image Blob */
    async convertToBlob(opts:{type:string, quality?:number}):Promise<Blob> {
        return this.encoded(opts.type)
    }
}

/** A fake DOM <canvas> (the main-thread path) — encodes via toBlob() */
export class FakeCanvas extends FakeCanvasBase {
    /** Encode the canvas as an image Blob, callback-style */
    toBlob(callback:(blob:Blob) => void, type = 'image/png'):void {
        callback(this.encoded(type))
    }
}

/** A fake ImageBitmap of a given size */
export interface FakeBitmap {
    width:number
    height:number
    close:Mock
}

/** A fake createImageBitmap() whose decoded size is set per test, and which can be made to fail */
export function make_create_image_bitmap(size:{width:number, height:number}):Mock {
    return vi.fn(async (_source:unknown):Promise<FakeBitmap> => ({...size, close: vi.fn()}))
}

/** A fake `document` exposing only createElement('canvas'), for the main-thread code paths */
export function make_fake_document():{createElement:Mock, canvases:FakeCanvas[]} {
    const canvases:FakeCanvas[] = []
    return {
        canvases,
        createElement: vi.fn((tag:string) => {
            if (tag !== 'canvas')
                throw new Error(`fake document can't create <${tag}>`)
            const canvas = new FakeCanvas()
            canvases.push(canvas)
            return canvas
        }),
    }
}

/** Read a Blob or byte array back as text (fake encoders write their type and size as text) */
export async function as_text(data:Blob | Uint8Array):Promise<string> {
    return data instanceof Blob ? data.text() : new TextDecoder().decode(data)
}
