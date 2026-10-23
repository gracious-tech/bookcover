
// Hand-written stand-ins for WebGL, OffscreenCanvas, Image and createImageBitmap, so the
// renderer's logic (resource lifecycle, uniforms, texture uploads, compositing maths) runs under
// Node. Nothing here rasterises — every fake just records what it was asked to do. Actual pixels
// are checked by the widget's Playwright suite

import {vi} from 'vitest'
import type {Mock} from 'vitest'

/** One recorded call on a fake: method name plus arguments */
export interface GlCall {
    name:string
    args:unknown[]
}

/** An opaque GPU object handed out by a create*() call, tagged with what created it */
export interface FakeGlObject {
    kind:string
    id:number
}

/** A uniform location, which names the uniform it was looked up by */
export interface FakeUniform {
    uniform:string
}

// The handful of WebGL enum values the code under test reads off the context. Their values only
// need to be distinct for the assertions to tell them apart
const GL_CONSTANTS = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    TEXTURE_2D: 0x0de1,
    TEXTURE0: 0x84c0,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_SHORT: 0x1403,
    FLOAT: 0x1406,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    LINEAR: 0x2601,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    CLAMP_TO_EDGE: 0x812f,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    STATIC_DRAW: 0x88e4,
    COLOR_BUFFER_BIT: 0x4000,
    DEPTH_BUFFER_BIT: 0x0100,
    DEPTH_TEST: 0x0b71,
    CULL_FACE: 0x0b44,
    TRIANGLES: 0x0004,
}

export type GlConstants = typeof GL_CONSTANTS

/** A recording fake of the WebGLRenderingContext surface the renderer uses. Calls to any method
 *  not given behaviour below are still recorded (via a Proxy), so tests can assert on them */
export class FakeGl {
    calls:GlCall[] = []
    // Whether shaders compile / programs link, and the info logs reported when they don't
    compile_ok = true
    link_ok = true
    shader_log = 'ERROR: 0:1: syntax error'
    program_log = 'ERROR: varying mismatch'
    // Set when the WEBGL_lose_context extension's loseContext() is called
    lost = false
    private next_id = 1

    /** Every call to the named method, in order */
    calls_to(name:string):unknown[][] {
        return this.calls.filter(call => call.name === name).map(call => call.args)
    }

    /** The last value passed to the uniform with this name (by any uniform* setter) */
    uniform(name:string):unknown {
        const setters = this.calls.filter(call => call.name.startsWith('uniform')
            && (call.args[0] as FakeUniform | undefined)?.uniform === name)
        const last = setters.at(-1)
        if (!last)
            return undefined
        // uniformMatrix*fv(loc, transpose, value); every other setter is (loc, value)
        return last.name.startsWith('uniformMatrix') ? last.args[2] : last.args[1]
    }

    /** Hand out a fresh tagged GPU object */
    private make(kind:string):FakeGlObject {
        return {kind, id: this.next_id++}
    }

    /** Behaviour for the methods whose return values the code under test reads */
    private behaviour(name:string, args:unknown[]):unknown {
        switch (name) {
            case 'createShader': return this.make('shader')
            case 'createProgram': return this.make('program')
            case 'createTexture': return this.make('texture')
            case 'createBuffer': return this.make('buffer')
            case 'getShaderParameter': return this.compile_ok
            case 'getProgramParameter': return this.link_ok
            case 'getShaderInfoLog': return this.shader_log
            case 'getProgramInfoLog': return this.program_log
            case 'getUniformLocation': return {uniform: String(args[1])} satisfies FakeUniform
            // Attribute locations are numbered in lookup order
            case 'getAttribLocation': return this.calls_to('getAttribLocation').length - 1
            case 'getExtension':
                return args[0] === 'WEBGL_lose_context'
                    ? {loseContext: () => { this.lost = true }} : null
            default: return undefined
        }
    }

    /** This fake typed as the real context, recording every method call made through it */
    as_context():WebGLRenderingContext {
        const proxy = new Proxy(this, {
            get: (target, prop) => {
                if (typeof prop === 'string' && prop in GL_CONSTANTS)
                    return GL_CONSTANTS[prop as keyof GlConstants]
                if (typeof prop !== 'string' || prop in target)
                    return Reflect.get(target, prop)
                return (...args:unknown[]) => {
                    target.calls.push({name: prop, args})
                    return target.behaviour(prop, args)
                }
            },
        })
        return proxy as unknown as WebGLRenderingContext
    }

    /** The WebGL enum values this fake reports */
    static readonly constants = GL_CONSTANTS
}

/** A recording fake 2D context: logs draws and fills, and remembers property assignments made
 *  at the time of each draw (shadow/filter settings), which is what compositing tests check */
export class FakeContext2D {
    draws:{source:unknown, args:number[], filter:string, shadow_color:string,
        shadow_offset:[number, number], composite:string}[] = []
    fills:{style:unknown, rect:number[], composite:string}[] = []
    gradients:{kind:string, args:number[], stops:[number, string][]}[] = []
    fillStyle:unknown = '#000000'
    filter = 'none'
    shadowColor = 'transparent'
    shadowBlur = 0
    shadowOffsetX = 0
    shadowOffsetY = 0
    globalCompositeOperation = 'source-over'

    /** Record a draw with the state in force at the time */
    drawImage(source:unknown, ...args:number[]):void {
        this.draws.push({source, args, filter: this.filter, shadow_color: this.shadowColor,
            shadow_offset: [this.shadowOffsetX, this.shadowOffsetY],
            composite: this.globalCompositeOperation})
    }

    /** Record a filled rectangle */
    fillRect(...rect:number[]):void {
        this.fills.push({style: this.fillStyle, rect, composite: this.globalCompositeOperation})
    }

    /** A gradient that records its colour stops */
    private gradient(kind:string, args:number[]):{addColorStop:(at:number, color:string) => void} {
        const entry = {kind, args, stops: [] as [number, string][]}
        this.gradients.push(entry)
        return {addColorStop: (at:number, color:string) => { entry.stops.push([at, color]) }}
    }

    /** Record a linear gradient */
    createLinearGradient(...args:number[]):{addColorStop:(at:number, color:string) => void} {
        return this.gradient('linear', args)
    }

    /** Record a radial gradient */
    createRadialGradient(...args:number[]):{addColorStop:(at:number, color:string) => void} {
        return this.gradient('radial', args)
    }
}

/** A fake ImageBitmap */
export interface FakeBitmap {
    width:number
    height:number
    // What it was made from (a canvas, an image, ...)
    source:unknown
    close:Mock
}

/** A fake OffscreenCanvas: webgl contexts come from `webgl_factory` (null = unsupported), 2D
 *  contexts are recording fakes, and encoding yields a text Blob naming the canvas size */
export class FakeOffscreenCanvas {
    // Every instance created, newest last
    static instances:FakeOffscreenCanvas[] = []
    // What getContext('webgl') returns for new canvases — a fresh FakeGl each time by default
    static webgl_factory:() => FakeGl | null = () => new FakeGl()

    width:number
    height:number
    gl:FakeGl | null = null
    ctx2d:FakeContext2D | null = null

    /** Record the instance */
    constructor(width:number, height:number) {
        this.width = width
        this.height = height
        FakeOffscreenCanvas.instances.push(this)
    }

    /** A webgl or 2D context, created once per canvas */
    getContext(kind:string):WebGLRenderingContext | FakeContext2D | null {
        if (kind === '2d') {
            this.ctx2d ??= new FakeContext2D()
            return this.ctx2d
        }
        this.gl ??= FakeOffscreenCanvas.webgl_factory()
        return this.gl ? this.gl.as_context() : null
    }

    /** Snapshot the canvas as a bitmap */
    transferToImageBitmap():FakeBitmap {
        return {width: this.width, height: this.height, source: this, close: vi.fn()}
    }

    /** Encode as a Blob whose text names the type and size */
    async convertToBlob(opts:{type:string}):Promise<Blob> {
        return new Blob([`${opts.type}:${this.width}x${this.height}`], {type: opts.type})
    }
}

/** A fake createImageBitmap(): a bitmap the size of its source (or 10x10 for sizeless ones) */
export function make_create_image_bitmap():Mock {
    return vi.fn(async (source:{width?:number, height?:number}):Promise<FakeBitmap> => ({
        width: source.width ?? 10, height: source.height ?? 10, source, close: vi.fn(),
    }))
}

/** A fake <img>: setting src loads (or, with fail_next set, errors) on a later microtask */
export class FakeImage {
    // Every instance created, newest last
    static instances:FakeImage[] = []
    // Make the next image fail to load
    static fail_next = false

    onload:(() => void) | null = null
    onerror:(() => void) | null = null
    decode = vi.fn(async () => {})
    private _src = ''

    /** Record the instance */
    constructor() {
        FakeImage.instances.push(this)
    }

    /** The URL being loaded */
    get src():string {
        return this._src
    }

    /** Start "loading" the URL */
    set src(url:string) {
        this._src = url
        const fail = FakeImage.fail_next
        FakeImage.fail_next = false
        queueMicrotask(() => (fail ? this.onerror : this.onload)?.())
    }
}
